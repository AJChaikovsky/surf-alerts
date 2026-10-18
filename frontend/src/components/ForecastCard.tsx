import { compassDirection } from "../compass";
import "./ForecastCard.css";

export type ForecastHour = {
  time: string;
  wave_height_ft: number | null;
  wave_period_s: number | null;
  wave_direction_deg: number | null;
  swell_height_ft: number | null;
  swell_period_s: number | null;
  swell_direction_deg: number | null;
  wind_speed_kn: number | null;
  wind_direction_deg: number | null;
};

type ForecastCardProps = {
  forecast: ForecastHour;
};

// Format a measurement while handling missing data
function formatValue(
  value: number | null,
  unit: string
): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${value} ${unit}`;
}

// Convert the hourly API timestamp to readable time
function formatTime(time: string): string {
  const parts = time.split("T");

  if (parts.length !== 2) {
    return time;
  }

  const [year, month, day] = parts[0].split("-");
  const [hour, minute] = parts[1].split(":");

  const hourNumber = Number(hour);
  const period = hourNumber >= 12 ? "PM" : "AM";
  const displayHour = hourNumber % 12 || 12;

  return `${month}/${day}/${year} · ${displayHour}:${minute} ${period}`;
}

function DirectionValue({
  degrees,
}: {
  degrees: number | null;
}) {
  if (degrees === null) {
    return <span>N/A</span>;
  }

  return (
    <span>
      {compassDirection(degrees)} · {Math.round(degrees)}°
    </span>
  );
}

export default function ForecastCard({
  forecast,
}: ForecastCardProps) {
  return (
    <article className="surf-forecast-card">
      <div className="surf-forecast-header">
        <h3>{formatTime(forecast.time)}</h3>
        <span className="surf-forecast-label">Hourly</span>
      </div>

      <div className="surf-forecast-primary">
        <div>
          <span className="metric-label">Wave height</span>
          <strong className="wave-value">
            {formatValue(forecast.wave_height_ft, "ft")}
          </strong>
        </div>

        <div>
          <span className="metric-label">Wave period</span>
          <strong>
            {formatValue(forecast.wave_period_s, "s")}
          </strong>
        </div>
      </div>

      <div className="surf-forecast-details">
        <div className="forecast-metric">
          <span className="metric-label">Swell height</span>
          <strong>
            {formatValue(forecast.swell_height_ft, "ft")}
          </strong>
        </div>

        <div className="forecast-metric">
          <span className="metric-label">Swell period</span>
          <strong>
            {formatValue(forecast.swell_period_s, "s")}
          </strong>
        </div>

        <div className="forecast-metric">
          <span className="metric-label">Wind speed</span>
          <strong>
            {formatValue(forecast.wind_speed_kn, "kn")}
          </strong>
        </div>

        <div className="forecast-metric">
          <span className="metric-label">Wind direction</span>
          <strong>
            <DirectionValue
              degrees={forecast.wind_direction_deg}
            />
          </strong>
        </div>

        <div className="forecast-metric">
          <span className="metric-label">Swell direction</span>
          <strong>
            <DirectionValue
              degrees={forecast.swell_direction_deg}
            />
          </strong>
        </div>

        <div className="forecast-metric">
          <span className="metric-label">Wave direction</span>
          <strong>
            <DirectionValue
              degrees={forecast.wave_direction_deg}
            />
          </strong>
        </div>
      </div>
    </article>
  );
}
