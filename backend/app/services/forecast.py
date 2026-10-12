import logging

import httpx

logger = logging.getLogger(__name__)

MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"

METERS_TO_FEET = 3.28084


async def get_forecast(
    latitude: float,
    longitude: float,
    timezone: str = "America/Los_Angeles"
):
    """
    Fetch marine and wind forecasts for a surf location.
    """

    marine_params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": (
            "wave_height,"
            "wave_period,"
            "wave_direction,"
            "swell_wave_height,"
            "swell_wave_period,"
            "swell_wave_direction"
        ),
        "forecast_days": 3,
        "timezone": timezone
    }

    weather_params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": "wind_speed_10m,wind_direction_10m",
        "wind_speed_unit": "kn",
        "forecast_days": 3,
        "timezone": timezone,
        "cell_selection": "sea"
    }

    async with httpx.AsyncClient(timeout=15) as client:

        # Fetch marine forecast
        marine_response = await client.get(
            MARINE_URL,
            params=marine_params
        )
        marine_response.raise_for_status()
        marine_data = marine_response.json()

        # Fetch wind forecast
        try:
            weather_response = await client.get(
                WEATHER_URL,
                params=weather_params
            )
            weather_response.raise_for_status()
            weather_data = weather_response.json()

            marine_data["weather_hourly"] = (
                weather_data.get("hourly", {})
            )

        except httpx.HTTPError as exc:
            logger.warning("Wind forecast unavailable: %s", exc)
            marine_data["weather_hourly"] = {}

    return marine_data


def format_forecast(data: dict):
    """
    Convert raw hourly API data into readable
    surf forecast entries.
    """

    hourly = data["hourly"]
    weather_hourly = data.get("weather_hourly", {})

    formatted = []

    # Index wind readings by timestamp
    wind_times = weather_hourly.get("time", [])

    wind_index = {
        time: i
        for i, time in enumerate(wind_times)
    }

    def get_value(source, field, index):
        values = source.get(field, [])

        if index is None or index >= len(values):
            return None

        return values[index]

    def to_feet(value):
        if value is None:
            return None

        return round(value * METERS_TO_FEET, 2)

    for i, time in enumerate(hourly["time"]):

        wind_i = wind_index.get(time)

        wave_height = get_value(
            hourly, "wave_height", i
        )

        swell_height = get_value(
            hourly, "swell_wave_height", i
        )

        wind_speed = get_value(
            weather_hourly, "wind_speed_10m", wind_i
        )

        wind_direction = get_value(
            weather_hourly, "wind_direction_10m", wind_i
        )

        formatted.append({
            "time": time,

            "wave_height_ft": to_feet(wave_height),

            "wave_period_s": get_value(
                hourly, "wave_period", i
            ),

            "wave_direction_deg": get_value(
                hourly, "wave_direction", i
            ),

            "swell_height_ft": to_feet(swell_height),

            "swell_period_s": get_value(
                hourly, "swell_wave_period", i
            ),

            "swell_direction_deg": get_value(
                hourly, "swell_wave_direction", i
            ),

            "wind_speed_kn": (
                round(wind_speed, 1)
                if wind_speed is not None
                else None
            ),

            "wind_direction_deg": wind_direction
        })

    return formatted
