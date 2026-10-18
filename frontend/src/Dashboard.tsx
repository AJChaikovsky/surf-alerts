import { useEffect, useRef, useState, type FormEvent } from "react";
import ForecastCard, {
  type ForecastHour,
} from "./components/ForecastCard";
import { apiFetch } from "./api";
import { currentPacificHour } from "./time";

export type DashboardView = "spots" | "alerts";

type SurfSpot = {
  id: number;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  region: string;
  is_custom: boolean;
};

type SpotForecast = {
  spot: string;
  region: string;
  forecast: ForecastHour[];
};

type SurfAlert = {
  id: number;
  name: string;
  spot_id: number;
  min_wave_height_ft: number;
  max_wave_height_ft: number;
  min_swell_period_s: number;
  max_wind_speed_kn: number | null;
  is_active: boolean;
};

type AlertFormValues = {
  name: string;
  spot_id: string;
  min_wave_height_ft: string;
  max_wave_height_ft: string;
  min_swell_period_s: string;
  max_wind_speed_kn: string;
};

// -------- HELPER FUNCTIONS --------

function validateAlert(values: AlertFormValues): string | null {
  const min = Number(values.min_wave_height_ft);
  const max = Number(values.max_wave_height_ft);
  const period = Number(values.min_swell_period_s);

  if (
    !values.name.trim() ||
    !values.spot_id ||
    !values.min_wave_height_ft ||
    !values.max_wave_height_ft ||
    !values.min_swell_period_s
  ) {
    return "Please fill out all required fields.";
  }

  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    !Number.isFinite(period) ||
    min < 0 ||
    max < 0 ||
    period <= 0
  ) {
    return "Please enter valid surf conditions.";
  }

  if (min > max) {
    return "Minimum wave height cannot exceed maximum wave height.";
  }

  if (values.max_wind_speed_kn.trim() !== "") {
    const maxWind = Number(values.max_wind_speed_kn);

    if (!Number.isFinite(maxWind) || maxWind < 0) {
      return "Maximum wind speed must be zero or greater.";
    }
  }

  return null;
}

const LOCAL_BREAKS_GROUP = "My Local Breaks";

// Group spots by region, ordering regions and spots north to south.
// The user's own local breaks come first, in a group of their own.
function groupSpotsByRegion(
  spots: SurfSpot[]
): { region: string; spots: SurfSpot[] }[] {
  const groups = new Map<string, SurfSpot[]>();

  for (const spot of spots) {
    const group = spot.is_custom ? LOCAL_BREAKS_GROUP : spot.region;
    groups.set(group, [...(groups.get(group) ?? []), spot]);
  }

  return [...groups.entries()]
    .map(([region, regionSpots]) => ({
      region,
      spots: [...regionSpots].sort((a, b) => b.latitude - a.latitude),
    }))
    .sort((a, b) => {
      if (a.region === LOCAL_BREAKS_GROUP) return -1;
      if (b.region === LOCAL_BREAKS_GROUP) return 1;
      return b.spots[0].latitude - a.spots[0].latitude;
    });
}

function matchesSpotSearch(spot: SurfSpot, query: string): boolean {
  const search = query.trim().toLowerCase();

  return (
    search === "" ||
    spot.name.toLowerCase().includes(search) ||
    spot.region.toLowerCase().includes(search)
  );
}

function makeAlertPayload(
  values: AlertFormValues,
  isActive: boolean
) {
  return {
    name: values.name.trim(),
    spot_id: Number(values.spot_id),
    min_wave_height_ft: Number(values.min_wave_height_ft),
    max_wave_height_ft: Number(values.max_wave_height_ft),
    min_swell_period_s: Number(values.min_swell_period_s),

    max_wind_speed_kn:
      values.max_wind_speed_kn.trim() === ""
        ? null
        : Number(values.max_wind_speed_kn),

    is_active: isActive,
  };
}

// -------- MAIN APP --------

function App({ view }: { view: DashboardView }) {
  const [spots, setSpots] = useState<SurfSpot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<SurfSpot | null>(null);

  const [forecast, setForecast] = useState<ForecastHour[]>([]);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState("");

  const [spotSearch, setSpotSearch] = useState("");
  const forecastRef = useRef<HTMLElement | null>(null);

  const [alerts, setAlerts] = useState<SurfAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [busyAlertId, setBusyAlertId] = useState<number | null>(null);

  // -------- CREATE FORM --------

  const [createValues, setCreateValues] = useState<AlertFormValues>({
    name: "",
    spot_id: "",
    min_wave_height_ft: "3",
    max_wave_height_ft: "6",
    min_swell_period_s: "12",
    max_wind_speed_kn: "",
  });

  const [savingAlert, setSavingAlert] = useState(false);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");

  // -------- EDIT FORM --------

  const [editingId, setEditingId] = useState<number | null>(null);

  const [editValues, setEditValues] = useState<AlertFormValues>({
    name: "",
    spot_id: "",
    min_wave_height_ft: "",
    max_wave_height_ft: "",
    min_swell_period_s: "",
    max_wind_speed_kn: "",
  });

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const [alertError, setAlertError] = useState("");
  const [dashboardError, setDashboardError] = useState("");

  // -------- LOAD DATA --------

  useEffect(() => {
    async function loadData() {
      try {
        const [spotsResponse, alertsResponse] = await Promise.all([
          apiFetch("/api/spots"),
          apiFetch("/api/alerts"),
        ]);

        if (!spotsResponse.ok || !alertsResponse.ok) {
          throw new Error("Failed to load dashboard");
        }

        const spotsData: SurfSpot[] = await spotsResponse.json();
        const alertsData: SurfAlert[] = await alertsResponse.json();

        setSpots(spotsData);
        setAlerts(alertsData);

        // "Add to alerts" on the map links to #/alerts?spot=<id>.
        const requestedSpotId = Number(
          new URLSearchParams(window.location.hash.split("?")[1]).get("spot")
        );
        const requestedSpot = spotsData.find(
          (spot) => spot.id === requestedSpotId
        );

        if (spotsData.length > 0) {
          setCreateValues((previous) => ({
            ...previous,
            spot_id: String((requestedSpot ?? spotsData[0]).id),
          }));
        }

        if (requestedSpot) {
          // Drop the parameter so a refresh doesn't reapply it.
          window.history.replaceState(null, "", "#/alerts");

          setFormMessage(
            `${requestedSpot.name} is selected. Name your alert and set its conditions.`
          );

          requestAnimationFrame(() => {
            document.getElementById("alert-name")?.focus();
          });
        }
      } catch {
        setDashboardError("Unable to load dashboard data.");
      } finally {
        setAlertsLoading(false);
      }
    }

    loadData();
  }, []);

  // -------- SCROLL TO FORECAST --------
  // With many spots the forecast renders far below the cards.

  useEffect(() => {
    if (selectedSpot && !forecastLoading) {
      forecastRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [selectedSpot, forecastLoading]);

  // -------- FETCH FORECAST --------

  async function selectSpot(spot: SurfSpot) {
    setSelectedSpot(spot);
    setForecast([]);
    setForecastLoading(true);
    setForecastError("");

    try {
      const response = await apiFetch(
        `/api/spots/${spot.slug}/forecast`
      );

      if (!response.ok) {
        throw new Error("Forecast request failed");
      }

      const data: SpotForecast = await response.json();

      const upcoming = data.forecast
        .filter((hour) => hour.time >= currentPacificHour())
        .slice(0, 12);

      setForecast(upcoming);
    } catch {
      setForecastError("Unable to load this forecast.");
    } finally {
      setForecastLoading(false);
    }
  }

  // -------- CREATE ALERT --------

  async function createAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setFormError("");
    setFormMessage("");

    const validationError = validateAlert(createValues);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSavingAlert(true);

    try {
      const response = await apiFetch("/api/alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          makeAlertPayload(createValues, true)
        ),
      });

      if (!response.ok) {
        throw new Error("Create failed");
      }

      const newAlert: SurfAlert = await response.json();

      setAlerts((previous) => [...previous, newAlert]);

      setCreateValues((previous) => ({
        ...previous,
        name: "",
      }));

      setFormMessage("Surf alert created successfully!");
    } catch {
      setFormError("Unable to create alert. Please try again.");
    } finally {
      setSavingAlert(false);
    }
  }

  // -------- PAUSE / REACTIVATE --------

  async function toggleAlert(alert: SurfAlert) {
    setAlertError("");
    setBusyAlertId(alert.id);

    try {
      const response = await apiFetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_active: !alert.is_active,
        }),
      });

      if (!response.ok) {
        throw new Error("Status update failed");
      }

      const updated: SurfAlert = await response.json();

      setAlerts((previous) =>
        previous.map((item) =>
          item.id === updated.id ? updated : item
        )
      );
    } catch {
      setAlertError("Unable to update alert status.");
    } finally {
      setBusyAlertId(null);
    }
  }

  // -------- OPEN EDIT FORM --------

  function startEditing(alert: SurfAlert) {
    setAlertError("");
    setDeleteConfirmId(null);
    setEditingId(alert.id);

    setEditValues({
      name: alert.name,
      spot_id: String(alert.spot_id),
      min_wave_height_ft: String(alert.min_wave_height_ft),
      max_wave_height_ft: String(alert.max_wave_height_ft),
      min_swell_period_s: String(alert.min_swell_period_s),
      max_wind_speed_kn:
        alert.max_wind_speed_kn === null
          ? ""
          : String(alert.max_wind_speed_kn),
    });
  }

  // -------- SAVE EDITED ALERT --------

  async function saveEdit(
    event: FormEvent<HTMLFormElement>,
    alert: SurfAlert
  ) {
    event.preventDefault();
    setAlertError("");

    const validationError = validateAlert(editValues);

    if (validationError) {
      setAlertError(validationError);
      return;
    }

    setBusyAlertId(alert.id);

    try {
      const response = await apiFetch(`/api/alerts/${alert.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          makeAlertPayload(editValues, alert.is_active)
        ),
      });

      if (!response.ok) {
        throw new Error("Edit failed");
      }

      const updated: SurfAlert = await response.json();

      setAlerts((previous) =>
        previous.map((item) =>
          item.id === updated.id ? updated : item
        )
      );

      setEditingId(null);
    } catch {
      setAlertError("Unable to save changes to this alert.");
    } finally {
      setBusyAlertId(null);
    }
  }

  // -------- DELETE ALERT --------

  async function deleteAlert(alertId: number) {
    setAlertError("");
    setBusyAlertId(alertId);

    try {
      const response = await apiFetch(`/api/alerts/${alertId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      setAlerts((previous) =>
        previous.filter((alert) => alert.id !== alertId)
      );

      setDeleteConfirmId(null);
      setEditingId(null);
    } catch {
      setAlertError("Unable to delete this alert.");
    } finally {
      setBusyAlertId(null);
    }
  }

  function spotName(spotId: number): string {
    return (
      spots.find((spot) => spot.id === spotId)?.name ??
      `Spot #${spotId}`
    );
  }

  // -------- RENDER --------

  return (
    <main className="dashboard">

      {/* HEADER */}

      <header>
        {view === "spots" ? (
          <>
            <h1>Surf Forecasts</h1>
            <p>Pick a surf spot to see its upcoming hourly forecast.</p>
          </>
        ) : (
          <>
            <h1>My Alerts</h1>
            <p>Create surf alerts and manage the conditions you're watching for.</p>
          </>
        )}
      </header>

      {dashboardError && (
        <p className="error" role="alert">
          {dashboardError}
        </p>
      )}

      {view === "spots" && (
        <>
          {/* SURF SPOTS */}

          <section>
            <h2>Surf Spots</h2>

            <div className="spot-search">
              <label htmlFor="spot-search">Search spots</label>

              <input
                id="spot-search"
                type="search"
                placeholder="Search by name or region, e.g. Trestles or San Diego"
                value={spotSearch}
                onChange={(e) => setSpotSearch(e.target.value)}
              />
            </div>

            {spots.length > 0 &&
              !spots.some((spot) => matchesSpotSearch(spot, spotSearch)) && (
                <p className="spot-search-empty">
                  No spots match "{spotSearch.trim()}".
                </p>
              )}

            {groupSpotsByRegion(
              spots.filter((spot) => matchesSpotSearch(spot, spotSearch))
            ).map((group) => (
              <div className="spot-region" key={group.region}>
                <h3 className="spot-region-heading">{group.region}</h3>

                <div className="spot-grid">
                  {group.spots.map((spot) => (
                    <button
                      key={spot.id}
                      type="button"
                      className={
                        selectedSpot?.id === spot.id
                          ? "spot-card selected"
                          : "spot-card"
                      }
                      onClick={() => selectSpot(spot)}
                    >
                      <h3>{spot.name}</h3>
                      <p>{spot.region}</p>
                      <span>View Forecast →</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* FORECAST */}

          {forecastLoading && (
            <p>Loading forecast...</p>
          )}

          {forecastError && (
            <p className="error" role="alert">
              {forecastError}
            </p>
          )}

          {selectedSpot && !forecastLoading && !forecastError && (
            <section className="forecast-section" ref={forecastRef}>
              <h2>{selectedSpot.name} Forecast</h2>

              <p className="forecast-note">
                Offshore modeled wave conditions, not exact
                breaking-wave heights.
              </p>

              {forecast.length === 0 ? (
                <p>No upcoming forecast data available.</p>
              ) : (
                <div className="forecast-grid">
                  {forecast.map((hour) => (
                    <ForecastCard
                      key={hour.time}
                      forecast={hour}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {view === "alerts" && (
        <>
          {/* CREATE ALERT */}

          <section className="alert-section">
            <h2>Create a Surf Alert</h2>

            <form className="alert-form" onSubmit={createAlert}>

              <div className="form-group">
                <label htmlFor="alert-name">Alert Name</label>

                <input
                  id="alert-name"
                  type="text"
                  maxLength={100}
                  required
                  placeholder="Morning Surf Session"
                  value={createValues.name}
                  onChange={(e) =>
                    setCreateValues((previous) => ({
                      ...previous,
                      name: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="alert-spot">Surf Spot</label>

                <select
                  id="alert-spot"
                  required
                  value={createValues.spot_id}
                  onChange={(e) =>
                    setCreateValues((previous) => ({
                      ...previous,
                      spot_id: e.target.value,
                    }))
                  }
                >
                  {groupSpotsByRegion(spots).map((group) => (
                    <optgroup key={group.region} label={group.region}>
                      {group.spots.map((spot) => (
                        <option key={spot.id} value={spot.id}>
                          {spot.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="form-row">

                <div className="form-group">
                  <label htmlFor="min-wave">
                    Minimum Wave Height (ft)
                  </label>

                  <input
                    id="min-wave"
                    type="number"
                    min="0"
                    step="0.1"
                    required
                    value={createValues.min_wave_height_ft}
                    onChange={(e) =>
                      setCreateValues((previous) => ({
                        ...previous,
                        min_wave_height_ft: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="max-wave">
                    Maximum Wave Height (ft)
                  </label>

                  <input
                    id="max-wave"
                    type="number"
                    min="0"
                    step="0.1"
                    required
                    value={createValues.max_wave_height_ft}
                    onChange={(e) =>
                      setCreateValues((previous) => ({
                        ...previous,
                        max_wave_height_ft: e.target.value,
                      }))
                    }
                  />
                </div>

              </div>

              <div className="form-group">
                <label htmlFor="min-period">
                  Minimum Swell Period (seconds)
                </label>

                <input
                  id="min-period"
                  type="number"
                  min="0.1"
                  step="0.1"
                  required
                  value={createValues.min_swell_period_s}
                  onChange={(e) =>
                    setCreateValues((previous) => ({
                      ...previous,
                      min_swell_period_s: e.target.value,
                    }))
                  }
                />
              </div>

              {/* NEW WIND SPEED FIELD */}

              <div className="form-group">
                <label htmlFor="max-wind">
                  Maximum Wind Speed (knots)
                </label>

                <input
                  id="max-wind"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="Optional, e.g. 8"
                  value={createValues.max_wind_speed_kn}
                  onChange={(e) =>
                    setCreateValues((previous) => ({
                      ...previous,
                      max_wind_speed_kn: e.target.value,
                    }))
                  }
                />

                <small>
                  Leave blank for no wind speed restriction.
                </small>
              </div>

              {/* FORM NOTIFICATIONS */}

              {formError && (
                <div
                  className="form-notification form-notification-error"
                  role="alert"
                >
                  <span aria-hidden="true">✕</span>
                  <span>{formError}</span>
                </div>
              )}

              {formMessage && (
                <div
                  className="form-notification form-notification-success"
                  role="status"
                >
                  <span aria-hidden="true">✓</span>
                  <span>{formMessage}</span>
                </div>
              )}

              <button
                className="primary-button"
                type="submit"
                disabled={savingAlert || spots.length === 0}
              >
                {savingAlert ? "Creating..." : "Create Alert"}
              </button>

            </form>
          </section>

          {/* SAVED ALERTS */}

          <section className="alert-section">
            <h2>My Surf Alerts</h2>

            {alertsLoading && (
              <p>Loading saved alerts...</p>
            )}

            {!alertsLoading && alerts.length === 0 && (
              <p>You haven't created any surf alerts yet.</p>
            )}

            {alertError && (
              <p className="error" role="alert">
                {alertError}
              </p>
            )}

            <div className="saved-alerts">

              {alerts.map((alert) => (
                <div
                  className="saved-alert-card"
                  key={alert.id}
                >

                  {/* ALERT HEADING */}

                  <div className="alert-heading">
                    <div>
                      <h3>{alert.name}</h3>
                      <p>{spotName(alert.spot_id)}</p>
                    </div>

                    <div className="alert-status">
                      <span
                        className={
                          alert.is_active
                            ? "status-dot active"
                            : "status-dot paused"
                        }
                        aria-hidden="true"
                      />

                      <span>
                        {alert.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                  </div>

                  {/* SAVED CONDITIONS */}

                  <p>
                    Waves: {alert.min_wave_height_ft}–
                    {alert.max_wave_height_ft} ft
                  </p>

                  <p>
                    Minimum swell period: {alert.min_swell_period_s} s
                  </p>

                  <p>
                    Maximum wind speed:{" "}
                    {alert.max_wind_speed_kn === null
                      ? "No restriction"
                      : `${alert.max_wind_speed_kn} kn`}
                  </p>

                  {/* EDIT FORM */}

                  {editingId === alert.id && (
                    <form
                      className="edit-form"
                      onSubmit={(event) => saveEdit(event, alert)}
                    >

                      <div className="form-group">
                        <label htmlFor={`edit-name-${alert.id}`}>
                          Alert Name
                        </label>

                        <input
                          id={`edit-name-${alert.id}`}
                          type="text"
                          required
                          maxLength={100}
                          value={editValues.name}
                          onChange={(e) =>
                            setEditValues((previous) => ({
                              ...previous,
                              name: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor={`edit-spot-${alert.id}`}>
                          Surf Spot
                        </label>

                        <select
                          id={`edit-spot-${alert.id}`}
                          required
                          value={editValues.spot_id}
                          onChange={(e) =>
                            setEditValues((previous) => ({
                              ...previous,
                              spot_id: e.target.value,
                            }))
                          }
                        >
                          {groupSpotsByRegion(spots).map((group) => (
                            <optgroup key={group.region} label={group.region}>
                              {group.spots.map((spot) => (
                                <option key={spot.id} value={spot.id}>
                                  {spot.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor={`edit-min-${alert.id}`}>
                          Minimum Wave Height (ft)
                        </label>

                        <input
                          id={`edit-min-${alert.id}`}
                          type="number"
                          min="0"
                          step="0.1"
                          required
                          value={editValues.min_wave_height_ft}
                          onChange={(e) =>
                            setEditValues((previous) => ({
                              ...previous,
                              min_wave_height_ft: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor={`edit-max-${alert.id}`}>
                          Maximum Wave Height (ft)
                        </label>

                        <input
                          id={`edit-max-${alert.id}`}
                          type="number"
                          min="0"
                          step="0.1"
                          required
                          value={editValues.max_wave_height_ft}
                          onChange={(e) =>
                            setEditValues((previous) => ({
                              ...previous,
                              max_wave_height_ft: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor={`edit-period-${alert.id}`}>
                          Minimum Swell Period (seconds)
                        </label>

                        <input
                          id={`edit-period-${alert.id}`}
                          type="number"
                          min="0.1"
                          step="0.1"
                          required
                          value={editValues.min_swell_period_s}
                          onChange={(e) =>
                            setEditValues((previous) => ({
                              ...previous,
                              min_swell_period_s: e.target.value,
                            }))
                          }
                        />
                      </div>

                      {/* NEW EDIT WIND FIELD */}

                      <div className="form-group">
                        <label htmlFor={`edit-wind-${alert.id}`}>
                          Maximum Wind Speed (knots)
                        </label>

                        <input
                          id={`edit-wind-${alert.id}`}
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="Optional"
                          value={editValues.max_wind_speed_kn}
                          onChange={(e) =>
                            setEditValues((previous) => ({
                              ...previous,
                              max_wind_speed_kn: e.target.value,
                            }))
                          }
                        />

                        <small>
                          Leave blank for no wind restriction.
                        </small>
                      </div>

                      <div className="alert-actions">

                        <button
                          className="primary-button"
                          type="submit"
                          disabled={busyAlertId === alert.id}
                        >
                          {busyAlertId === alert.id
                            ? "Saving..."
                            : "Save Changes"}
                        </button>

                        <button
                          className="secondary-button"
                          type="button"
                          disabled={busyAlertId === alert.id}
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </button>

                      </div>
                    </form>
                  )}

                  {/* NORMAL ALERT BUTTONS */}

                  {editingId !== alert.id &&
                    deleteConfirmId !== alert.id && (
                      <div className="alert-actions">

                        <button
                          className="secondary-button"
                          type="button"
                          disabled={busyAlertId === alert.id}
                          onClick={() => startEditing(alert)}
                        >
                          Edit
                        </button>

                        <button
                          className="secondary-button"
                          type="button"
                          disabled={busyAlertId === alert.id}
                          onClick={() => toggleAlert(alert)}
                        >
                          {busyAlertId === alert.id
                            ? "Updating..."
                            : alert.is_active
                              ? "Pause"
                              : "Reactivate"}
                        </button>

                        <button
                          className="delete-button"
                          type="button"
                          disabled={busyAlertId === alert.id}
                          onClick={() => {
                            setEditingId(null);
                            setAlertError("");
                            setDeleteConfirmId(alert.id);
                          }}
                        >
                          Delete
                        </button>

                      </div>
                    )}

                  {/* DELETE CONFIRMATION */}

                  {deleteConfirmId === alert.id && (
                    <div className="delete-confirmation">

                      <p>
                        Permanently delete{" "}
                        <strong>{alert.name}</strong>?
                        Its saved matches and notification history
                        will also be removed.
                      </p>

                      <div className="alert-actions">

                        <button
                          className="delete-button"
                          type="button"
                          disabled={busyAlertId === alert.id}
                          onClick={() => deleteAlert(alert.id)}
                        >
                          {busyAlertId === alert.id
                            ? "Deleting..."
                            : "Yes, Delete"}
                        </button>

                        <button
                          className="secondary-button"
                          type="button"
                          disabled={busyAlertId === alert.id}
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          Cancel
                        </button>

                      </div>
                    </div>
                  )}

                </div>
              ))}

            </div>
          </section>
        </>
      )}

    </main>
  );
}

export default App;
