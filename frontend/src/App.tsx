
import { useEffect, useState, type FormEvent } from "react";

type SurfSpot = {
  id: number;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  region: string;
};

type ForecastHour = {
  time: string;
  wave_height_ft: number | null;
  wave_period_s: number | null;
  swell_height_ft: number | null;
  swell_period_s: number | null;
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
  is_active: boolean;
};

type AlertFormValues = {
  name: string;
  spot_id: string;
  min_wave_height_ft: string;
  max_wave_height_ft: string;
  min_swell_period_s: string;
};

function currentPacificHour(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:00`;
}

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
    return "Please fill out all fields.";
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
    return "Minimum wave height cannot exceed maximum.";
  }

  return null;
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
    is_active: isActive,
  };
}

function App() {
  // Surf spots and forecasts
  const [spots, setSpots] = useState<SurfSpot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<SurfSpot | null>(null);
  const [forecast, setForecast] = useState<ForecastHour[]>([]);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState("");

  // Saved alerts
  const [alerts, setAlerts] = useState<SurfAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [busyAlertId, setBusyAlertId] = useState<number | null>(null);

  // New alert form
  const [createValues, setCreateValues] = useState<AlertFormValues>({
    name: "",
    spot_id: "",
    min_wave_height_ft: "3",
    max_wave_height_ft: "6",
    min_swell_period_s: "12",
  });

  const [savingAlert, setSavingAlert] = useState(false);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");

  // Editing an existing alert
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<AlertFormValues>({
    name: "",
    spot_id: "",
    min_wave_height_ft: "",
    max_wave_height_ft: "",
    min_swell_period_s: "",
  });

  // Deleting an alert
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  // Saved alert feedback
  const [alertError, setAlertError] = useState("");
  const [dashboardError, setDashboardError] = useState("");

  // Load surf spots and saved alerts
  useEffect(() => {
    async function loadData() {
      try {
        const [spotsResponse, alertsResponse] = await Promise.all([
          fetch("/api/spots"),
          fetch("/api/alerts"),
        ]);

        if (!spotsResponse.ok || !alertsResponse.ok) {
          throw new Error("Failed to load dashboard");
        }

        const spotsData: SurfSpot[] = await spotsResponse.json();
        const alertsData: SurfAlert[] = await alertsResponse.json();

        setSpots(spotsData);
        setAlerts(alertsData);

        if (spotsData.length > 0) {
          setCreateValues((previous) => ({
            ...previous,
            spot_id: String(spotsData[0].id),
          }));
        }
      } catch {
        setDashboardError("Unable to load dashboard data.");
      } finally {
        setAlertsLoading(false);
      }
    }

    loadData();
  }, []);

  // Load the forecast for a selected surf spot
  async function selectSpot(spot: SurfSpot) {
    setSelectedSpot(spot);
    setForecast([]);
    setForecastLoading(true);
    setForecastError("");

    try {
      const response = await fetch(
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

  // Create a new alert
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
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(makeAlertPayload(createValues, true)),
      });

      if (!response.ok) {
        throw new Error("Create alert failed");
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

  // Pause or reactivate an alert
  async function toggleAlert(alert: SurfAlert) {
    setAlertError("");
    setBusyAlertId(alert.id);

    try {
      const response = await fetch(`/api/alerts/${alert.id}`, {
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

  // Open the edit form
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
    });
  }

  // Save edited alert preferences
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
      const response = await fetch(`/api/alerts/${alert.id}`, {
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

  // Permanently delete an alert
  async function deleteAlert(alertId: number) {
    setAlertError("");
    setBusyAlertId(alertId);

    try {
      const response = await fetch(`/api/alerts/${alertId}`, {
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

  return (
    <main className="dashboard">
      <header>
        <h1>Surf Alerts</h1>
        <p>Your personalized surf forecasting dashboard.</p>
      </header>

      {dashboardError && (
        <p className="error" role="alert">{dashboardError}</p>
      )}

      {/* Surf spots */}
      <section>
        <h2>Surf Spots</h2>

        <div className="spot-grid">
          {spots.map((spot) => (
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
      </section>

      {/* Forecast */}
      {forecastLoading && <p>Loading forecast...</p>}

      {forecastError && (
        <p className="error" role="alert">{forecastError}</p>
      )}

      {selectedSpot && !forecastLoading && !forecastError && (
        <section className="forecast-section">
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
                <div className="forecast-card" key={hour.time}>
                  <h3>{hour.time.replace("T", " ")}</h3>

                  <p>
                    Wave Height:
                    <strong> {hour.wave_height_ft ?? "N/A"} ft</strong>
                  </p>
                  <p>
                    Wave Period:
                    <strong> {hour.wave_period_s ?? "N/A"} s</strong>
                  </p>
                  <p>
                    Swell Height:
                    <strong> {hour.swell_height_ft ?? "N/A"} ft</strong>
                  </p>
                  <p>
                    Swell Period:
                    <strong> {hour.swell_period_s ?? "N/A"} s</strong>
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Create alert */}
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
              value={createValues.name}
              onChange={(e) =>
                setCreateValues((previous) => ({
                  ...previous,
                  name: e.target.value,
                }))
              }
              placeholder="Morning Surf Session"
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
              {spots.map((spot) => (
                <option key={spot.id} value={spot.id}>
                  {spot.name}
                </option>
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

      {/* Saved alerts */}
      <section className="alert-section">
        <h2>My Surf Alerts</h2>

        {alertsLoading && <p>Loading saved alerts...</p>}

        {!alertsLoading && alerts.length === 0 && (
          <p>You haven't created any surf alerts yet.</p>
        )}

        {alertError && (
          <p className="error" role="alert">{alertError}</p>
        )}

        <div className="saved-alerts">
          {alerts.map((alert) => (
            <div className="saved-alert-card" key={alert.id}>
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

              <p>
                Waves: {alert.min_wave_height_ft}–
                {alert.max_wave_height_ft} ft
              </p>
              <p>
                Minimum swell period: {alert.min_swell_period_s} s
              </p>

              {/* Edit form */}
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
                      maxLength={100}
                      required
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
                      value={editValues.spot_id}
                      onChange={(e) =>
                        setEditValues((previous) => ({
                          ...previous,
                          spot_id: e.target.value,
                        }))
                      }
                    >
                      {spots.map((spot) => (
                        <option key={spot.id} value={spot.id}>
                          {spot.name}
                        </option>
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

              {/* Normal alert controls */}
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

              {/* Delete confirmation */}
              {deleteConfirmId === alert.id && (
                <div className="delete-confirmation">
                  <p>
                    Permanently delete <strong>{alert.name}</strong>?
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
    </main>
  );
}

export default App;
