
import logging
import math
import re
import secrets

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import (
    check_rate_limit,
    client_ip,
    csrf_is_valid,
    get_current_user,
    get_optional_user,
    record_attempt,
    router as auth_router,
    security_log,
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
    LocalBreakCreate,
    SurfSpotResponse,
)

from app.services.forecast import (
    format_forecast,
    get_forecast,
)

from app.services.matching import find_matching_hours


# uvicorn only configures its own loggers; this makes
# app loggers such as app.security visible too.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)

app = FastAPI(title="Surf Alerts API")
app.include_router(auth_router)


# -------- CSRF PROTECTION --------

@app.middleware("http")
async def require_csrf_token(request: Request, call_next):
    # Reject state-changing requests that don't echo
    # the CSRF cookie back in the X-CSRF-Token header.
    if not csrf_is_valid(request):
        security_log.warning(
            "csrf_rejected method=%s path=%s ip=%s",
            request.method,
            request.url.path,
            client_ip(request)
        )

        return JSONResponse(
            status_code=403,
            content={"detail": "Invalid or missing CSRF token"}
        )

    return await call_next(request)


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


# -------- CHECK SPOT VISIBILITY --------
# Curated spots are visible to everyone; a local break only to
# the user who added it.

MAX_LOCAL_BREAKS = 3

# Each attempt calls Open-Meteo, and deleting frees a slot,
# so cap attempts too.
LOCAL_BREAK_ATTEMPTS_PER_HOUR = 10


def spot_visible_to(user: User | None):
    if user is None:
        return SurfSpot.user_id.is_(None)

    return or_(
        SurfSpot.user_id.is_(None),
        SurfSpot.user_id == user.id
    )


def visible_spot(
    db: Session,
    spot_id: int,
    user: User | None
) -> SurfSpot:
    spot = db.scalar(
        select(SurfSpot).where(
            SurfSpot.id == spot_id,
            spot_visible_to(user)
        )
    )

    if spot is None:
        raise HTTPException(
            status_code=404,
            detail="Surf spot not found"
        )

    return spot


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
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user)
):
    return db.scalars(
        select(SurfSpot)
        .where(spot_visible_to(current_user))
        .order_by(SurfSpot.id)
    ).all()


@app.get("/spots/{spot_id}/forecast")
async def spot_forecast(
    spot_id: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_user)
):
    spot = db.scalar(
        select(SurfSpot).where(
            SurfSpot.slug == spot_id,
            spot_visible_to(current_user)
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


# Open-Meteo snaps a point to the nearest ocean grid cell (about
# 8 km apart), even from well inland, and reports which cell it
# used. A real break's cell is close by; one 20 km away isn't.
MAX_GRID_CELL_DISTANCE_KM = 10


def distance_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float
) -> float:
    # Haversine great-circle distance.
    lat1, lon1, lat2, lon2 = map(math.radians, (lat1, lon1, lat2, lon2))

    a = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2)
        * math.sin((lon2 - lon1) / 2) ** 2
    )

    return 6371 * 2 * math.asin(math.sqrt(a))


async def location_has_wave_data(
    latitude: float,
    longitude: float
) -> bool:
    raw_data = await get_forecast(latitude, longitude)

    cell_distance = distance_km(
        latitude,
        longitude,
        raw_data["latitude"],
        raw_data["longitude"]
    )

    if cell_distance > MAX_GRID_CELL_DISTANCE_KM:
        return False

    return any(
        hour.get("wave_height_ft") is not None
        for hour in format_forecast(raw_data)
    )


def make_slug(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

    return f"{base[:80] or 'break'}-{secrets.token_hex(3)}"


@app.post(
    "/spots",
    response_model=SurfSpotResponse,
    status_code=201
)
async def create_local_break(
    spot: LocalBreakCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    attempts_key = f"local-break:{current_user.id}"

    check_rate_limit(
        attempts_key,
        LOCAL_BREAK_ATTEMPTS_PER_HOUR,
        60 * 60
    )
    record_attempt(attempts_key)

    owned_count = db.scalar(
        select(func.count())
        .select_from(SurfSpot)
        .where(SurfSpot.user_id == current_user.id)
    )

    if owned_count >= MAX_LOCAL_BREAKS:
        raise HTTPException(
            status_code=409,
            detail=(
                f"You can add up to {MAX_LOCAL_BREAKS} local breaks. "
                "Delete one to add another."
            )
        )

    try:
        has_waves = await location_has_wave_data(
            spot.latitude,
            spot.longitude
        )

    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve data right now. Please try again."
        )

    if not has_waves:
        raise HTTPException(
            status_code=422,
            detail=(
                "Unable to retrieve data for these coordinates. "
                "Try a point slightly offshore of the break."
            )
        )

    new_spot = SurfSpot(
        slug=make_slug(spot.name),
        name=spot.name,
        latitude=spot.latitude,
        longitude=spot.longitude,
        region=spot.region or "Local",
        user_id=current_user.id
    )

    try:
        db.add(new_spot)
        db.commit()
        db.refresh(new_spot)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Couldn't save this break. Please try again."
        )

    return new_spot


@app.delete(
    "/spots/{spot_id}",
    status_code=204
)
def delete_local_break(
    spot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    spot = db.scalar(
        select(SurfSpot).where(
            SurfSpot.id == spot_id,
            SurfSpot.user_id == current_user.id
        )
    )

    # Curated spots and other users' breaks look the same: not found.
    if spot is None:
        raise HTTPException(
            status_code=404,
            detail="Local break not found"
        )

    alerts_using_spot = db.scalar(
        select(func.count())
        .select_from(Alert)
        .where(Alert.spot_id == spot.id)
    )

    # Don't silently delete alerts (and their history) with the break.
    if alerts_using_spot:
        raise HTTPException(
            status_code=409,
            detail=(
                "This break is used by an alert. "
                "Delete or change that alert first."
            )
        )

    db.delete(spot)
    db.commit()


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
    visible_spot(db, alert.spot_id, current_user)

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

    visible_spot(db, update.spot_id, current_user)

    for field, value in update.model_dump().items():
        setattr(alert, field, value)

    # user_id cannot be changed through this endpoint.

    db.commit()
    db.refresh(alert)

    return alert


# -------- VIEW MY ALERT HISTORY --------

HISTORY_LIMIT = 20


@app.get("/alerts/{alert_id}/history")
def get_alert_history(
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

    matches = db.scalars(
        select(AlertMatch)
        .where(AlertMatch.alert_id == alert.id)
        .order_by(
            AlertMatch.detected_at.desc(),
            AlertMatch.id.desc()
        )
        .limit(HISTORY_LIMIT)
    ).all()

    deliveries = db.scalars(
        select(NotificationDelivery)
        .where(NotificationDelivery.alert_id == alert.id)
        .order_by(
            NotificationDelivery.created_at.desc(),
            NotificationDelivery.id.desc()
        )
        .limit(HISTORY_LIMIT)
    ).all()

    return {
        "alert_id": alert.id,
        "alert_name": alert.name,
        "spot": spot.name if spot else None,
        "matches": [
            {
                "id": match.id,
                "forecast_time": match.forecast_time,
                "detected_at": match.detected_at,
            }
            for match in matches
        ],
        "deliveries": [
            {
                "id": delivery.id,
                "surf_date": delivery.surf_date,
                "recipient": delivery.recipient,
                "status": delivery.status,
                "created_at": delivery.created_at,
                "sent_at": delivery.sent_at,
            }
            for delivery in deliveries
        ],
    }


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
