import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import (
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    reset_rate_limits,
)
from app.database import Base, get_db
from app.main import app, reset_current_hour_cache
from app.models import SurfSpot


# Rate-limit counters are process-wide, so start each test fresh.
@pytest.fixture(autouse=True)
def fresh_rate_limits():
    reset_rate_limits()
    reset_current_hour_cache()
    yield
    reset_rate_limits()
    reset_current_hour_cache()


# -------- TEST DATABASE --------
# In-memory SQLite, so these tests never touch the real surf_alerts data.

@pytest.fixture
def db_session_factory():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )

    Base.metadata.create_all(engine)

    TestSession = sessionmaker(bind=engine, autoflush=False)

    with TestSession() as db:
        db.add(
            SurfSpot(
                slug="el-porto",
                name="El Porto",
                latitude=33.89,
                longitude=-118.42,
                region="South Bay"
            )
        )
        db.commit()

    def override_get_db():
        db = TestSession()

        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    yield TestSession

    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def make_user_client(db_session_factory):
    def make(email: str) -> TestClient:
        # Each client keeps its own session cookie, like a separate
        # browser, and echoes the CSRF cookie like the frontend does.
        client = TestClient(app)

        response = client.post(
            "/auth/register",
            json={"email": email, "password": "salty-tube-ride-42"}
        )

        assert response.status_code == 201

        client.headers[CSRF_HEADER_NAME] = client.cookies[CSRF_COOKIE_NAME]

        return client

    return make
