from datetime import date, datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import get_current_user
from app.database import Base, get_db
from app.main import app
from app.models import (
    Alert,
    AlertMatch,
    NotificationDelivery,
    SurfSpot,
    User,
)


def test_history_is_private_to_alert_owner():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)

    # -------- SEED TWO USERS AND ONE ALERT WITH HISTORY --------

    with Session(engine) as db:
        owner = User(email="owner@example.com", password_hash="x")
        other = User(email="other@example.com", password_hash="x")

        spot = SurfSpot(
            slug="el-porto",
            name="El Porto",
            latitude=33.89,
            longitude=-118.42,
            region="South Bay"
        )

        db.add_all([owner, other, spot])
        db.flush()

        alert = Alert(
            user_id=owner.id,
            name="Weekend Surf",
            spot_id=spot.id,
            min_wave_height_ft=3.0,
            max_wave_height_ft=6.0,
            min_swell_period_s=12.0
        )

        db.add(alert)
        db.flush()

        db.add_all([
            AlertMatch(
                alert_id=alert.id,
                forecast_time=datetime(
                    2026, 10, 18, 14, tzinfo=timezone.utc
                )
            ),
            NotificationDelivery(
                alert_id=alert.id,
                surf_date=date(2026, 10, 18),
                recipient="owner@example.com",
                status="sent",
                sent_at=datetime(
                    2026, 10, 18, 15, tzinfo=timezone.utc
                )
            ),
        ])

        db.commit()

        owner_id = owner.id
        other_id = other.id
        alert_id = alert.id

    # -------- ACT AS EACH USER --------

    def override_get_db():
        with Session(engine) as db:
            yield db

    current_user_id = {"value": owner_id}

    def override_current_user():
        with Session(engine) as db:
            return db.get(User, current_user_id["value"])

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_current_user

    try:
        client = TestClient(app)

        # Owner sees their matches and deliveries
        response = client.get(f"/alerts/{alert_id}/history")

        assert response.status_code == 200

        history = response.json()

        assert history["alert_id"] == alert_id
        assert history["alert_name"] == "Weekend Surf"
        assert history["spot"] == "El Porto"
        assert len(history["matches"]) == 1
        assert len(history["deliveries"]) == 1
        assert history["deliveries"][0]["status"] == "sent"
        assert history["deliveries"][0]["surf_date"] == "2026-10-18"

        # Another user who guesses the ID gets 404, not the data
        current_user_id["value"] = other_id

        response = client.get(f"/alerts/{alert_id}/history")

        assert response.status_code == 404
        assert "matches" not in response.json()

    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_history_requires_login():
    client = TestClient(app)

    assert client.get("/alerts/1/history").status_code == 401
