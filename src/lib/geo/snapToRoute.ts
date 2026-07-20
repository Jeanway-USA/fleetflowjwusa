// Snap a point to the nearest position along a polyline (great-circle-ish, small distances).
// Coordinates use [lat, lng]. Returns [lat, lng] of the nearest point on the line.

type LatLng = [number, number];

function toXY([lat, lng]: LatLng): [number, number] {
  // Equirectangular projection is fine for snapping over route-scale segments.
  const cos = Math.cos((lat * Math.PI) / 180);
  return [lng * cos, lat];
}

function projectOnSegment(p: [number, number], a: [number, number], b: [number, number]) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const len2 = abx * abx + aby * aby;
  if (len2 === 0) return { pt: a, d2: (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2 };
  let t = ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const pt: [number, number] = [a[0] + abx * t, a[1] + aby * t];
  const d2 = (p[0] - pt[0]) ** 2 + (p[1] - pt[1]) ** 2;
  return { pt, d2 };
}

export function snapPointToRoute(
  point: { lat: number; lng: number },
  route: LatLng[],
  maxDegrees = 1.5, // ~100mi guard — beyond this, don't snap
): { lat: number; lng: number } | null {
  if (!route || route.length < 2) return null;
  const p = toXY([point.lat, point.lng]);
  let best: { pt: [number, number]; d2: number; idx: number } | null = null;
  for (let i = 0; i < route.length - 1; i++) {
    const a = toXY(route[i]);
    const b = toXY(route[i + 1]);
    const r = projectOnSegment(p, a, b);
    if (!best || r.d2 < best.d2) best = { pt: r.pt, d2: r.d2, idx: i };
  }
  if (!best) return null;
  if (Math.sqrt(best.d2) > maxDegrees) return null;
  // Unproject: we projected lng by cos(lat). Use midpoint latitude for inverse.
  const midLat = (route[best.idx][0] + route[best.idx + 1][0]) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180) || 1;
  return { lat: best.pt[1], lng: best.pt[0] / cos };
}
