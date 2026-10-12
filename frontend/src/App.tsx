
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

// Determine current hour in Los Angeles
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

function App() {
  // Surf spot state
  const [spots, setSpots] = useState<SurfSpot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<SurfSpot | null>(null);
  const [forecast, setForecast] = useState<ForecastHour[]>([]);
  const [forecastLoading, setForecastLoading] = useState(false);

  // Alert state
  const [alerts, setAlerts] = useState<SurfAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [savingAlert, setSavingAlert] = useState(false);
  const [updatingAlertId, setUpdatingAlertId] = useState<number | null>(null);

  // Create Alert form state
  const [alertName, setAlertName] = useState("");
  const [formSpotId, setFormSpotId] = useState("");
  const [minWave, setMinWave] = useState("3");
  const [maxWave, setMaxWave] = useState("6");
  const [minPeriod, setMinPeriod] = useState("12");

  // General dashboard messages
  const [error, setError] = useState("");
  const [forecastError, setForecastError] = useState("");

  // Create Alert form messages
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");

  // Load spots and alerts when page opens
  useEffect(() => {
    async function loadData() {
      try {
        const [spotsResponse, alertsResponse] = await Promise.all([
          fetch("/api/spots"),
          fetch("/api/alerts"),
        ]);

        if (!spotsResponse.ok || !alertsResponse.ok) {
          throw new Error("Failed to load dashboard data");
        }

        const spotsData: SurfSpot[] = await spotsResponse.json();
        const alertsData: SurfAlert[] = await alertsResponse.json();

        setSpots(spotsData);
        setAlerts(alertsData);

        if (spotsData.length > 0) {
          setFormSpotId(String(spotsData[0].id));
        }
      } catch {
        setError("Unable to load dashboard data.");
      } finally {
        setAlertsLoading(false);
      }
    }

    loadData();
  }, []);

  // Fetch the forecast for a selected surf spot
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

  // Create a new surf alert
  async function createAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Clear previous form notifications
    setFormError("");
    setFormMessage("");

    const min = Number(minWave);
    const max = Number(maxWave);
    const period = Number(minPeriod);

    // Validate required fields
    if (
      !alertName.trim() ||
      !formSpotId ||
      !minWave ||
      !maxWave ||
      !minPeriod
    ) {
      setFormError("Please fill out all fields.");
      return;
    }

    // Validate numerical inputs
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      !Number.isFinite(period) ||
      min < 0 ||
      max < 0 ||
      period <= 0
    ) {
      setFormError("Please enter valid positive surf conditions.");
      return;
    }

    // Validate wave height range
    if (min > max) {
      setFormError(
        "Minimum wave height cannot exceed maximum wave height."
      );
      return;
    }

    setSavingAlert(true);

    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: alertName.trim(),
          spot_id: Number(formSpotId),
          min_wave_height_ft: min,
          max_wave_height_ft: max,
          min_swell_period_s: period,
          is_active: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create alert");
      }

      const newAlert: SurfAlert = await response.json();

      // Add new alert to displayed list
      setAlerts((previous) => [...previous, newAlert]);

      // Clear the alert name
      setAlertName("");

      // Display success message inside the form
      setFormMessage("Surf alert created successfully!");
    } catch {
      setFormError("Unable to save your surf alert. Please try again.");
    } finally {
      setSavingAlert(false);
    }
  }

  // Pause or reactivate an existing alert
  async function toggleAlert(alert: SurfAlert) {
    setError("");
    setUpdatingAlertId(alert.id);

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
        throw new Error("Failed to update alert");
      }

      const updatedAlert: SurfAlert = await response.json();

      // Update the alert without refreshing the page
      setAlerts((previous) =>
        previous.map((item) =>
          item.id === updatedAlert.id ? updatedAlert : item
        )
      );
    } catch {
      setError("Unable to update alert status.");
    } finally {
      setUpdatingAlertId(null);
    }
  }

  // Find a surf spot name by its database ID
  function spotName(spotId: number) {
    return (
      spots.find((spot) => spot.id === spotId)?.name ??
      `Spot #${spotId}`
    );
  }

  return (
    <main className="dashboard">
      {/* Dashboard header */}
      <header>
        <h1>Surf Alerts</h1>
        <p>Your personalized surf forecasting dashboard.</p>
      </header>

      {/* General dashboard errors */}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
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

      {/* Forecast section */}
      {forecastLoading && <p>Loading forecast...</p>}

      {forecastError && (
        <p className="error" role="alert">
          {forecastError}
        </p>
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

      {/* Create Alert section */}
      <section className="alert-section">
        <h2>Create a Surf Alert</h2>

        <form className="alert-form" onSubmit={createAlert}>
          {/* Alert name */}
          <div className="form-group">
            <label htmlFor="alert-name">Alert Name</label>

            <input
              id="alert-name"
              type="text"
              value={alertName}
              onChange={(e) => setAlertName(e.target.value)}
              placeholder="Morning Surf Session"
              maxLength={100}
              required
            />
          </div>

          {/* Surf spot selection */}
          <div className="form-group">
            <label htmlFor="alert-spot">Surf Spot</label>

            <select
              id="alert-spot"
              value={formSpotId}
              onChange={(e) => setFormSpotId(e.target.value)}
              required
            >
              {spots.map((spot) => (
                <option key={spot.id} value={spot.id}>
                  {spot.name}
                </option>
              ))}
            </select>
          </div>

          {/* Wave height inputs */}
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
                value={minWave}
                onChange={(e) => setMinWave(e.target.value)}
                required
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
                value={maxWave}
                onChange={(e) => setMaxWave(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Minimum swell period */}
          <div className="form-group">
            <label htmlFor="min-period">
              Minimum Swell Period (seconds)
            </label>

            <input
              id="min-period"
              type="number"
              min="0.1"
              step="0.1"
              value={minPeriod}
              onChange={(e) => setMinPeriod(e.target.value)}
              required
            />
          </div>

          {/* Inline form notifications */}
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

          {/* Create Alert button */}
          <button
            className="primary-button"
            type="submit"
            disabled={savingAlert || spots.length === 0}
          >
            {savingAlert ? "Creating..." : "Create Alert"}
          </button>
        </form>
      </section>

      {/* Saved alerts section */}
      <section className="alert-section">
        <h2>My Surf Alerts</h2>

        {alertsLoading && <p>Loading saved alerts...</p>}

        {!alertsLoading && alerts.length === 0 && (
          <p>You haven't created any surf alerts yet.</p>
        )}

        <div className="saved-alerts">
          {alerts.map((alert) => (
            <div className="saved-alert-card" key={alert.id}>
              <div className="alert-heading">
                <div>
                  <h3>{alert.name}</h3>
                  <p>{spotName(alert.spot_id)}</p>
                </div>

                {/* Active / Paused colored circle */}
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

              {/* Pause / Reactivate button */}
              <button
                type="button"
                className="secondary-button"
                disabled={updatingAlertId === alert.id}
                onClick={() => toggleAlert(alert)}
              >
                {updatingAlertId === alert.id
                  ? "Updating..."
                  : alert.is_active
                    ? "Pause Alert"
                    : "Reactivate Alert"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
