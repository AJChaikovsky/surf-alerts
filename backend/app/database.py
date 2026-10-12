import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Load environment variables
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)

DATABASE_URL = os.environ["DATABASE_URL"]

# Create database engine
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

# Create database session factory
SessionLocal = sessionmaker(bind=engine, autoflush=False)


# Base class for database models
class Base(DeclarativeBase):
    pass


from collections.abc import Generator
from sqlalchemy.orm import Session


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
