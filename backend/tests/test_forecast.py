from app.services.forecast import format_forecast


def test_forecast_includes_wind_and_swell_direction():

    raw_data = {
        "hourly": {
            "time": ["2026-10-12T07:00"],
            "wave_height": [1.2],
            "wave_period": [11.0],
            "wave_direction": [265],
            "swell_wave_height": [0.9],
            "swell_wave_period": [13.0],
            "swell_wave_direction": [270]
        },

        "weather_hourly": {
            "time": ["2026-10-12T07:00"],
            "wind_speed_10m": [5.2],
            "wind_direction_10m": [45]
        }
    }

    result = format_forecast(raw_data)

    assert len(result) == 1

    hour = result[0]

    assert hour["wave_height_ft"] == 3.94
    assert hour["swell_height_ft"] == 2.95
    assert hour["wind_speed_kn"] == 5.2
    assert hour["wind_direction_deg"] == 45
    assert hour["swell_direction_deg"] == 270


def test_missing_wind_data():

    raw_data = {
        "hourly": {
            "time": ["2026-10-12T07:00"],
            "wave_height": [1.0],
            "wave_period": [10.0],
            "swell_wave_height": [0.8],
            "swell_wave_period": [12.0]
        },

        "weather_hourly": {}
    }

    result = format_forecast(raw_data)

    assert len(result) == 1

    assert result[0]["wind_speed_kn"] is None
    assert result[0]["wind_direction_deg"] is None
    assert result[0]["swell_direction_deg"] is None
