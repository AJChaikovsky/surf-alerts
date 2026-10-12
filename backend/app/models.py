from sqlalchemy import Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from sqlalchemy import Boolean, ForeignKey, CheckConstraint

from datetime import datetime

from sqlalchemy import DateTime, UniqueConstraint, func


class SurfSpot(Base):
    __tablename__ = "surf_spots"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True
    )

    slug: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False
    )

    name: Mapped[str] = mapped_column(
        String(100), nullable=False
    )

    latitude: Mapped[float] = mapped_column(
        Float, nullable=False
    )

    longitude: Mapped[float] = mapped_column(
        Float, nullable=False
    )

    region: Mapped[str] = mapped_column(
        String(100), nullable=False
    )

class Alert(Base):
    __tablename__ = "alerts"

    __table_args__ = (
        CheckConstraint(
            "min_wave_height_ft <= max_wave_height_ft",
            name="valid_wave_height_range"
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True
    )

    name: Mapped[str] = mapped_column(
        String(100), nullable=False
    )

    spot_id: Mapped[int] = mapped_column(
        ForeignKey("surf_spots.id"),
        nullable=False
    )

    min_wave_height_ft: Mapped[float] = mapped_column(
        Float, nullable=False
    )

    max_wave_height_ft: Mapped[float] = mapped_column(
        Float, nullable=False
    )

    min_swell_period_s: Mapped[float] = mapped_column(
        Float, nullable=False
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )


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
