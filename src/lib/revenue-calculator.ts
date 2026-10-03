/**
 * Shared revenue calculation logic.
 * Truck/trailer percentages apply to linehaul (rate) only.
 * FSC is 100% to driver. Accessorials are already net amounts.
 * Lumpers are reimbursed in full by Landstar, so they never reduce settlement.
 */

export interface RevenueSettings {
  truckPct: number;    // e.g. 0.65
  trailerPct: number;  // e.g. 0.07
  advancePct: number;  // e.g. 0.30
  ownsTrailer: boolean;
  /** Linehaul share on power-only loads. Defaults to 0.70. */
  powerOnlyPct?: number;
}

export interface RevenueInput {
  rate: number;
  fuel_surcharge: number;
  lumper: number;
  advance_taken: number;
  is_power_only: boolean;
  start_miles?: number | null;
  end_miles?: number | null;
  accessorialsTotal: number;
}

export interface RevenueResult {
  gross_revenue: number;
  advance_available: number;
  truck_revenue: number;
  trailer_revenue: number;
  net_revenue: number;
  settlement: number;
  actual_miles: number | null;
  accessorials: number;
}

export const DEFAULT_POWER_ONLY_PCT = 0.70;

/** Round to whole cents so stored values never carry float noise (e.g. 3868.4150000000004). */
export const roundCents = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function calculateRevenue(input: RevenueInput, settings: RevenueSettings): RevenueResult {
  const { rate, fuel_surcharge, advance_taken, is_power_only, accessorialsTotal } = input;
  const { truckPct, trailerPct, advancePct, ownsTrailer } = settings;
  const powerOnlyPct = settings.powerOnlyPct ?? DEFAULT_POWER_ONLY_PCT;

  const grossRevenue = rate + fuel_surcharge + accessorialsTotal;
  const advanceAvailable = fuel_surcharge + (rate * advancePct);

  // Truck % applies to linehaul only; FSC is 100% to driver; accessorials are already net
  const truckRevenue = (rate * (is_power_only ? powerOnlyPct : truckPct)) + fuel_surcharge + accessorialsTotal;
  const trailerRevenue = is_power_only ? 0 : (ownsTrailer ? rate * trailerPct : 0);

  const netRevenue = truckRevenue + trailerRevenue;
  const settlement = netRevenue - advance_taken;

  const startMiles = input.start_miles || 0;
  const endMiles = input.end_miles || 0;
  const diff = endMiles - startMiles;

  return {
    gross_revenue: roundCents(grossRevenue),
    advance_available: roundCents(advanceAvailable),
    truck_revenue: roundCents(truckRevenue),
    trailer_revenue: roundCents(trailerRevenue),
    net_revenue: roundCents(netRevenue),
    settlement: roundCents(settlement),
    actual_miles: diff > 0 ? diff : null,
    accessorials: roundCents(accessorialsTotal),
  };
}
