import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import "./AlertHistory.css";

type SavedAlert = {
  id: number;
  name: string;
  is_active: boolean;
};

type ForecastMatch = {
  id: number;
  forecast_time: string;
  detected_at: string;
};

type NotificationDelivery = {
  id: number;
  surf_date: string;
  recipient: string;
  status: string;
  created_at: string;
  sent_at: string | null;
};

type HistoryResponse = {
  alert_id: number;
  alert_name: string;
  spot: string;
  matches: ForecastMatch[];
  deliveries: NotificationDelivery[];
};


// Format dates in Los Angeles time.
function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}


// Describe a delivery attempt accurately.
function deliveryLabel(status: string): string {
  switch (status) {
    case "sent":
      return "Accepted by email provider";

    case "failed":
      return "Email attempt failed";

    case "pending":
      return "Pending / delivery not confirmed";

    default:
      return status;
  }
}


export default function AlertHistory() {
  const [alerts, setAlerts] = useState<SavedAlert[]>([]);

  const [selectedAlertId, setSelectedAlertId] = useState<
    number | null
  >(null);

  const [history, setHistory] = useState<
    HistoryResponse | null
  >(null);

  const [listLoading, setListLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [listError, setListError] = useState("");
  const [historyError, setHistoryError] = useState("");

  const [refreshVersion, setRefreshVersion] = useState(0);


  // Load the current user's saved alerts.
  useEffect(() => {
    let cancelled = false;

    async function loadAlerts() {
      setListLoading(true);
      setListError("");

      try {
        const response = await apiFetch("/api/alerts", {
          credentials: "same-origin",
        });

        if (!response.ok) {
          throw new Error("Unable to load alerts");
        }

        const data: SavedAlert[] = await response.json();

        if (cancelled) {
          return;
        }

        setAlerts(data);

        setSelectedAlertId((previous) => {
          const previousStillExists = data.some(
            (alert) => alert.id === previous
          );

          if (previousStillExists) {
            return previous;
          }

          return data.length > 0 ? data[0].id : null;
        });
      } catch {
        if (!cancelled) {
          setListError("Unable to load your saved alerts.");
        }
      } finally {
        if (!cancelled) {
          setListLoading(false);
        }
      }
    }

    void loadAlerts();

    return () => {
      cancelled = true;
    };
  }, [refreshVersion]);


  // Load history whenever the selected alert changes.
  useEffect(() => {
    if (selectedAlertId === null) {
      return;
    }

    const controller = new AbortController();

    async function loadHistory(alertId: number) {
      setHistoryLoading(true);
      setHistoryError("");

      try {
        const response = await apiFetch(
          `/api/alerts/${alertId}/history`,
          {
            credentials: "same-origin",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error("Unable to load alert history");
        }

        const data: HistoryResponse = await response.json();

        if (!controller.signal.aborted) {
          setHistory(data);
        }
      } catch {
        if (!controller.signal.aborted) {
          setHistoryError(
            "Unable to load the history for this alert."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setHistoryLoading(false);
        }
      }
    }

    void loadHistory(selectedAlertId);

    return () => {
      controller.abort();
    };
  }, [selectedAlertId, refreshVersion]);


  const selectedAlert = alerts.find(
    (alert) => alert.id === selectedAlertId
  );

  // Never show another alert's stale history
  // while switching between selections.
  const visibleHistory =
    history?.alert_id === selectedAlertId
      ? history
      : null;


  return (
    <section className="ah-section">
      <div className="ah-section-header">
        <div>
          <h2>Alert History</h2>

          <p>
            Review saved surf matches and email
            notification attempts.
          </p>
        </div>

        <button
          className="ah-refresh-button"
          type="button"
          onClick={() =>
            setRefreshVersion((previous) => previous + 1)
          }
          disabled={listLoading || historyLoading}
        >
          Refresh History
        </button>
      </div>

      {listLoading && (
        <p className="ah-muted">Loading alerts...</p>
      )}

      {listError && (
        <div className="ah-error" role="alert">
          {listError}
        </div>
      )}

      {!listLoading && !listError && alerts.length === 0 && (
        <div className="ah-empty">
          <p>No saved alerts yet.</p>
          <span>
            Create your first alert to start tracking
            surf conditions.
          </span>
        </div>
      )}

      {alerts.length > 0 && (
        <>
          {/* ALERT SELECTOR */}

          <div className="ah-selector">
            <label htmlFor="history-alert-select">
              Select an Alert
            </label>

            <select
              id="history-alert-select"
              value={selectedAlertId ?? ""}
              onChange={(event) =>
                setSelectedAlertId(Number(event.target.value))
              }
            >
              {alerts.map((alert) => (
                <option
                  key={alert.id}
                  value={alert.id}
                >
                  {alert.name}
                </option>
              ))}
            </select>
          </div>

          {/* SELECTED ALERT HEADING */}

          {selectedAlert && (
            <div className="ah-selected-alert">
              <div>
                <h3>{selectedAlert.name}</h3>

                <p>
                  {visibleHistory?.spot ?? "Surf alert"}
                </p>
              </div>

              <div className="ah-status">
                <span
                  className={
                    selectedAlert.is_active
                      ? "ah-dot active"
                      : "ah-dot paused"
                  }
                  aria-hidden="true"
                />

                {selectedAlert.is_active
                  ? "Active"
                  : "Paused"}
              </div>
            </div>
          )}

          {historyLoading && (
            <p className="ah-muted">
              Loading history...
            </p>
          )}

          {historyError && (
            <div className="ah-error" role="alert">
              {historyError}
            </div>
          )}

          {/* HISTORY DETAILS */}

          {!historyLoading &&
            !historyError &&
            visibleHistory && (
              <div className="ah-columns">

                {/* NOTIFICATION HISTORY */}

                <div className="ah-panel">
                  <div className="ah-panel-heading">
                    <h3>Email Notifications</h3>

                    <span className="ah-count">
                      {visibleHistory.deliveries.length} recent
                    </span>
                  </div>

                  {visibleHistory.deliveries.length === 0 ? (
                    <div className="ah-empty-small">
                      <p>No notification attempts recorded.</p>

                      <span>
                        Emails may be disabled, or no
                        qualifying notification has been
                        attempted yet.
                      </span>
                    </div>
                  ) : (
                    <div className="ah-event-list">
                      {visibleHistory.deliveries.map(
                        (delivery) => (
                          <div
                            className="ah-event"
                            key={delivery.id}
                          >
                            <div className="ah-event-top">
                              <span
                                className={
                                  "ah-delivery-status " +
                                  `ah-${delivery.status}`
                                }
                              >
                                {deliveryLabel(
                                  delivery.status
                                )}
                              </span>
                            </div>

                            <p>
                              Surf day: {delivery.surf_date}
                            </p>

                            <p>
                              Recipient: {delivery.recipient}
                            </p>

                            <p>
                              Attempted:{" "}
                              {formatDateTime(
                                delivery.created_at
                              )}
                            </p>

                            {delivery.sent_at && (
                              <p>
                                Accepted:{" "}
                                {formatDateTime(
                                  delivery.sent_at
                                )}
                              </p>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* FORECAST MATCH HISTORY */}

                <div className="ah-panel">
                  <div className="ah-panel-heading">
                    <h3>Surf Condition Matches</h3>

                    <span className="ah-count">
                      {visibleHistory.matches.length} recent
                    </span>
                  </div>

                  {visibleHistory.matches.length === 0 ? (
                    <div className="ah-empty-small">
                      <p>No saved matches yet.</p>

                      <span>
                        Matches will appear after the
                        monitoring worker records
                        qualifying forecast hours.
                      </span>
                    </div>
                  ) : (
                    <div className="ah-event-list">
                      {visibleHistory.matches.map(
                        (match) => (
                          <div
                            className="ah-event"
                            key={match.id}
                          >
                            <div className="ah-event-top">
                              <span className="ah-match-label">
                                Conditions matched
                              </span>
                            </div>

                            <p>
                              Forecast hour:{" "}
                              {formatDateTime(
                                match.forecast_time
                              )}
                            </p>

                            <p>
                              Recorded:{" "}
                              {formatDateTime(
                                match.detected_at
                              )}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

              </div>
            )}
        </>
      )}

      <p className="ah-footnote">
        History shows stored forecast matches and email
        attempts, not observed beach conditions or
        confirmed inbox delivery. Up to 20 recent records
        of each type are displayed per alert.
      </p>
    </section>
  );
}
