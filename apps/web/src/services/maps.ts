export type Coordinates = {
  lat: number;
  lng: number;
};

export type StaticMapOptions = {
  center: Coordinates;
  zoom?: number;
  width?: number;
  height?: number;
  markerLabel?: string;
};

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function isValidCoordinate(value: number) {
  return Number.isFinite(value);
}

export function getDistanceMiles(a: Coordinates, b: Coordinates): number {
  if (!isValidCoordinate(a.lat) || !isValidCoordinate(a.lng)) return NaN;
  if (!isValidCoordinate(b.lat) || !isValidCoordinate(b.lng)) return NaN;

  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const hav =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(hav));
}

export function getDistanceKm(a: Coordinates, b: Coordinates): number {
  const miles = getDistanceMiles(a, b);
  return Number.isFinite(miles) ? miles * 1.609344 : NaN;
}

export function getStaticMapUrl(options: StaticMapOptions): string | null {
  const provider = (process.env.NEXT_PUBLIC_MAPS_PROVIDER ?? '').toLowerCase();
  const apiKey = process.env.NEXT_PUBLIC_MAPS_API_KEY ?? '';
  const zoom = options.zoom ?? 14;
  const width = options.width ?? 640;
  const height = options.height ?? 360;
  const { lat, lng } = options.center;

  if (!apiKey) return null;

  if (provider === 'google') {
    const params = new URLSearchParams({
      center: `${lat},${lng}`,
      zoom: String(zoom),
      size: `${width}x${height}`,
      key: apiKey,
    });
    if (options.markerLabel) {
      params.set('markers', `label:${options.markerLabel}|${lat},${lng}`);
    }
    return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
  }

  if (provider === 'mapbox') {
    const style = process.env.NEXT_PUBLIC_MAPS_STYLE_ID ?? 'mapbox/streets-v12';
    const marker = options.markerLabel
      ? `pin-s-${encodeURIComponent(options.markerLabel)}(${lng},${lat})`
      : `pin-s(${lng},${lat})`;
    return (
      `https://api.mapbox.com/styles/v1/${style}/static/` +
      `${marker}/${lng},${lat},${zoom}/${width}x${height}?access_token=${apiKey}`
    );
  }

  return null;
}

export async function geocodeAddress(_address: string): Promise<Coordinates | null> {
  // TODO: integrate Google Maps or Mapbox geocoding.
  return null;
}

export async function reverseGeocode(_coords: Coordinates): Promise<string | null> {
  // TODO: integrate Google Maps or Mapbox reverse geocoding.
  return null;
}
