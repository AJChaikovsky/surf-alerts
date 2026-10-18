import asyncio
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.blocking import BlockingScheduler

from app.services.monitoring import check_all_alerts


def run_forecast_check():
    asyncio.run(check_all_alerts())


def main():
    # Show notification logs, including DRY RUN messages.
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    scheduler = BlockingScheduler(timezone="UTC")

    scheduler.add_job(
        run_forecast_check,
        trigger="interval",
        minutes=30,
        id="surf_forecast_monitor",
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(timezone.utc)
    )

    print("Surf Alerts worker started.", flush=True)
    print("Checking forecasts every 30 minutes.", flush=True)

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        print("Surf Alerts worker stopped.", flush=True)


if __name__ == "__main__":
    main()
