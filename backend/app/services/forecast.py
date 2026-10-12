
import httpx

MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"


async def get_forecast(latitude: float, longitude: float):
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": "wave_height,wave_period,swell_wave_height,swell_wave_period",
        "forecast_days": 3,
        "timezone": "America/Los_Angeles"
    }

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(MARINE_URL, params=params)
        response.raise_for_status()
        return response.json()


def format_forecast(data: dict):
    hourly = data["hourly"]
    formatted = []

    for i, time in enumerate(hourly["time"]):
        formatted.append({
            "time": time,
            "wave_height_ft": round(
                hourly["wave_height"][i] * 3.28084, 2
            ),
            "wave_period_s": hourly["wave_period"][i],
            "swell_height_ft": round(
                hourly["swell_wave_height"][i] * 3.28084, 2
            ),
            "swell_period_s": hourly["swell_wave_period"][i]
        })

    return formatted
