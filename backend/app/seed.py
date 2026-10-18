from sqlalchemy import select

from app.data.spots import SURF_SPOTS
from app.database import SessionLocal
from app.models import SurfSpot


def seed_spots():
    # Only add spots that are missing, so existing spots (and the
    # alerts that reference them) are never changed. Safe to rerun.
    with SessionLocal() as db:
        existing_slugs = set(db.scalars(select(SurfSpot.slug)))

        added = []

        for slug, spot in SURF_SPOTS.items():
            if slug in existing_slugs:
                continue

            db.add(SurfSpot(slug=slug, **spot))
            added.append(spot["name"])

        db.commit()

    if added:
        print(f"Added {len(added)} surf spots: {', '.join(added)}")
    else:
        print("All surf spots already exist.")


if __name__ == "__main__":
    seed_spots()
