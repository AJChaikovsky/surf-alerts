from fastapi import FastAPI
from app.services.forecast import get_forecast, format_forecast
from fastapi import HTTPException
from app.data.spots import SURF_SPOTS

app = FastAPI(title="Surf Alerts API")


@app.get("/")
def home():
    return {"message": "Welcome to Surf Alerts!"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/forecast")
async def forecast(latitude: float, longitude: float):
    return await get_forecast(latitude, longitude)


@app.get("/forecast/summary")
async def forecast_summary(latitude: float, longitude: float):
    raw_data = await get_forecast(latitude, longitude)

    formatted_data = format_forecast(raw_data)

    return {
        "location": {
            "latitude": latitude,
            "longitude": longitude
        },
        "forecast": formatted_data
    }

@app.get("/spots")
def list_spots():
    return SURF_SPOTS


@app.get("/spots/{spot_id}/forecast")
async def spot_forecast(spot_id: str):
    spot = SURF_SPOTS.get(spot_id)

    if spot is None:
        raise HTTPException(
            status_code=404,
            detail="Surf spot not found"
        )

    raw_data = await get_forecast(
        spot["latitude"],
        spot["longitude"]
    )

    formatted_data = format_forecast(raw_data)

    return {
        "spot": spot["name"],
        "region": spot["region"],
        "forecast": formatted_data
    }
