from types import SimpleNamespace

from app.services.matching import find_matching_hours


def make_alert(max_wind=None, is_active=True):
    return SimpleNamespace(
        is_active=is_active,
        min_wave_height_ft=3,
        max_wave_height_ft=6,
        min_swell_period_s=12,
        max_wind_speed_kn=max_wind,
    )


def make_forecast(wind_speed):
    return [
        {
            "time": "2026-10-12T07:00",
            "wave_height_ft": 4,
            "swell_period_s": 14,
            "wind_speed_kn": wind_speed,
        }
    ]


def test_wind_below_limit_matches():
    result = find_matching_hours(
        make_forecast(5),
        make_alert(max_wind=8)
    )

    assert len(result) == 1


def test_wind_above_limit_does_not_match():
    result = find_matching_hours(
        make_forecast(12),
        make_alert(max_wind=8)
    )

    assert len(result) == 0


def test_wind_exactly_at_limit_matches():
    result = find_matching_hours(
        make_forecast(8),
        make_alert(max_wind=8)
    )

    assert len(result) == 1


def test_missing_wind_does_not_match_restricted_alert():
    result = find_matching_hours(
        make_forecast(None),
        make_alert(max_wind=8)
    )

    assert len(result) == 0


def test_no_wind_restriction_still_matches():
    result = find_matching_hours(
        make_forecast(None),
        make_alert(max_wind=None)
    )

    assert len(result) == 1


def test_paused_alert_does_not_match():
    result = find_matching_hours(
        make_forecast(5),
        make_alert(max_wind=8, is_active=False)
    )

    assert len(result) == 0
