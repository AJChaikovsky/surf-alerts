
from fastapi import Depends, FastAPI, HTTPException

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import (
    get_current_user,
    router as auth_router,
)

from app.database import get_db

from app.models import (
    Alert,
    AlertMatch,
    NotificationDelivery,
    SurfSpot,
    User,
)

from app.schemas import (
    AlertCreate,
    AlertResponse,
    AlertStatusUpdate,
    SurfSpotCreate,
    SurfSpotResponse,
)

from app.services.forecast import (
    format_forecast,
    get_forecast,
)

from app.services.matching import find_matching_hours


app = FastAPI(title="Surf Alerts API")
app.include_router(auth_router)


# -------- CHECK ALERT OWNERSHIP --------

def owned_alert(
    db: Session,
    alert_id: int,
    user_id: int
) -> Alert:
    alert = db.scalar(
        select(Alert).where(
            Alert.id == alert_id,
            Alert.user_id == user_id
        )
    )

    if alert is None:
        raise HTTPException(
            status_code=404,
            detail="Alert not found"
        )

    return alert


# -------- HOME / HEALTH --------

@app.get("/")
def home():
    return {"message": "Welcome to Surf Alerts!"}


@app.get("/health")
def health():
    return {"status": "healthy"}


# -------- FORECAST ENDPOINTS --------

@app.get("/forecast")
async def forecast(
    latitude: float,
    longitude: float
):
    return await get_forecast(latitude, longitude)


@app.get("/forecast/summary")
async def forecast_summary(
    latitude: float,
    longitude: float
):
    raw_data = await get_forecast(
        latitude,
        longitude
    )

    return {
        "location": {
            "latitude": latitude,
            "longitude": longitude
        },
        "forecast": format_forecast(raw_data)
    }


# -------- SURF SPOTS --------

@app.get(
    "/spots",
    response_model=list[SurfSpotResponse]
)
def list_spots(
    db: Session = Depends(get_db)
):
    return db.scalars(
        select(SurfSpot).order_by(SurfSpot.id)
    ).all()


@app.get("/spots/{spot_id}/forecast")
async def spot_forecast(
    spot_id: str,
    db: Session = Depends(get_db)
):
    spot = db.scalar(
        select(SurfSpot).where(
            SurfSpot.slug == spot_id
        )
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing = db.scalar(
        select(SurfSpot).where(
            SurfSpot.slug == spot.slug
        )
    )

    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="Surf spot already exists"
        )

    new_spot = SurfSpot(**spot.model_dump())

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


# -------- CREATE ALERT --------

@app.post(
    "/alerts",
    response_model=AlertResponse,
    status_code=201
)
def create_alert(
    alert: AlertCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    spot = db.get(
        SurfSpot,
        alert.spot_id
    )

    if spot is None:
        raise HTTPException(
            status_code=404,
            detail="Surf spot not found"
        )

    new_alert = Alert(
        **alert.model_dump(),
        user_id=current_user.id
    )

    db.add(new_alert)
    db.commit()
    db.refresh(new_alert)

    return new_alert


# -------- LIST MY ALERTS --------

@app.get(
    "/alerts",
    response_model=list[AlertResponse]
)
def list_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.scalars(
        select(Alert)
        .where(Alert.user_id == current_user.id)
        .order_by(Alert.id)
    ).all()


# -------- VIEW MY ALERT MATCHES --------

@app.get("/alerts/{alert_id}/matches")
async def get_alert_matches(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    alert = owned_alert(
        db,
        alert_id,
        current_user.id
    )

    spot = db.get(
        SurfSpot,
        alert.spot_id
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

    formatted_data = format_forecast(
        raw_data
    )

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


# -------- PAUSE / REACTIVATE --------

@app.patch(
    "/alerts/{alert_id}",
    response_model=AlertResponse
)
def update_alert_status(
    alert_id: int,
    update: AlertStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    alert = owned_alert(
        db,
        alert_id,
        current_user.id
    )

    alert.is_active = update.is_active

    db.commit()
    db.refresh(alert)

    return alert


# -------- EDIT MY ALERT --------

@app.put(
    "/alerts/{alert_id}",
    response_model=AlertResponse
)
def edit_alert(
    alert_id: int,
    update: AlertCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    alert = owned_alert(
        db,
        alert_id,
        current_user.id
    )

    spot = db.get(
        SurfSpot,
        update.spot_id
    )

    if spot is None:
        raise HTTPException(
            status_code=404,
            detail="Surf spot not found"
        )

    for field, value in update.model_dump().items():
        setattr(alert, field, value)

    # user_id cannot be changed through this endpoint.

    db.commit()
    db.refresh(alert)

    return alert


# -------- DELETE MY ALERT --------

@app.delete(
    "/alerts/{alert_id}",
    status_code=204
)
def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    alert = owned_alert(
        db,
        alert_id,
        current_user.id
    )

    db.execute(
        delete(AlertMatch).where(
            AlertMatch.alert_id == alert.id
        )
    )

    db.execute(
        delete(NotificationDelivery).where(
            NotificationDelivery.alert_id == alert.id
        )
    )

    db.delete(alert)
    db.commit()
