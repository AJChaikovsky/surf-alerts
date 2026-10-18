import pytest
from fastapi.testclient import TestClient

from app.main import app


def alert_payload(name: str) -> dict:
    return {
        "name": name,
        "spot_id": 1,
        "min_wave_height_ft": 3.0,
        "max_wave_height_ft": 6.0,
        "min_swell_period_s": 12.0
    }


@pytest.fixture
def owner_and_intruder(db_session_factory, make_user_client):
    owner = make_user_client("owner@example.com")
    intruder = make_user_client("intruder@example.com")

    response = owner.post(
        "/alerts",
        json=alert_payload("Owner El Porto")
    )

    assert response.status_code == 201

    return owner, intruder, response.json()["id"]


# -------- TESTS --------

def test_alerts_require_login(db_session_factory):
    client = TestClient(app)

    assert client.get("/alerts").status_code == 401
    assert client.post(
        "/alerts",
        json=alert_payload("Anonymous")
    ).status_code == 401


def test_users_only_list_their_own_alerts(owner_and_intruder):
    owner, intruder, alert_id = owner_and_intruder

    intruder.post("/alerts", json=alert_payload("Intruder Alert"))

    owner_names = [a["name"] for a in owner.get("/alerts").json()]
    intruder_names = [a["name"] for a in intruder.get("/alerts").json()]

    assert owner_names == ["Owner El Porto"]
    assert intruder_names == ["Intruder Alert"]


def test_cannot_edit_another_users_alert(owner_and_intruder):
    owner, intruder, alert_id = owner_and_intruder

    response = intruder.put(
        f"/alerts/{alert_id}",
        json=alert_payload("Hijacked")
    )

    assert response.status_code == 404
    assert owner.get("/alerts").json()[0]["name"] == "Owner El Porto"


def test_cannot_pause_another_users_alert(owner_and_intruder):
    owner, intruder, alert_id = owner_and_intruder

    response = intruder.patch(
        f"/alerts/{alert_id}",
        json={"is_active": False}
    )

    assert response.status_code == 404
    assert owner.get("/alerts").json()[0]["is_active"] is True


def test_cannot_delete_another_users_alert(owner_and_intruder):
    owner, intruder, alert_id = owner_and_intruder

    response = intruder.delete(f"/alerts/{alert_id}")

    assert response.status_code == 404
    assert len(owner.get("/alerts").json()) == 1


def test_cannot_view_another_users_matches(owner_and_intruder):
    owner, intruder, alert_id = owner_and_intruder

    response = intruder.get(f"/alerts/{alert_id}/matches")

    assert response.status_code == 404


def test_owner_can_manage_their_own_alert(owner_and_intruder):
    owner, intruder, alert_id = owner_and_intruder

    assert owner.patch(
        f"/alerts/{alert_id}",
        json={"is_active": False}
    ).status_code == 200

    assert owner.put(
        f"/alerts/{alert_id}",
        json=alert_payload("Renamed")
    ).status_code == 200

    assert owner.delete(f"/alerts/{alert_id}").status_code in (200, 204)
    assert owner.get("/alerts").json() == []
