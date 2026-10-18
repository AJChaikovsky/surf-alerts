// Convert compass degrees to readable directions
export function compassDirection(degrees: number | null): string {
  if (degrees === null) {
    return "N/A";
  }

  const directions = [
    "N", "NE", "E", "SE",
    "S", "SW", "W", "NW",
  ];

  const index = Math.round(
    (((degrees % 360) + 360) % 360) / 45
  ) % 8;

  return directions[index];
}
