from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.database import SessionLocal
from app.models import Alert, AlertMatch, SurfSpot
from app.services.forecast import get_forecast, format_forecast
from app.services.matching import find_matching_hours
import os
from app.services.notifications import notify_matching_hours


async def check_all_alerts():
    print("Starting forecast check...", flush=True)

    # Retrieve active alerts and their surf spots
    with SessionLocal() as db:
        rows = db.execute(
            select(Alert, SurfSpot)
            .join(
                SurfSpot,
                Alert.spot_id == SurfSpot.id
            )
            .where(Alert.is_active.is_(True))
        ).all()

    # Group alerts by surf spot
    alerts_by_spot = defaultdict(list)

    for alert, spot in rows:
        alerts_by_spot[spot.id].append((alert, spot))

    new_matches = 0
    
    email_budget = int(
    os.getenv("MAX_EMAILS_PER_CHECK", "1")
)

    for spot_alerts in alerts_by_spot.values():
        spot = spot_alerts[0][1]

        try:
            raw_data = await get_forecast(
                spot.latitude,
                spot.longitude,
                timezone="UTC"
            )

            forecast = format_forecast(raw_data)

        except Exception as exc:
            print(
                f"Forecast failed for {spot.name}: {exc}",
                flush=True
            )
            continue

        now = datetime.now(timezone.utc)
        end_time = now + timedelta(hours=24)

        # Only consider upcoming forecast hours
        upcoming = [
            hour for hour in forecast
            if now <= datetime.fromisoformat(
                hour["time"]
            ).replace(tzinfo=timezone.utc) <= end_time
        ]

        for alert, _ in spot_alerts:
            matches = find_matching_hours(upcoming, alert)

            for hour in matches:
                forecast_time = datetime.fromisoformat(
                    hour["time"]
                ).replace(tzinfo=timezone.utc)

                # Prevent duplicate matches
                statement = (
                    insert(AlertMatch)
                    .values(
                        alert_id=alert.id,
                        forecast_time=forecast_time
                    )
                    .on_conflict_do_nothing(
                        constraint="uq_alert_matches_alert_time"
                    )
                    # rowcount is -1 here, so detect inserts
                    # by whether an id comes back.
                    .returning(AlertMatch.id)
                )

                with SessionLocal.begin() as db:
                    inserted = db.scalar(statement) is not None

                if inserted:
                    new_matches += 1
                    print(
                        f"NEW MATCH: {spot.name} | "
                        f"{alert.name} | {forecast_time}",
                        flush=True
                    )
            attempted = await notify_matching_hours(
                alert,
                spot,
                matches,
                send_budget=email_budget
            )

            email_budget -= attempted

    print(
        f"Forecast check complete. "
        f"New matches: {new_matches}",
        flush=True
    )
