/**
 * JeanWay USA runs this app as its own internal tool, not as a multi-company product. The SaaS scaffolding
 * (beta welcome, Discord community banner, beta feedback button, plan tiers, "upgrade" walls, welcome tours) is
 * kept in the codebase but must never show. This is the one place that decides it.
 *
 * `INTERNAL_PRODUCT` hard-locks the behaviour for this deployment; `organizations.hide_promotions` (read into
 * AuthContext as `hidePromotions`) is also honoured, so an org flagged that way is treated the same.
 */
export const INTERNAL_PRODUCT = true;

export function isInternalProduct(hidePromotions?: boolean | null): boolean {
  return INTERNAL_PRODUCT || !!hidePromotions;
}

/** Plan tiers never lock anything for the internal product; other deployments keep the tier table. */
export function tierAllows(internal: boolean, tierFeatures: { has(feature: string): boolean }, feature?: string): boolean {
  if (internal || !feature) return true;
  return tierFeatures.has(feature);
}
