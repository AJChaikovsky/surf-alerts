def find_matching_hours(forecast, alert):
    """
    Return forecast hours meeting every alert condition.

    Wave height and swell period are required.
    Maximum wind speed is optional.
    """

    if not alert.is_active:
        return []

    matches = []

    max_wind = getattr(
        alert,
        "max_wind_speed_kn",
        None
    )

    for hour in forecast:
        wave_height = hour.get("wave_height_ft")
        swell_period = hour.get("swell_period_s")
        wind_speed = hour.get("wind_speed_kn")

        # Required forecast measurements
        if wave_height is None or swell_period is None:
            continue

        # Minimum wave height
        if wave_height < alert.min_wave_height_ft:
            continue

        # Maximum wave height
        if wave_height > alert.max_wave_height_ft:
            continue

        # Minimum swell period
        if swell_period < alert.min_swell_period_s:
            continue

        # Optional maximum wind speed
        if max_wind is not None:
            if wind_speed is None:
                continue

            if wind_speed > max_wind:
                continue

        matches.append(hour)

    return matches
