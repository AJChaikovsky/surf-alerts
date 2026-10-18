import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "../api";
import { currentPacificHour } from "../time";
import type { ForecastHour } from "./ForecastCard";
import "./LocalBreaks.css";

// The server enforces this; it's repeated here for the counter.
const MAX_LOCAL_BREAKS = 3;

type LocalBreak = {
  id: number;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  is_custom: boolean;
};

type BreakFormValues = {
  name: string;
  coordinates: string;
};

const EMPTY_FORM: BreakFormValues = {
  name: "",
  coordinates: "",
};

// What the forecast showed for a newly added break.
type FoundConditions = {
  breakName: string;
  hour: ForecastHour;
};

const UNABLE_TO_RETRIEVE =
  "Unable to retrieve data for these coordinates. Try a point slightly offshore of the break.";


// Accept "33.90, -118.43" — the format Google Maps copies.
function parseCoordinates(
  value: string
): { latitude: number; longitude: number } | null {
  const parts = value.split(/[\s,]+/).filter(Boolean);

  if (parts.length !== 2) {
    return null;
  }

  const [latitude, longitude] = parts.map(Number);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }

  return { latitude, longitude };
}


function formatMeasurement(value: number | null, unit: string): string {
  return value === null ? "N/A" : `${value.toFixed(1)} ${unit}`;
}


// The first upcoming forecast hour that has wave data.
async function fetchCurrentConditions(
  slug: string
): Promise<ForecastHour | null> {
  const response = await apiFetch(`/api/spots/${slug}/forecast`);

  if (!response.ok) {
    return null;
  }

  const data: { forecast: ForecastHour[] } = await response.json();
  const now = currentPacificHour();

  return (
    data.forecast.find(
      (hour) => hour.time >= now && hour.wave_height_ft !== null
    ) ?? null
  );
}


// Use the API's message when it sends one (e.g. the 3-break limit).
async function errorDetail(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const data = await response.json();

    if (typeof data.detail === "string") {
      return data.detail;
    }
  } catch {
    // Not JSON; use the fallback.
  }

  return fallback;
}


export default function LocalBreaks() {
  const [breaks, setBreaks] = useState<LocalBreak[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [values, setValues] = useState<BreakFormValues>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [found, setFound] = useState<FoundConditions | null>(null);

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(
    null
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const atLimit = breaks.length >= MAX_LOCAL_BREAKS;


  // -------- LOAD MY BREAKS --------

  useEffect(() => {
    async function loadBreaks() {
      try {
        const response = await apiFetch("/api/spots");

        if (!response.ok) {
          throw new Error("Failed to load spots");
        }

        const spots: LocalBreak[] = await response.json();

        setBreaks(spots.filter((spot) => spot.is_custom));
      } catch {
        setListError("Unable to load your local breaks.");
      } finally {
        setLoading(false);
      }
    }

    void loadBreaks();
  }, []);


  // -------- ADD A BREAK --------

  async function addBreak(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setFormError("");
    setFormMessage("");
    setFound(null);

    if (!values.name.trim()) {
      setFormError("Please give this break a name.");
      return;
    }

    const coordinates = parseCoordinates(values.coordinates);

    if (!coordinates) {
      setFormError(
        "Enter coordinates as latitude, longitude, e.g. 33.90, -118.43."
      );
      return;
    }

    setSaving(true);

    try {
      const response = await apiFetch("/api/spots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: values.name.trim(),
          ...coordinates,
        }),
      });

      if (!response.ok) {
        // 422 means the server found no wave data there.
        throw new Error(
          response.status === 422
            ? await errorDetail(response, UNABLE_TO_RETRIEVE)
            : await errorDetail(
                response,
                "Unable to add this break. Please try again."
              )
        );
      }

      const created: LocalBreak = await response.json();

      setBreaks((previous) => [...previous, created]);
      setValues(EMPTY_FORM);

      const hour = await fetchCurrentConditions(created.slug).catch(
        () => null
      );

      if (hour) {
        setFound({ breakName: created.name, hour });
        setFormMessage(
          `${created.name} saved. You'll find it on Surf Spots and in your alert options.`
        );
      } else {
        setFormMessage(
          `${created.name} saved, but we were unable to retrieve its current conditions.`
        );
      }
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Unable to add this break. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }


  // -------- DELETE A BREAK --------

  async function deleteBreak(breakId: number) {
    setDeleteError("");
    setBusyId(breakId);

    try {
      const response = await apiFetch(`/api/spots/${breakId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(
          await errorDetail(response, "Unable to delete this break.")
        );
      }

      setBreaks((previous) =>
        previous.filter((item) => item.id !== breakId)
      );
      setDeleteConfirmId(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Unable to delete this break."
      );
    } finally {
      setBusyId(null);
    }
  }


  // -------- RENDER --------

  return (
    <main className="dashboard">
      <header>
        <h1>Local Breaks</h1>
        <p>
          Add up to {MAX_LOCAL_BREAKS} breaks of your own by name and
          coordinates. Only you can see them.
        </p>
      </header>

      {/* ADD FORM */}

      <section className="alert-section">
        <div className="lb-heading">
          <h2>Add a Local Break</h2>

          <span className="lb-count">
            {breaks.length} of {MAX_LOCAL_BREAKS} used
          </span>
        </div>

        <form className="alert-form" onSubmit={addBreak}>
          <div className="form-group">
            <label htmlFor="break-name">Break Name</label>

            <input
              id="break-name"
              type="text"
              maxLength={100}
              required
              placeholder="e.g. The Cove"
              disabled={atLimit}
              value={values.name}
              onChange={(e) =>
                setValues((previous) => ({
                  ...previous,
                  name: e.target.value,
                }))
              }
            />
          </div>

          <div className="form-group">
            <label htmlFor="break-coordinates">Coordinates</label>

            <input
              id="break-coordinates"
              type="text"
              inputMode="decimal"
              required
              placeholder="33.90, -118.43"
              disabled={atLimit}
              value={values.coordinates}
              onChange={(e) =>
                setValues((previous) => ({
                  ...previous,
                  coordinates: e.target.value,
                }))
              }
            />

            <small>
              In Google Maps, right-click the water just offshore of the
              break and click the numbers at the top of the menu to copy
              them. Points on land are rejected because there's no wave
              forecast there.
            </small>
          </div>

          {atLimit && (
            <div
              className="form-notification form-notification-error"
              role="status"
            >
              <span aria-hidden="true">!</span>
              <span>
                You've added {MAX_LOCAL_BREAKS} breaks. Delete one below to
                add another.
              </span>
            </div>
          )}

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

          {found && (
            <div className="lb-found">
              <p className="lb-found-title">
                Wave data found for {found.breakName}
              </p>

              <dl className="lb-found-values">
                <div>
                  <dt>Waves</dt>
                  <dd>{formatMeasurement(found.hour.wave_height_ft, "ft")}</dd>
                </div>

                <div>
                  <dt>Swell period</dt>
                  <dd>{formatMeasurement(found.hour.swell_period_s, "s")}</dd>
                </div>

                <div>
                  <dt>Wind</dt>
                  <dd>{formatMeasurement(found.hour.wind_speed_kn, "kn")}</dd>
                </div>
              </dl>

              <small>
                Forecast for {found.hour.time.replace("T", " ")} Pacific
                time.
              </small>
            </div>
          )}

          <button
            className="primary-button"
            type="submit"
            disabled={saving || atLimit}
          >
            {saving ? "Checking forecast..." : "Add Break"}
          </button>
        </form>
      </section>

      {/* MY BREAKS */}

      <section className="alert-section">
        <h2>My Local Breaks</h2>

        {loading && <p>Loading your breaks...</p>}

        {listError && (
          <p className="error" role="alert">
            {listError}
          </p>
        )}

        {!loading && !listError && breaks.length === 0 && (
          <p>You haven't added any local breaks yet.</p>
        )}

        {deleteError && (
          <p className="error" role="alert">
            {deleteError}
          </p>
        )}

        <div className="saved-alerts">
          {breaks.map((item) => (
            <div className="saved-alert-card" key={item.id}>
              <div className="alert-heading">
                <div>
                  <h3>{item.name}</h3>
                </div>
              </div>

              <p>
                {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
              </p>

              {deleteConfirmId === item.id ? (
                <div className="delete-confirmation">
                  <p>
                    Delete <strong>{item.name}</strong>? Alerts using this
                    break must be deleted or changed first.
                  </p>

                  <div className="alert-actions">
                    <button
                      className="delete-button"
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => deleteBreak(item.id)}
                    >
                      {busyId === item.id ? "Deleting..." : "Yes, Delete"}
                    </button>

                    <button
                      className="secondary-button"
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => setDeleteConfirmId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="alert-actions">
                  <button
                    className="delete-button"
                    type="button"
                    onClick={() => {
                      setDeleteError("");
                      setDeleteConfirmId(item.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
