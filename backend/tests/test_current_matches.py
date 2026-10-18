import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.main import app


NOW = "2026-10-19T08:00"


def alert(name: str, **overrides) -> dict:
    return {
        "name": name,
        "spot_id": 1,
        "min_wave_height_ft": 3.0,
        "max_wave_height_ft": 6.0,
        "min_swell_period_s": 12.0,
        **overrides,
    }


@pytest.fixture(autouse=True)
def fake_forecast(monkeypatch):
    # The current hour is 4 ft at 13 s with 6 kn of wind; the hour
    # before it (already past) would match nothing.
    async def get_forecast(latitude, longitude):
        return {}

    def format_forecast(raw):
        return [
            {"time": "2026-10-19T07:00", "wave_height_ft": 1.0,
             "swell_period_s": 5.0, "wind_speed_kn": 30.0},
            {"time": NOW, "wave_height_ft": 4.0,
             "swell_period_s": 13.0, "wind_speed_kn": 6.0},
        ]

    monkeypatch.setattr(main, "get_forecast", get_forecast)
    monkeypatch.setattr(main, "format_forecast", format_forecast)
    monkeypatch.setattr(main, "current_pacific_hour", lambda: NOW)


def test_spot_is_listed_when_an_alert_matches_now(make_user_client):
    client = make_user_client("match@example.com")
    created = client.post("/alerts", json=alert("Fits")).json()

    response = client.get("/alerts/current-matches")

    assert response.status_code == 200
    assert response.json() == {
        "forecast_hour": NOW,
        "spots": [
            {"spot_id": 1, "alerts": [{"id": created["id"], "name": "Fits"}]}
        ],
    }


def test_only_matching_alerts_are_listed(make_user_client):
    client = make_user_client("partial@example.com")
    client.post("/alerts", json=alert("Fits"))
    client.post("/alerts", json=alert("Too Windy", max_wind_speed_kn=5.0))
    client.post("/alerts", json=alert("Too Big", min_wave_height_ft=5.0))

    [spot] = client.get("/alerts/current-matches").json()["spots"]

    assert [a["name"] for a in spot["alerts"]] == ["Fits"]


def test_no_match_means_no_spots(make_user_client):
    client = make_user_client("none@example.com")
    client.post("/alerts", json=alert("Long Period Only", min_swell_period_s=16.0))

    assert client.get("/alerts/current-matches").json()["spots"] == []


def test_paused_alerts_are_ignored(make_user_client):
    client = make_user_client("paused@example.com")
    client.post("/alerts", json=alert("Paused", is_active=False))

    assert client.get("/alerts/current-matches").json()["spots"] == []


def test_other_users_alerts_are_not_included(make_user_client):
    owner = make_user_client("owner@example.com")
    other = make_user_client("other@example.com")
    owner.post("/alerts", json=alert("Owner's"))

    assert other.get("/alerts/current-matches").json()["spots"] == []


def test_forecast_failure_is_skipped(make_user_client, monkeypatch):
    async def broken(latitude, longitude):
        raise RuntimeError("Open-Meteo is down")

    monkeypatch.setattr(main, "get_forecast", broken)

    client = make_user_client("down@example.com")
    client.post("/alerts", json=alert("Fits"))

    response = client.get("/alerts/current-matches")

    assert response.status_code == 200
    assert response.json()["spots"] == []


def test_requires_login(db_session_factory):
    assert TestClient(app).get("/alerts/current-matches").status_code == 401
