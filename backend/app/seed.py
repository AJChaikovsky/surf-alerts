
from sqlalchemy import select

from app.database import SessionLocal
from app.models import SurfSpot


def seed_spots():
    with SessionLocal() as db:
        existing_spot = db.scalar(
            select(SurfSpot).where(SurfSpot.slug == "el-porto")
        )

        if existing_spot:
            print("El Porto already exists!")
            return

        el_porto = SurfSpot(
            slug="el-porto",
            name="El Porto",
            latitude=33.90,
            longitude=-118.43,
            region="South Bay"
        )

        db.add(el_porto)
        db.commit()

        print("Successfully added El Porto!")


if __name__ == "__main__":
    seed_spots()
