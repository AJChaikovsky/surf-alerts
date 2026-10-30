import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.main import app
from app.models import SurfSpot


NOW = "2026-10-19T08:00"

# Current-hour conditions by latitude, so each spot can differ.
CONDITIONS = {
    33.89: {"wave_height_ft": 4.0, "swell_period_s": 13.0, "wind_speed_kn": 6.0},   # El Porto (spot 1)
    33.38: {"wave_height_ft": 5.0, "swell_period_s": 14.0, "wind_speed_kn": 4.0},   # Trestles (spot 2)
    32.75: {"wave_height_ft": 1.0, "swell_period_s": 6.0, "wind_speed_kn": 20.0},   # Ocean Beach (spot 3)
}


def alert(name: str, spot_id: int = 1, **overrides) -> dict:
    return {
        "name": name,
        "spot_id": spot_id,
        "min_wave_height_ft": 3.0,
        "max_wave_height_ft": 6.0,
        "min_swell_period_s": 12.0,
        **overrides,
    }


@pytest.fixture(autouse=True)
def fake_forecast(monkeypatch, db_session_factory):
    # Two more spots alongside the test database's El Porto.
    with db_session_factory() as db:
        db.add_all([
            SurfSpot(slug="trestles", name="Trestles", latitude=33.38,
                     longitude=-117.59, region="Orange County"),
            SurfSpot(slug="ocean-beach", name="Ocean Beach", latitude=32.75,
                     longitude=-117.25, region="San Diego"),
        ])
        db.commit()

    async def get_forecast(latitude, longitude):
        return {"latitude": latitude}

    def format_forecast(raw):
        # The hour before NOW (already past) would fit nothing.
        return [
            {"time": "2026-10-19T07:00", "wave_height_ft": 0.5,
             "swell_period_s": 3.0, "wind_speed_kn": 30.0},
            {"time": NOW, **CONDITIONS[raw["latitude"]]},
        ]

    monkeypatch.setattr(main, "get_forecast", get_forecast)
    monkeypatch.setattr(main, "format_forecast", format_forecast)
    monkeypatch.setattr(main, "current_pacific_hour", lambda: NOW)


def fitting(client) -> dict[int, list[dict]]:
    response = client.get("/alerts/current-matches")
    assert response.status_code == 200
    return {spot["spot_id"]: spot["alerts"] for spot in response.json()["spots"]}


def test_alert_turns_every_spot_that_fits_green(make_user_client):
    client = make_user_client("fits@example.com")
    created = client.post("/alerts", json=alert("Dawn Patrol", spot_id=1)).json()

    result = fitting(client)

    # Set for El Porto, but Trestles fits too; Ocean Beach doesn't.
    assert set(result) == {1, 2}
    assert result[2] == [{
        "id": created["id"],
        "name": "Dawn Patrol",
        "spot_id": 1,
        "spot_name": "El Porto",
    }]


def test_each_spot_lists_every_alert_it_fits(make_user_client):
    client = make_user_client("several@example.com")
    client.post("/alerts", json=alert("Any Swell"))
    client.post("/alerts", json=alert("Glassy", max_wind_speed_kn=5.0))
    client.post("/alerts", json=alert("Big Days", min_wave_height_ft=4.5))

    result = fitting(client)

    # El Porto: 4 ft at 6 kn. Trestles: 5 ft at 4 kn.
    assert [a["name"] for a in result[1]] == ["Any Swell"]
    assert [a["name"] for a in result[2]] == ["Any Swell", "Glassy", "Big Days"]


def test_no_fit_means_no_spots(make_user_client):
    client = make_user_client("none@example.com")
    client.post("/alerts", json=alert("Long Period Only", min_swell_period_s=16.0))

    assert fitting(client) == {}


def test_paused_alerts_are_ignored(make_user_client):
    client = make_user_client("paused@example.com")
    client.post("/alerts", json=alert("Paused", is_active=False))

    assert fitting(client) == {}


def test_other_users_alerts_are_not_included(make_user_client):
    owner = make_user_client("owner@example.com")
    other = make_user_client("other@example.com")
    owner.post("/alerts", json=alert("Owner's"))

    assert fitting(other) == {}


def test_my_local_breaks_count_but_others_do_not(make_user_client, monkeypatch):
    async def has_waves(latitude, longitude):
        return True

    monkeypatch.setattr(main, "location_has_wave_data", has_waves)

    me = make_user_client("me@example.com")
    stranger = make_user_client("stranger@example.com")

    # A local break at Trestles' latitude, so it has Trestles' conditions.
    mine = me.post("/spots", json={"name": "My Reef", "latitude": 33.38, "longitude": -117.6}).json()
    theirs = stranger.post("/spots", json={"name": "Their Reef", "latitude": 33.38, "longitude": -117.61}).json()

    me.post("/alerts", json=alert("Mine"))

    result = fitting(me)

    assert mine["id"] in result
    assert theirs["id"] not in result


def test_forecast_failure_is_skipped(make_user_client, monkeypatch):
    async def broken(latitude, longitude):
        raise RuntimeError("Open-Meteo is down")

    monkeypatch.setattr(main, "get_forecast", broken)

    client = make_user_client("down@example.com")
    client.post("/alerts", json=alert("Dawn Patrol"))

    assert fitting(client) == {}


def test_current_hours_are_cached(make_user_client, monkeypatch):
    calls = []
    real = main.get_forecast

    async def counting(latitude, longitude):
        calls.append(latitude)
        return await real(latitude, longitude)

    monkeypatch.setattr(main, "get_forecast", counting)

    client = make_user_client("cache@example.com")
    client.post("/alerts", json=alert("Dawn Patrol"))

    fitting(client)
    first_visit = len(calls)
    fitting(client)

    assert first_visit == 3          # one per spot
    assert len(calls) == first_visit  # the second visit used the cache


def test_requires_login(db_session_factory):
    assert TestClient(app).get("/alerts/current-matches").status_code == 401
