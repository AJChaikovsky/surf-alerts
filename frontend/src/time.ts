// Current hour in Pacific time, formatted like Open-Meteo's local
// timestamps (e.g. "2026-10-18T14:00"), for comparing forecast hours.
export function currentPacificHour(): string {
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
