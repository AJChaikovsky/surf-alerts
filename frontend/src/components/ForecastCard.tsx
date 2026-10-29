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
// "2026-10-29T15:00" -> { time: "3:00 PM", day: "Thu, Oct 29" }
function formatTime(value: string): { time: string; day: string } {
  const parts = value.split("T");

  if (parts.length !== 2) {
    return { time: value, day: "" };
  }

  const [year, month, day] = parts[0].split("-").map(Number);
  const [hour, minute] = parts[1].split(":");

  const hourNumber = Number(hour);
  const period = hourNumber >= 12 ? "PM" : "AM";
  const displayHour = hourNumber % 12 || 12;

  const date = new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return { time: `${displayHour}:${minute} ${period}`, day: date };
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
        <h3>{formatTime(forecast.time).time}</h3>
        <span className="surf-forecast-label">
          {formatTime(forecast.time).day}
        </span>
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
