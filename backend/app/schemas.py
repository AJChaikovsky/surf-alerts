from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


class SurfSpotCreate(BaseModel):
    slug: str = Field(
        min_length=1,
        max_length=100,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
    )

    name: str = Field(min_length=1, max_length=100)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    region: str = Field(min_length=1, max_length=100)


class SurfSpotResponse(SurfSpotCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class AlertCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    spot_id: int = Field(gt=0)

    min_wave_height_ft: float = Field(ge=0)
    max_wave_height_ft: float = Field(ge=0)
    min_swell_period_s: float = Field(gt=0)

    max_wind_speed_kn: float | None = Field(
        default=None,
        ge=0
    )

    is_active: bool = True

    @model_validator(mode="after")
    def validate_wave_range(self):
        if self.min_wave_height_ft > self.max_wave_height_ft:
            raise ValueError(
                "Minimum wave height cannot exceed maximum wave height"
            )

        return self


class AlertResponse(AlertCreate):
    id: int

    model_config = ConfigDict(from_attributes=True)


class AlertStatusUpdate(BaseModel):
    is_active: bool
