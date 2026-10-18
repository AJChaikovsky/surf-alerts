import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.main import LOCAL_BREAK_ATTEMPTS_PER_HOUR, MAX_LOCAL_BREAKS, app


BREAK = {
    "name": "Secret Reef",
    "latitude": 33.80,
    "longitude": -118.40,
    "region": "South Bay"
}


def alert_for(spot_id: int) -> dict:
    return {
        "name": "Local Alert",
        "spot_id": spot_id,
        "min_wave_height_ft": 3.0,
        "max_wave_height_ft": 6.0,
        "min_swell_period_s": 12.0
    }


@pytest.fixture(autouse=True)
def ocean_everywhere(monkeypatch):
    # Don't call Open-Meteo from tests; pretend every point has waves.
    async def has_waves(latitude, longitude):
        return True

    monkeypatch.setattr(main, "location_has_wave_data", has_waves)


@pytest.fixture
def owner_and_other(make_user_client):
    owner = make_user_client("owner@example.com")
    other = make_user_client("other@example.com")

    response = owner.post("/spots", json=BREAK)
    assert response.status_code == 201

    return owner, other, response.json()


def test_local_break_is_created_for_its_owner(owner_and_other):
    owner, other, spot = owner_and_other

    assert spot["is_custom"] is True
    assert spot["name"] == "Secret Reef"
    assert spot["slug"].startswith("secret-reef-")

    owner_spots = owner.get("/spots").json()

    assert [s["name"] for s in owner_spots if s["is_custom"]] == ["Secret Reef"]


def test_local_breaks_are_private(owner_and_other):
    owner, other, spot = owner_and_other

    other_names = [s["name"] for s in other.get("/spots").json()]
    anonymous_names = [s["name"] for s in TestClient(app).get("/spots").json()]

    assert "Secret Reef" not in other_names
    assert "Secret Reef" not in anonymous_names

    # The curated spot from the test database is still visible to everyone.
    assert "El Porto" in other_names
    assert "El Porto" in anonymous_names


def test_others_cannot_use_or_delete_a_local_break(owner_and_other):
    owner, other, spot = owner_and_other

    assert other.get(f"/spots/{spot['slug']}/forecast").status_code == 404
    assert other.post("/alerts", json=alert_for(spot["id"])).status_code == 404
    assert other.delete(f"/spots/{spot['id']}").status_code == 404

    assert len([s for s in owner.get("/spots").json() if s["is_custom"]]) == 1


def test_others_cannot_move_an_alert_to_a_local_break(owner_and_other):
    owner, other, spot = owner_and_other

    alert = other.post("/alerts", json=alert_for(1)).json()

    response = other.put(
        f"/alerts/{alert['id']}",
        json=alert_for(spot["id"])
    )

    assert response.status_code == 404


def test_owner_can_create_alerts_on_their_break(owner_and_other):
    owner, other, spot = owner_and_other

    assert owner.post("/alerts", json=alert_for(spot["id"])).status_code == 201


def test_limit_of_local_breaks_per_user(make_user_client):
    client = make_user_client("limit@example.com")

    for number in range(MAX_LOCAL_BREAKS):
        response = client.post("/spots", json={**BREAK, "name": f"Break {number}"})
        assert response.status_code == 201

    response = client.post("/spots", json={**BREAK, "name": "One Too Many"})

    assert response.status_code == 409
    assert f"up to {MAX_LOCAL_BREAKS}" in response.json()["detail"]

    # Deleting one frees a slot.
    first_id = next(s["id"] for s in client.get("/spots").json() if s["is_custom"])

    assert client.delete(f"/spots/{first_id}").status_code == 204
    assert client.post("/spots", json={**BREAK, "name": "Replacement"}).status_code == 201


def test_limit_is_per_user(make_user_client):
    first = make_user_client("first@example.com")
    second = make_user_client("second@example.com")

    for number in range(MAX_LOCAL_BREAKS):
        first.post("/spots", json={**BREAK, "name": f"Break {number}"})

    assert second.post("/spots", json=BREAK).status_code == 201


def test_location_without_wave_data_is_rejected(make_user_client, monkeypatch):
    async def on_land(latitude, longitude):
        return False

    monkeypatch.setattr(main, "location_has_wave_data", on_land)

    client = make_user_client("inland@example.com")
    response = client.post("/spots", json=BREAK)

    assert response.status_code == 422
    assert response.json()["detail"].startswith("Unable to retrieve data")


def test_cannot_delete_a_break_used_by_an_alert(owner_and_other):
    owner, other, spot = owner_and_other

    alert = owner.post("/alerts", json=alert_for(spot["id"])).json()

    assert owner.delete(f"/spots/{spot['id']}").status_code == 409

    owner.delete(f"/alerts/{alert['id']}")

    assert owner.delete(f"/spots/{spot['id']}").status_code == 204


def test_curated_spots_cannot_be_deleted(make_user_client):
    client = make_user_client("curated@example.com")

    assert client.delete("/spots/1").status_code == 404


def test_adding_a_break_requires_login(db_session_factory):
    assert TestClient(app).post("/spots", json=BREAK).status_code == 401


def test_blank_name_is_rejected(make_user_client):
    client = make_user_client("blank@example.com")

    assert client.post("/spots", json={**BREAK, "name": "   "}).status_code == 422


def test_adding_breaks_is_rate_limited(make_user_client):
    client = make_user_client("churn@example.com")

    # Add and delete in a loop: the 3-break cap alone wouldn't stop this.
    for number in range(LOCAL_BREAK_ATTEMPTS_PER_HOUR):
        created = client.post("/spots", json={**BREAK, "name": f"Churn {number}"})
        assert created.status_code == 201
        client.delete(f"/spots/{created.json()['id']}")

    assert client.post("/spots", json=BREAK).status_code == 429
