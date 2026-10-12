
def find_matching_hours(forecast: list[dict], alert):
    """
    Return forecast hours that satisfy an alert's conditions.
    """

    if not alert.is_active:
        return []

    matches = []

    for hour in forecast:
        wave_height = hour.get("wave_height_ft")
        swell_period = hour.get("swell_period_s")

        # Skip hours with missing forecast data
        if wave_height is None or swell_period is None:
            continue

        wave_matches = (
            alert.min_wave_height_ft
            <= wave_height
            <= alert.max_wave_height_ft
        )

        period_matches = (
            swell_period >= alert.min_swell_period_s
        )

        if wave_matches and period_matches:
            matches.append(hour)

    return matches
