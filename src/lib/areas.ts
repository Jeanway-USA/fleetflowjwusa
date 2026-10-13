/**
 * Area limits: an optional way to narrow a person to the areas of their position. A limit only ever takes access
 * away from what their role already allows; it never adds any. The app's pages are keyed by "feature", so each
 * area is the set of features it covers. A feature that no area covers is never limited.
 */
export const AREA_FEATURES: Record<string, string[]> = {
  loads: ['loads', 'agency_loads'],
  dispatch: ['dispatch', 'crm', 'crm_basic'],
  fleet: ['trucks', 'trailers'],
  drivers: ['drivers', 'driver_performance'],
  maintenance: ['maintenance_full', 'maintenance_basic'],
  finance: ['profit_loss', 'insights', 'ifta', 'executive_dashboard'],
  payroll: ['payroll', 'settlements'],
  safety: ['safety', 'incidents'],
  documents: ['documents'],
};

/** The area a feature belongs to, if any. */
export function areaOfFeature(feature: string): string | null {
  for (const [area, features] of Object.entries(AREA_FEATURES)) if (features.includes(feature)) return area;
  return null;
}

/** True when a person limited to `areas` may open `feature`. `areas` of null means no limit. */
export function featureAllowed(areas: string[] | null, feature: string | undefined): boolean {
  if (!areas || !feature) return true;
  const area = areaOfFeature(feature);
  return area === null || areas.includes(area);
}
