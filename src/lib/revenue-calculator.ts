/**
 * Shared revenue calculation logic.
 * Truck/trailer percentages apply to linehaul (rate) only.
 * FSC is 100% to driver. Accessorials are already net amounts.
 */

export interface RevenueSettings {
  truckPct: number;    // e.g. 0.65
  trailerPct: number;  // e.g. 0.07
  advancePct: number;  // e.g. 0.30
  ownsTrailer: boolean;
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

export function calculateRevenue(input: RevenueInput, settings: RevenueSettings): RevenueResult {
  const { rate, fuel_surcharge, lumper, advance_taken, is_power_only, accessorialsTotal } = input;
  const { truckPct, trailerPct, advancePct, ownsTrailer } = settings;

  const grossRevenue = rate + fuel_surcharge + accessorialsTotal;
  const advanceAvailable = fuel_surcharge + (rate * advancePct);

  // Truck % applies to linehaul only; FSC is 100% to driver; accessorials are already net
  let truckRevenue = is_power_only
    ? (rate * 0.70) + fuel_surcharge + accessorialsTotal
    : (rate * truckPct) + fuel_surcharge + accessorialsTotal;
  let trailerRevenue = is_power_only ? 0 : (ownsTrailer ? rate * trailerPct : 0);

  const netRevenue = truckRevenue + trailerRevenue;
  const settlement = netRevenue - advance_taken - lumper;

  const startMiles = input.start_miles || 0;
  const endMiles = input.end_miles || 0;
  const diff = endMiles - startMiles;

  return {
    gross_revenue: grossRevenue,
    advance_available: advanceAvailable,
    truck_revenue: truckRevenue,
    trailer_revenue: trailerRevenue,
    net_revenue: netRevenue,
    settlement,
    actual_miles: diff > 0 ? diff : null,
    accessorials: accessorialsTotal,
  };
}
