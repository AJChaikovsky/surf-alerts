from datetime import date
from types import SimpleNamespace

from app.services.notifications import build_email, group_matches_by_day


ALERT = SimpleNamespace(name="Dawn Patrol")
SPOT = SimpleNamespace(name="El Porto")


def hour(time, waves, swell, wind):
    # Forecast hours from the worker are in UTC.
    return {
        "time": time,
        "wave_height_ft": waves,
        "swell_period_s": swell,
        "wind_speed_kn": wind,
    }


def email_for(matches):
    [(surf_date, entries)] = group_matches_by_day(matches)
    return build_email(ALERT, SPOT, surf_date, entries)


def test_email_includes_forecast_averages():
    subject, html = email_for([
        # 7, 8, and 9 AM Pacific on Oct 19, 2026
        hour("2026-10-19T14:00", 3.0, 12.0, 4.0),
        hour("2026-10-19T15:00", 4.0, 13.0, 6.0),
        hour("2026-10-19T16:00", 5.0, 14.0, 8.0),
    ])

    assert subject == "Surf Alerts: El Porto conditions on 2026-10-19"
    assert "Monday, October 19" in html
    assert "Matching hours (3):</strong> 7:00 AM, 8:00 AM, 9:00 AM" in html

    assert "Average wave height" in html and "4.0 ft" in html
    assert "Average swell period" in html and "13.0 s" in html
    assert "Average wind speed" in html and "6.0 kn" in html


def test_missing_values_are_skipped_in_averages():
    _, html = email_for([
        hour("2026-10-19T14:00", 3.0, 12.0, None),
        hour("2026-10-19T15:00", 5.0, 14.0, 9.0),
    ])

    # Wind averages only the hour that has it.
    assert "9.0 kn" in html


def test_value_missing_from_every_hour_shows_na():
    _, html = email_for([
        hour("2026-10-19T14:00", 3.0, 12.0, None),
        hour("2026-10-19T15:00", 5.0, 14.0, None),
    ])

    assert "Average wind speed</td><td" in html
    assert ">N/A</td>" in html


def test_long_days_list_six_hours_then_a_count():
    _, html = email_for([
        hour(f"2026-10-19T{utc:02d}:00", 3.0, 12.0, 5.0)
        for utc in range(14, 23)
    ])

    assert "Matching hours (9):" in html
    assert "and 3 more" in html


def test_alert_names_are_escaped():
    alert = SimpleNamespace(name="<script>alert(1)</script>")
    [(surf_date, entries)] = group_matches_by_day([
        hour("2026-10-19T14:00", 3.0, 12.0, 5.0)
    ])

    _, html = build_email(alert, SPOT, surf_date, entries)

    assert "<script>" not in html
    assert "&lt;script&gt;" in html


def test_surf_date_is_a_date():
    [(surf_date, _)] = group_matches_by_day([
        hour("2026-10-19T14:00", 3.0, 12.0, 5.0)
    ])

    assert surf_date == date(2026, 10, 19)
