
import { useEffect, useState } from "react";

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

// Get the current hour in Los Angeles local time
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
  const [spots, setSpots] = useState<SurfSpot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<SurfSpot | null>(null);
  const [forecast, setForecast] = useState<ForecastHour[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load surf spots when the page opens
  useEffect(() => {
    async function loadSpots() {
      try {
        const response = await fetch("/api/spots");

        if (!response.ok) {
          throw new Error("Failed to load surf spots");
        }

        const data: SurfSpot[] = await response.json();
        setSpots(data);
      } catch {
        setError("Unable to retrieve surf spots.");
      }
    }

    loadSpots();
  }, []);

  // Fetch a forecast when a user selects a spot
  async function selectSpot(spot: SurfSpot) {
    setSelectedSpot(spot);
    setForecast([]);
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/spots/${spot.slug}/forecast`
      );

      if (!response.ok) {
        throw new Error("Failed to retrieve forecast");
      }

      const data: SpotForecast = await response.json();

      // Only show the next 12 forecast hours
      const upcoming = data.forecast
        .filter((hour) => hour.time >= currentPacificHour())
        .slice(0, 12);

      setForecast(upcoming);
    } catch {
      setError("Unable to load forecast data.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="dashboard">
      <header>
        <h1>Surf Alerts</h1>
        <p>Your personalized surf forecasting dashboard.</p>
      </header>

      <section>
        <h2>Surf Spots</h2>

        <div className="spot-grid">
          {spots.map((spot) => (
            <button
              key={spot.id}
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

      {loading && <p>Loading forecast...</p>}
      {error && <p className="error">{error}</p>}

      {selectedSpot && !loading && !error && (
        <section className="forecast-section">
          <h2>{selectedSpot.name} Forecast</h2>

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
    </main>
  );
}

export default App;
