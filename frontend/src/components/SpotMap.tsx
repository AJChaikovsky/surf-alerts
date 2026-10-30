import { useCallback, useEffect, useRef, useState } from "react";
import MapGL, {
  Marker,
  NavigationControl,
  Popup,
  type MapRef,
} from "react-map-gl/maplibre";
import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";

import { apiFetch } from "../api";
import { PageHeader } from "./Motion";
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

// An alert whose conditions this spot fits right now. It may be set for
// a different spot (spot_id / spot_name).
type MatchingAlert = {
  id: number;
  name: string;
  spot_id: number;
  spot_name: string | null;
};

type CurrentMatches = {
  spots: { spot_id: number; alerts: MatchingAlert[] }[];
};

type PopupForecast =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; hour: ForecastHour | null };

// MapLibre finds its tile-decoding worker relative to its own file, which
// breaks once Vite bundles it. Ship the worker explicitly and point at it,
// and hand this same instance to the map (mapLib below); react-map-gl would
// otherwise load a separate copy that never gets the worker URL.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

// OpenFreeMap: free vector map styles, no API key. A real dark style,
// so dark mode isn't an inverted image.
const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

// Southern California, before the spots load.
const INITIAL_VIEW = { longitude: -118.1, latitude: 33.6, zoom: 7 };

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;


// "light" or "dark", following the theme toggle and the system setting.
function useResolvedTheme(): "light" | "dark" {
  const resolve = () => {
    const chosen = document.documentElement.dataset.theme;

    if (chosen === "light" || chosen === "dark") return chosen;

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  };

  const [theme, setTheme] = useState<"light" | "dark">(resolve);

  useEffect(() => {
    const update = () => setTheme(resolve());
    const observer = new MutationObserver(update);
    const query = window.matchMedia("(prefers-color-scheme: dark)");

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    query.addEventListener("change", update);

    return () => {
      observer.disconnect();
      query.removeEventListener("change", update);
    };
  }, []);

  return theme;
}


function formatMeasurement(value: number | null, unit: string): string {
  return value === null ? "N/A" : `${value.toFixed(1)} ${unit}`;
}

function formatHour(time: string): string {
  const hour = Number(time.slice(11, 13));
  const suffix = hour < 12 ? "AM" : "PM";

  return `${hour % 12 === 0 ? 12 : hour % 12} ${suffix}`;
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
        <div className="map-popup-match">
          <p className="map-popup-match-title">
            {matchingAlerts.length === 1
              ? "Fits your alert"
              : `Fits ${matchingAlerts.length} of your alerts`}
          </p>

          <ul>
            {matchingAlerts.map((alert) => (
              <li key={alert.id}>
                <strong>{alert.name}</strong>
                {alert.spot_id !== spot.id && alert.spot_name && (
                  <span> (set for {alert.spot_name})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
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

  const [selected, setSelected] = useState<MapSpot | null>(null);
  const mapRef = useRef<MapRef | null>(null);
  const theme = useResolvedTheme();

  // Frame every spot once both the map and the spots are ready.
  const fitToSpots = useCallback(() => {
    const map = mapRef.current;

    if (!map || spots.length === 0) return;

    const lngs = spots.map((spot) => spot.longitude);
    const lats = spots.map((spot) => spot.latitude);

    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 48, maxZoom: 11, duration: reduceMotion ? 0 : 800 }
    );
  }, [spots]);

  useEffect(() => {
    fitToSpots();
  }, [fitToSpots]);


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


  function openSpot(spot: MapSpot) {
    setSelected(spot);
    void loadForecast(spot);
  }

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
      <PageHeader
        eyebrow="02 / Map"
        title="Surf map"
        subtitle="Tap a spot for its current forecast. Green spots fit the conditions of one of your active alerts right now, wherever that alert is set."
      />

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
          Fits one of your alerts now
        </li>

        <li className="map-legend-status" role="status">
          {matchesStatus === "loading" && "Checking your alerts..."}
          {matchesStatus === "error" && "Unable to check your alerts."}
          {matchesStatus === "ready" &&
            `${matches.size} ${matches.size === 1 ? "spot fits" : "spots fit"} your alerts right now`}
        </li>
      </ul>

      <div className="map-frame">
        <MapGL
          mapLib={maplibregl}
          ref={mapRef}
          initialViewState={INITIAL_VIEW}
          mapStyle={MAP_STYLES[theme]}
          style={{ width: "100%", height: "100%" }}
          onLoad={fitToSpots}
          dragRotate={false}
          touchPitch={false}
          cooperativeGestures={false}
        >
          <NavigationControl position="top-left" showCompass={false} />

          {spots.map((spot) => {
            const matchingAlerts = matches.get(spot.id) ?? [];
            const kind =
              matchingAlerts.length > 0
                ? "match"
                : spot.is_custom
                  ? "local"
                  : "spot";

            return (
              // HTML pins: a colour change only swaps a class, so an open
              // popup is never torn down when the alert check finishes.
              <Marker
                key={spot.id}
                longitude={spot.longitude}
                latitude={spot.latitude}
                anchor="center"
                onClick={(event) => {
                  // Keep the map's own click from closing the new popup.
                  event.originalEvent.stopPropagation();
                  openSpot(spot);
                }}
              >
                <button
                  type="button"
                  className={`map-pin ${kind}`}
                  aria-label={
                    kind === "match"
                      ? `${spot.name}, fits your alerts`
                      : spot.name
                  }
                />
              </Marker>
            );
          })}

          {selected && (
            <Popup
              longitude={selected.longitude}
              latitude={selected.latitude}
              anchor="bottom"
              offset={16}
              maxWidth="320px"
              onClose={() => setSelected(null)}
            >
              <SpotPopup
                spot={selected}
                forecast={forecasts[selected.slug]}
                matchingAlerts={matches.get(selected.id) ?? []}
              />
            </Popup>
          )}
        </MapGL>
      </div>
    </main>
  );
}
