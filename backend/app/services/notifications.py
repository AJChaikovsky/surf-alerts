
import os
from collections import defaultdict
from datetime import datetime, timezone
from html import escape
from zoneinfo import ZoneInfo

from sqlalchemy.dialects.postgresql import insert

from app.database import SessionLocal
from app.models import NotificationDelivery
from app.services.email import send_email


SURF_TIMEZONE = ZoneInfo("America/Los_Angeles")


def group_matches_by_day(matches: list[dict]):
    """Group UTC forecast hours by California surf date."""
    grouped = defaultdict(list)

    for hour in matches:
        utc_time = datetime.fromisoformat(
            hour["time"]
        ).replace(tzinfo=timezone.utc)

        local_time = utc_time.astimezone(SURF_TIMEZONE)

        grouped[local_time.date()].append(
            (local_time, hour)
        )

    return sorted(grouped.items())


async def notify_matching_hours(
    alert,
    spot,
    matches: list[dict],
    send_budget: int = 1
) -> int:
    """Send at most one email per alert per surf day."""

    if not matches:
        return 0

    enabled = (
        os.getenv(
            "EMAIL_NOTIFICATIONS_ENABLED", "false"
        ).lower() == "true"
    )

    if enabled and send_budget <= 0:
        return 0

    attempts = 0
    grouped_days = group_matches_by_day(matches)

    for surf_date, entries in grouped_days:
        if enabled and attempts >= send_budget:
            break

        entries = sorted(entries, key=lambda item: item[0])

        first_time, first_hour = entries[0]

        subject = (
            f"Surf Alert: {spot.name} - "
            f"{surf_date.isoformat()}"
        )

        safe_spot = escape(spot.name)
        safe_alert = escape(alert.name)

        html = f"""
        <h2>Good surf conditions are forecasted!</h2>

        <p>Your alert <strong>{safe_alert}</strong>
        has matching conditions at
        <strong>{safe_spot}</strong>.</p>

        <p><strong>Date:</strong> {surf_date}</p>

        <p><strong>First matching hour:</strong>
        {first_time.strftime('%I:%M %p')} Pacific</p>

        <p><strong>Wave height:</strong>
        {first_hour['wave_height_ft']} ft</p>

        <p><strong>Swell period:</strong>
        {first_hour['swell_period_s']} seconds</p>

        <p><strong>Matching forecast hours:</strong>
        {len(entries)}</p>

        <p><small>These are offshore model forecasts,
        not exact breaking-wave heights.</small></p>
        """

        # Preview without sending or writing to database
        if not enabled:
            print(
                f"DRY RUN: Would email '{subject}' "
                f"({len(entries)} matching hours)",
                flush=True
            )
            continue

        recipient = os.environ["TEST_EMAIL_TO"]

        # Claim the notification before sending
        statement = (
            insert(NotificationDelivery)
            .values(
                alert_id=alert.id,
                surf_date=surf_date,
                recipient=recipient,
                status="pending"
            )
            .on_conflict_do_nothing(
                constraint="uq_notification_alert_date"
            )
            .returning(NotificationDelivery.id)
        )

        with SessionLocal.begin() as db:
            delivery_id = db.scalar(statement)

        # Already attempted for this alert and surf day
        if delivery_id is None:
            continue

        attempts += 1

        try:
            response = await send_email(
                to=recipient,
                subject=subject,
                html=html
            )

            message_id = (
                response.get("id")
                if isinstance(response, dict)
                else getattr(response, "id", None)
            )

            if not message_id:
                raise ValueError(
                    "Resend returned no message ID"
                )

            with SessionLocal.begin() as db:
                delivery = db.get(
                    NotificationDelivery, delivery_id
                )
                delivery.status = "sent"
                delivery.provider_message_id = message_id
                delivery.sent_at = datetime.now(timezone.utc)

            print(
                f"EMAIL SENT: {subject}",
                flush=True
            )

        except Exception as exc:
            with SessionLocal.begin() as db:
                delivery = db.get(
                    NotificationDelivery, delivery_id
                )
                delivery.status = "failed"

            print(
                f"EMAIL FAILED: {subject}: {exc}",
                flush=True
            )

    return attempts
