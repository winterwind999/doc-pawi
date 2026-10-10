/**
 * Map math for the nearby-facilities map: Web Mercator projection for OpenStreetMap tiles,
 * straight-line distances, and coordinate parsing. Pure functions, unit tested.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface Camera {
  center: LatLng;
  zoom: number;
}

export const TILE_SIZE = 256;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 18;
/** Web Mercator stops here; the map is square at these latitudes. */
const MAX_LATITUDE = 85.05112878;
const EARTH_RADIUS_KM = 6371.0088;

/** The whole Philippines, shown when there is nothing to fit. */
export const PHILIPPINES_CAMERA: Camera = { center: { latitude: 12.8797, longitude: 121.774 }, zoom: 5 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const clampZoom = (zoom: number) => clamp(Math.round(zoom), MIN_ZOOM, MAX_ZOOM);

export function wrapLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/** World pixel position of a point; the world is 256 × 2^zoom pixels wide. */
export function project(point: LatLng, zoom: number) {
  const size = TILE_SIZE * 2 ** zoom;
  const lat = toRadians(clamp(point.latitude, -MAX_LATITUDE, MAX_LATITUDE));
  return {
    x: ((point.longitude + 180) / 360) * size,
    y: ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * size,
  };
}

export function unproject(x: number, y: number, zoom: number): LatLng {
  const size = TILE_SIZE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * y) / size;
  return {
    latitude: clamp((180 / Math.PI) * Math.atan(Math.sinh(n)), -MAX_LATITUDE, MAX_LATITUDE),
    longitude: wrapLongitude((x / size) * 360 - 180),
  };
}

/** Great-circle (straight-line) distance in kilometres. Road distance is longer. */
export function distanceKm(a: LatLng, b: LatLng) {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "350 m", "1.2 km", "15 km". */
export function formatDistance(km: number) {
  if (!Number.isFinite(km) || km < 0) return '';
  const meters = Math.round(km * 100) * 10;
  if (meters < 1000) return `${Math.max(10, meters)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/**
 * Reads coordinates as maps apps copy them, e.g. "14.5995, 120.9842" (latitude first). A space or
 * semicolon may separate them, and a space a keyboard inserted after a decimal point ("14. 5995")
 * is ignored. Returns null when the text is not a valid position.
 */
export function parseCoordinates(text: string): LatLng | null {
  const normalized = text.replace(/(\d)\.\s+(?=\d)/g, '$1.');
  const match = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(normalized);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export const formatCoordinates = (point: LatLng) => `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}`;

/** Center and zoom that show every point inside a width × height view, keeping `padding` px clear. */
export function fitCamera(points: readonly LatLng[], width: number, height: number, padding = 48): Camera {
  if (!points.length || width <= 0 || height <= 0) return PHILIPPINES_CAMERA;
  if (points.length === 1) return { center: points[0], zoom: 15 };
  for (let zoom = 16; zoom >= MIN_ZOOM; zoom--) {
    const px = points.map((p) => project(p, zoom));
    const xs = px.map((p) => p.x);
    const ys = px.map((p) => p.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    if (maxX - minX <= width - 2 * padding && maxY - minY <= height - 2 * padding) {
      return { center: unproject((minX + maxX) / 2, (minY + maxY) / 2, zoom), zoom };
    }
  }
  const px = points.map((p) => project(p, MIN_ZOOM));
  const avg = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;
  return { center: unproject(avg(px.map((p) => p.x)), avg(px.map((p) => p.y)), MIN_ZOOM), zoom: MIN_ZOOM };
}

export interface TileRef {
  key: string;
  z: number;
  x: number;
  y: number;
  /** Position relative to `origin`, in screen pixels. */
  left: number;
  top: number;
}

/**
 * Tiles that cover a world-pixel rectangle, plus `margin` tiles on each side so a drag does not
 * reveal empty space before the next render. Columns wrap around the antimeridian.
 */
export function tilesFor(
  rect: { left: number; top: number; width: number; height: number },
  zoom: number,
  origin: { x: number; y: number },
  margin = 1,
): TileRef[] {
  const count = 2 ** zoom;
  const x0 = Math.floor(rect.left / TILE_SIZE) - margin;
  const x1 = Math.floor((rect.left + rect.width) / TILE_SIZE) + margin;
  const y0 = Math.max(0, Math.floor(rect.top / TILE_SIZE) - margin);
  const y1 = Math.min(count - 1, Math.floor((rect.top + rect.height) / TILE_SIZE) + margin);
  const tiles: TileRef[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      tiles.push({
        key: `${zoom}/${tx}/${ty}`,
        z: zoom,
        x: ((tx % count) + count) % count,
        y: ty,
        left: tx * TILE_SIZE - origin.x,
        top: ty * TILE_SIZE - origin.y,
      });
    }
  }
  return tiles;
}

export const tileUrl = (tile: Pick<TileRef, 'x' | 'y' | 'z'>) => `https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`;
