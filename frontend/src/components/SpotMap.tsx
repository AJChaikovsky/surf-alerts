import { useEffect, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import { latLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";

import { apiFetch } from "../api";
import { compassDirection } from "../compass";
import { currentPacificHour } from "../time";
import type { ForecastHour } from "./ForecastCard";
import "./SpotMap.css";

type MapSpot = {
  id: number;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  region: string;
  is_custom: boolean;
};

type MatchingAlert = {
  id: number;
  name: string;
};

type CurrentMatches = {
  spots: { spot_id: number; alerts: MatchingAlert[] }[];
};

type PopupForecast =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; hour: ForecastHour | null };

// Kept in sync with the legend in SpotMap.css.
const COLORS = {
  spot: "#0c7899",
  local: "#7c3aed",
  matching: "#16a34a",
};

// Southern California, before the spots load.
const DEFAULT_CENTER: [number, number] = [33.6, -118.1];


function formatMeasurement(value: number | null, unit: string): string {
  return value === null ? "N/A" : `${value.toFixed(1)} ${unit}`;
}

function formatHour(time: string): string {
  const hour = Number(time.slice(11, 13));
  const suffix = hour < 12 ? "AM" : "PM";

  return `${hour % 12 === 0 ? 12 : hour % 12} ${suffix}`;
}


// Zoom the map to fit every spot once they load.
function FitToSpots({ spots }: { spots: MapSpot[] }) {
  const map = useMap();

  useEffect(() => {
    if (spots.length > 0) {
      map.fitBounds(
        latLngBounds(spots.map((spot) => [spot.latitude, spot.longitude])),
        { padding: [40, 40] }
      );
    }
  }, [map, spots]);

  return null;
}


function SpotPopup({
  spot,
  forecast,
  matchingAlerts,
}: {
  spot: MapSpot;
  forecast: PopupForecast | undefined;
  matchingAlerts: MatchingAlert[];
}) {
  return (
    <div className="map-popup">
      <h3>{spot.name}</h3>
      <p className="map-popup-region">
        {spot.is_custom ? "Your local break" : spot.region}
      </p>

      {matchingAlerts.length > 0 && (
        <p className="map-popup-match">
          Matches {matchingAlerts.map((alert) => alert.name).join(", ")}
        </p>
      )}

      {(!forecast || forecast.status === "loading") && (
        <p className="map-popup-muted">Loading current forecast...</p>
      )}

      {(forecast?.status === "error" ||
        (forecast?.status === "ready" && forecast.hour === null)) && (
        <p className="map-popup-muted">Unable to retrieve data.</p>
      )}

      {forecast?.status === "ready" && forecast.hour && (
        <>
          <dl className="map-popup-values">
            <div>
              <dt>Waves</dt>
              <dd>{formatMeasurement(forecast.hour.wave_height_ft, "ft")}</dd>
            </div>

            <div>
              <dt>Swell period</dt>
              <dd>{formatMeasurement(forecast.hour.swell_period_s, "s")}</dd>
            </div>

            <div>
              <dt>Wind</dt>
              <dd>
                {formatMeasurement(forecast.hour.wind_speed_kn, "kn")}
                {forecast.hour.wind_speed_kn !== null &&
                  ` ${compassDirection(forecast.hour.wind_direction_deg)}`}
              </dd>
            </div>
          </dl>

          <p className="map-popup-muted">
            Forecast for {formatHour(forecast.hour.time)} Pacific time
          </p>
        </>
      )}

      <a className="map-popup-button" href={`#/alerts?spot=${spot.id}`}>
        Add to alerts
      </a>
    </div>
  );
}


export default function SpotMap() {
  const [spots, setSpots] = useState<MapSpot[]>([]);
  const [spotsError, setSpotsError] = useState("");

  // spot id -> alerts that match right now
  const [matches, setMatches] = useState<Map<number, MatchingAlert[]>>(
    new Map()
  );
  const [matchesStatus, setMatchesStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");

  // slug -> forecast shown in that spot's popup
  const [forecasts, setForecasts] = useState<Record<string, PopupForecast>>(
    {}
  );


  // Spots first so the map draws quickly; matching checks every
  // alert's forecast, so it loads separately.
  useEffect(() => {
    async function loadSpots() {
      try {
        const response = await apiFetch("/api/spots");

        if (!response.ok) {
          throw new Error("Failed to load spots");
        }

        setSpots(await response.json());
      } catch {
        setSpotsError("Unable to load surf spots.");
      }
    }

    async function loadMatches() {
      try {
        const response = await apiFetch("/api/alerts/current-matches");

        if (!response.ok) {
          throw new Error("Failed to load matches");
        }

        const data: CurrentMatches = await response.json();

        setMatches(
          new Map(data.spots.map((spot) => [spot.spot_id, spot.alerts]))
        );
        setMatchesStatus("ready");
      } catch {
        setMatchesStatus("error");
      }
    }

    void loadSpots();
    void loadMatches();
  }, []);


  async function loadForecast(spot: MapSpot) {
    if (forecasts[spot.slug]?.status === "ready") {
      return;
    }

    setForecasts((previous) => ({
      ...previous,
      [spot.slug]: { status: "loading" },
    }));

    try {
      const response = await apiFetch(`/api/spots/${spot.slug}/forecast`);

      if (!response.ok) {
        throw new Error("Forecast request failed");
      }

      const data: { forecast: ForecastHour[] } = await response.json();
      const now = currentPacificHour();

      setForecasts((previous) => ({
        ...previous,
        [spot.slug]: {
          status: "ready",
          hour: data.forecast.find((hour) => hour.time >= now) ?? null,
        },
      }));
    } catch {
      setForecasts((previous) => ({
        ...previous,
        [spot.slug]: { status: "error" },
      }));
    }
  }


  return (
    <main className="dashboard">
      <header>
        <h1>Surf Map</h1>
        <p>
          Tap a spot for its current forecast. Green spots match one of
          your active alerts right now.
        </p>
      </header>

      {spotsError && (
        <p className="error" role="alert">
          {spotsError}
        </p>
      )}

      <ul className="map-legend" aria-label="Map legend">
        <li>
          <span className="map-legend-dot spot" aria-hidden="true" />
          Surf spot
        </li>
        <li>
          <span className="map-legend-dot local" aria-hidden="true" />
          Your local break
        </li>
        <li>
          <span className="map-legend-dot matching" aria-hidden="true" />
          Matches an alert now
        </li>

        <li className="map-legend-status" role="status">
          {matchesStatus === "loading" && "Checking your alerts..."}
          {matchesStatus === "error" && "Unable to check your alerts."}
          {matchesStatus === "ready" &&
            `${matches.size} ${matches.size === 1 ? "spot matches" : "spots match"} right now`}
        </li>
      </ul>

      <div className="map-frame">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={8}
          scrollWheelZoom
          className="map-canvas"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitToSpots spots={spots} />

          {spots.map((spot) => {
            const matchingAlerts = matches.get(spot.id) ?? [];
            const isMatching = matchingAlerts.length > 0;

            const color = isMatching
              ? COLORS.matching
              : spot.is_custom
                ? COLORS.local
                : COLORS.spot;

            return (
              <CircleMarker
                // Remount when the color changes so Leaflet restyles it.
                key={`${spot.id}-${color}`}
                center={[spot.latitude, spot.longitude]}
                radius={isMatching ? 11 : 8}
                pathOptions={{
                  color: "white",
                  weight: 2,
                  fillColor: color,
                  fillOpacity: 0.95,
                }}
                eventHandlers={{ click: () => void loadForecast(spot) }}
              >
                <Popup>
                  <SpotPopup
                    spot={spot}
                    forecast={forecasts[spot.slug]}
                    matchingAlerts={matchingAlerts}
                  />
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </main>
  );
}
