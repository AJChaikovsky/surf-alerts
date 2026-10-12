from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# -------- USERS --------

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )


# -------- SURF SPOTS --------

class SurfSpot(Base):
    __tablename__ = "surf_spots"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    slug: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        nullable=False
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    latitude: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    longitude: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    region: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )


# -------- ALERTS --------

class Alert(Base):
    __tablename__ = "alerts"

    __table_args__ = (
        CheckConstraint(
            "min_wave_height_ft <= max_wave_height_ft",
            name="valid_wave_height_range"
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False
    )

    spot_id: Mapped[int] = mapped_column(
        ForeignKey("surf_spots.id"),
        nullable=False
    )

    min_wave_height_ft: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    max_wave_height_ft: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    min_swell_period_s: Mapped[float] = mapped_column(
        Float,
        nullable=False
    )

    max_wind_speed_kn: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
        default=None
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False
    )


# -------- MATCHED FORECAST HOURS --------

class AlertMatch(Base):
    __tablename__ = "alert_matches"

    __table_args__ = (
        UniqueConstraint(
            "alert_id",
            "forecast_time",
            name="uq_alert_matches_alert_time"
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    alert_id: Mapped[int] = mapped_column(
        ForeignKey("alerts.id"),
        nullable=False
    )

    forecast_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False
    )

    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )


# -------- NOTIFICATION DELIVERIES --------

class NotificationDelivery(Base):
    __tablename__ = "notification_deliveries"

    __table_args__ = (
        UniqueConstraint(
            "alert_id",
            "surf_date",
            name="uq_notification_alert_date"
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True
    )

    alert_id: Mapped[int] = mapped_column(
        ForeignKey("alerts.id"),
        nullable=False
    )

    surf_date: Mapped[date] = mapped_column(
        Date,
        nullable=False
    )

    recipient: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )

    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending"
    )

    provider_message_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )
