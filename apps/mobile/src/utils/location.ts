// src/utils/location.ts

// Great-circle distance using law of cosines; good enough for city-scale sorting
export function distanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 3958.8; // Earth radius in miles

  const lat1Rad = toRad(lat1);
  const lat2Rad = toRad(lat2);
  const deltaLonRad = toRad(lon2 - lon1);

  const cosD =
    Math.sin(lat1Rad) * Math.sin(lat2Rad) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLonRad);

  return R * Math.acos(Math.min(Math.max(cosD, -1), 1));
}
