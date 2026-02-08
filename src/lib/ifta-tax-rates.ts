/**
 * State IFTA diesel excise tax rates (per gallon, 2025-2026 approximate).
 * These are state excise taxes on diesel fuel credited through IFTA quarterly filing.
 * Does NOT include federal excise tax ($0.244/gal) since that is not part of IFTA.
 */
export const STATE_DIESEL_TAX_RATES: Record<string, number> = {
  AL: 0.29, AK: 0.08, AZ: 0.26, AR: 0.285, CA: 0.4175,
  CO: 0.205, CT: 0.4613, DE: 0.22, FL: 0.36, GA: 0.351,
  HI: 0.16, ID: 0.32, IL: 0.467, IN: 0.56, IA: 0.325,
  KS: 0.26, KY: 0.267, LA: 0.20, ME: 0.312, MD: 0.3675,
  MA: 0.24, MI: 0.267, MN: 0.285, MS: 0.18, MO: 0.195,
  MT: 0.2975, NE: 0.26, NV: 0.27, NH: 0.234, NJ: 0.485,
  NM: 0.21, NY: 0.3055, NC: 0.382, ND: 0.23, OH: 0.385,
  OK: 0.19, OR: 0.38, PA: 0.741, RI: 0.34, SC: 0.28,
  SD: 0.28, TN: 0.27, TX: 0.20, UT: 0.32, VT: 0.31,
  VA: 0.302, WA: 0.494, WV: 0.357, WI: 0.327, WY: 0.24,
};

export function getIftaTaxCredit(state: string): number {
  return STATE_DIESEL_TAX_RATES[state?.toUpperCase()] ?? 0;
}
