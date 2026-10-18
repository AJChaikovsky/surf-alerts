from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


class LocalBreakCreate(BaseModel):
    # A user's private break; the server assigns the slug and owner.
    name: str = Field(min_length=1, max_length=100)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    region: str = Field(default="", max_length=100)

    model_config = ConfigDict(str_strip_whitespace=True)


class SurfSpotResponse(BaseModel):
    id: int
    slug: str
    name: str
    latitude: float
    longitude: float
    region: str

    # True for the current user's own local breaks.
    is_custom: bool

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
