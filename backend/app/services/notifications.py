
import logging
import os

from collections import defaultdict
from datetime import datetime, timezone
from html import escape
from zoneinfo import ZoneInfo

from sqlalchemy.dialects.postgresql import (
    insert as pg_insert,
)

from app.database import SessionLocal

from app.models import (
    NotificationDelivery,
    User,
)

from app.services.email import send_email


logger = logging.getLogger(__name__)

PACIFIC = ZoneInfo("America/Los_Angeles")


# -------- GROUP MATCHES BY LOCAL SURF DATE --------

def group_matches_by_day(matches: list[dict]):
    grouped = defaultdict(list)

    for match in matches:
        timestamp = datetime.fromisoformat(
            match["time"].replace("Z", "+00:00")
        )

        if timestamp.tzinfo is None:
            # The monitoring worker requests UTC forecasts.
            timestamp = timestamp.replace(
                tzinfo=timezone.utc
            )

        local_time = timestamp.astimezone(PACIFIC)

        grouped[local_time.date()].append(
            (local_time, match)
        )

    return sorted(
        grouped.items(),
        key=lambda item: item[0]
    )


# -------- SEND OWNER-SPECIFIC NOTIFICATIONS --------

async def notify_matching_hours(
    alert,
    spot,
    matches: list[dict],
    send_budget: int = 1
) -> int:
    """
    Send notifications to the alert owner.

    Return the number of email attempts made.
    Each alert may be notified once per surf day.
    """

    if not matches or send_budget <= 0:
        return 0

    enabled = (
        os.getenv(
            "EMAIL_NOTIFICATIONS_ENABLED",
            "false"
        ).lower() == "true"
    )

    # Look up the owner from PostgreSQL.
    with SessionLocal() as db:
        user = db.get(
            User,
            alert.user_id
        )

        if user is None:
            logger.error(
                "Alert %s has no valid owner",
                alert.id
            )
            return 0

        recipient = user.email

    # Keep emails disabled while testing ownership.
    if not enabled:
        logger.info(
            "DRY RUN: alert %s would email account %s",
            alert.id,
            recipient
        )
        return 0

    attempted = 0

    for surf_date, entries in group_matches_by_day(matches):
        if attempted >= send_budget:
            break

        # Reserve this alert/day before sending.
        # PostgreSQL prevents duplicate reservations.
        with SessionLocal() as db:
            statement = (
                pg_insert(NotificationDelivery)
                .values(
                    alert_id=alert.id,
                    surf_date=surf_date,
                    recipient=recipient,
                    status="pending"
                )
                .on_conflict_do_nothing(
                    index_elements=[
                        "alert_id",
                        "surf_date"
                    ]
                )
                .returning(NotificationDelivery.id)
            )

            delivery_id = db.scalar(statement)
            db.commit()

        # Already notified or attempted for this surf day.
        if delivery_id is None:
            continue

        attempted += 1

        hours = ", ".join(
            local.strftime("%I:%M %p").lstrip("0")
            for local, _ in entries[:6]
        )

        subject = (
            f"Surf Alerts: {spot.name} conditions "
            f"on {surf_date.isoformat()}"
        )

        html = (
            f"<h2>{escape(alert.name)}</h2>"
            f"<p>Matching surf conditions at "
            f"{escape(spot.name)} "
            f"on {surf_date.isoformat()}.</p>"
            f"<p>Forecast hours: {escape(hours)}</p>"
            "<p>Marine forecasts are estimates. "
            "Check local conditions before surfing.</p>"
        )

        try:
            result = await send_email(
                to=recipient,
                subject=subject,
                html=html
            )

            provider_id = None

            if isinstance(result, dict):
                provider_id = result.get("id")

            elif result is not None:
                provider_id = getattr(
                    result,
                    "id",
                    None
                )

            with SessionLocal() as db:
                delivery = db.get(
                    NotificationDelivery,
                    delivery_id
                )

                if delivery is not None:
                    delivery.status = "sent"

                    delivery.provider_message_id = (
                        str(provider_id)
                        if provider_id is not None
                        else None
                    )

                    delivery.sent_at = datetime.now(
                        timezone.utc
                    )

                    db.commit()

            logger.info(
                "Sent alert %s to its owner",
                alert.id
            )

        except Exception:
            logger.exception(
                "Notification failed for alert %s",
                alert.id
            )

            with SessionLocal() as db:
                delivery = db.get(
                    NotificationDelivery,
                    delivery_id
                )

                if delivery is not None:
                    delivery.status = "failed"
                    db.commit()

    return attempted
