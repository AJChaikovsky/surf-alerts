from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SurfSpot
from app.services.forecast import get_forecast, format_forecast
from sqlalchemy.exc import IntegrityError
from app.schemas import SurfSpotCreate, SurfSpotResponse

from app.models import Alert
from app.schemas import AlertCreate, AlertResponse

from app.services.matching import find_matching_hours

from app.schemas import AlertStatusUpdate

from sqlalchemy import delete
from app.models import AlertMatch, NotificationDelivery


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

    return {
        "location": {
            "latitude": latitude,
            "longitude": longitude
        },
        "forecast": format_forecast(raw_data)
    }


@app.get("/spots")
def list_spots(db: Session = Depends(get_db)):
    spots = db.scalars(select(SurfSpot)).all()

    return [
        {
            "id": spot.id,
            "slug": spot.slug,
            "name": spot.name,
            "latitude": spot.latitude,
            "longitude": spot.longitude,
            "region": spot.region
        }
        for spot in spots
    ]


@app.get("/spots/{spot_id}/forecast")
async def spot_forecast(
    spot_id: str,
    db: Session = Depends(get_db)
):
    spot = db.scalar(
        select(SurfSpot).where(SurfSpot.slug == spot_id)
    )

    if spot is None:
        raise HTTPException(
            status_code=404,
            detail="Surf spot not found"
        )

    raw_data = await get_forecast(
        spot.latitude,
        spot.longitude
    )

    return {
        "spot": spot.name,
        "region": spot.region,
        "forecast": format_forecast(raw_data)
    }


@app.post(
    "/spots",
    response_model=SurfSpotResponse,
    status_code=201
)
def create_spot(
    spot: SurfSpotCreate,
    db: Session = Depends(get_db)
):
    # Check whether the spot already exists
    existing_spot = db.scalar(
        select(SurfSpot).where(
            SurfSpot.slug == spot.slug
        )
    )

    if existing_spot:
        raise HTTPException(
            status_code=409,
            detail="Surf spot already exists"
        )

    # Create a new database model
    new_spot = SurfSpot(**spot.model_dump())

    # Save to PostgreSQL
    try:
        db.add(new_spot)
        db.commit()
        db.refresh(new_spot)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Surf spot already exists"
        )

    return new_spot


@app.post(
    "/alerts",
    response_model=AlertResponse,
    status_code=201
)
def create_alert(
    alert: AlertCreate,
    db: Session = Depends(get_db)
):
    # Verify the surf spot exists
    spot = db.get(SurfSpot, alert.spot_id)

    if spot is None:
        raise HTTPException(
            status_code=404,
            detail="Surf spot not found"
        )

    # Create a new alert
    new_alert = Alert(**alert.model_dump())

    # Store it in PostgreSQL
    db.add(new_alert)
    db.commit()
    db.refresh(new_alert)

    return new_alert


@app.get(
    "/alerts",
    response_model=list[AlertResponse]
)
def list_alerts(
    db: Session = Depends(get_db)
):
    alerts = db.scalars(
        select(Alert).order_by(Alert.id)
    ).all()

    return alerts


@app.get("/alerts/{alert_id}/matches")
async def get_alert_matches(
    alert_id: int,
    db: Session = Depends(get_db)
):
    # Retrieve the alert from PostgreSQL
    alert = db.get(Alert, alert_id)

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Alert not found"
        )

    # Retrieve its associated surf spot
    spot = db.get(SurfSpot, alert.spot_id)

    if spot is None:
        raise HTTPException(
            status_code=404,
            detail="Surf spot not found"
        )

    # Fetch the latest marine forecast
    raw_data = await get_forecast(
        spot.latitude,
        spot.longitude
    )

    # Convert the forecast into our standard format
    formatted_data = format_forecast(raw_data)

    # Find hours matching the user's preferences
    matches = find_matching_hours(
        formatted_data,
        alert
    )

    return {
        "alert_id": alert.id,
        "alert_name": alert.name,
        "spot": spot.name,
        "total_matches": len(matches),
        "matching_hours": matches
    }

@app.patch(
    "/alerts/{alert_id}",
    response_model=AlertResponse
)
def update_alert_status(
    alert_id: int,
    update: AlertStatusUpdate,
    db: Session = Depends(get_db)
):
    alert = db.get(Alert, alert_id)

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Alert not found"
        )

    alert.is_active = update.is_active

    db.commit()
    db.refresh(alert)

    return alert



# -------- UPDATE AN ALERT --------

@app.put(
    "/alerts/{alert_id}",
    response_model=AlertResponse
)
def edit_alert(
    alert_id: int,
    update: AlertCreate,
    db: Session = Depends(get_db)
):
    # Find the existing alert
    alert = db.get(Alert, alert_id)

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Alert not found"
        )

    # Verify the new surf spot exists
    spot = db.get(SurfSpot, update.spot_id)

    if spot is None:
        raise HTTPException(
            status_code=404,
            detail="Surf spot not found"
        )

    # Update its fields
    for field, value in update.model_dump().items():
        setattr(alert, field, value)

    db.commit()
    db.refresh(alert)

    return alert


# -------- DELETE AN ALERT --------

@app.delete(
    "/alerts/{alert_id}",
    status_code=204
)
def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db)
):
    alert = db.get(Alert, alert_id)

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Alert not found"
        )

    # Remove saved match records first
    db.execute(
        delete(AlertMatch).where(
            AlertMatch.alert_id == alert_id
        )
    )

    # Remove notification delivery history
    db.execute(
        delete(NotificationDelivery).where(
            NotificationDelivery.alert_id == alert_id
        )
    )

    # Finally remove the alert itself
    db.delete(alert)

    db.commit()