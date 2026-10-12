
from types import SimpleNamespace

from app.services.matching import find_matching_hours


def make_alert():
    return SimpleNamespace(
        min_wave_height_ft=3.0,
        max_wave_height_ft=6.0,
        min_swell_period_s=12.0,
        is_active=True
    )


def test_matching_conditions():
    alert = make_alert()

    forecast = [
        {
            "time": "07:00",
            "wave_height_ft": 4.0,
            "swell_period_s": 13.0
        },
        {
            "time": "08:00",
            "wave_height_ft": 2.0,
            "swell_period_s": 13.0
        },
        {
            "time": "09:00",
            "wave_height_ft": 5.0,
            "swell_period_s": 9.0
        }
    ]

    matches = find_matching_hours(forecast, alert)

    assert len(matches) == 1
    assert matches[0]["time"] == "07:00"


def test_inactive_alert():
    alert = make_alert()
    alert.is_active = False

    forecast = [
        {
            "time": "07:00",
            "wave_height_ft": 4.0,
            "swell_period_s": 13.0
        }
    ]

    matches = find_matching_hours(forecast, alert)

    assert matches == []


def test_boundary_values():
    alert = make_alert()

    forecast = [
        {
            "time": "07:00",
            "wave_height_ft": 3.0,
            "swell_period_s": 12.0
        },
        {
            "time": "08:00",
            "wave_height_ft": 6.0,
            "swell_period_s": 12.0
        }
    ]

    matches = find_matching_hours(forecast, alert)

    assert len(matches) == 2
