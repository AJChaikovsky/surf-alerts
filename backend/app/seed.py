from sqlalchemy import select

from app.data.spots import SURF_SPOTS
from app.database import SessionLocal
from app.models import SurfSpot


SYNCED_FIELDS = ("name", "latitude", "longitude", "region")


def seed_spots():
    # Make curated spots match data/spots.py: add missing ones and
    # update changed details. Ids stay the same, so alerts keep
    # working, and users' local breaks are never touched. Safe to rerun.
    with SessionLocal() as db:
        curated = {
            spot.slug: spot
            for spot in db.scalars(
                select(SurfSpot).where(SurfSpot.user_id.is_(None))
            )
        }

        added = []
        updated = []

        for slug, details in SURF_SPOTS.items():
            spot = curated.get(slug)

            if spot is None:
                db.add(SurfSpot(slug=slug, **details))
                added.append(details["name"])
                continue

            changed = [
                field
                for field in SYNCED_FIELDS
                if getattr(spot, field) != details[field]
            ]

            for field in changed:
                setattr(spot, field, details[field])

            if changed:
                updated.append(details["name"])

        db.commit()

    print(f"Added {len(added)}: {', '.join(added) or 'none'}")
    print(f"Updated {len(updated)}: {', '.join(updated) or 'none'}")


if __name__ == "__main__":
    seed_spots()
