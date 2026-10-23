export interface LocationFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  mocked?: boolean;
}
export function geofence(fix: LocationFix, target: { latitude: number; longitude: number }) {
  const values = [fix.latitude, fix.longitude, fix.accuracy, target.latitude, target.longitude];
  if (
    !values.every(Number.isFinite) ||
    fix.accuracy < 0 ||
    Math.abs(fix.latitude) > 90 ||
    Math.abs(target.latitude) > 90 ||
    Math.abs(fix.longitude) > 180 ||
    Math.abs(target.longitude) > 180
  )
    return { allowed: false, distance: Infinity, reason: 'INVALID_LOCATION' };
  if (fix.mocked) return { allowed: false, distance: Infinity, reason: 'MOCK_LOCATION' };
  const radians = (value: number) => (value * Math.PI) / 180;
  const a =
    Math.sin(radians(target.latitude - fix.latitude) / 2) ** 2 +
    Math.cos(radians(fix.latitude)) *
      Math.cos(radians(target.latitude)) *
      Math.sin(radians(target.longitude - fix.longitude) / 2) ** 2;
  const distance = 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
  const allowed = distance + fix.accuracy <= 300;
  return { allowed, distance, reason: allowed ? 'WITHIN_RANGE' : 'OUTSIDE_OR_INACCURATE' };
}
