/**
 * The money on an agency (brokerage) load. The broker pays one rate and the carrier is paid another; the
 * difference is the margin. A load run on Landstar's authority also pays the BCO a split of its linehaul
 * (65 to 75 percent), while fuel surcharge and the tarp fee pass through at 100 percent.
 */

export const DEFAULT_BCO_SPLIT_PCT = 72;

export interface AgencyMoney {
  broker_rate?: number | string | null;
  carrier_rate?: number | string | null;
  margin?: number | string | null;
  gross_linehaul?: number | string | null;
  fuel_surcharge?: number | string | null;
  tarp_fee?: number | string | null;
  bco_split_pct?: number | string | null;
  status?: string | null;
}

const n = (v: unknown) => Number(v) || 0;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** What the load bills in all on the Landstar side: linehaul, fuel surcharge and tarp fee. */
export function landstarBilled(l: AgencyMoney): number {
  return round2(n(l.gross_linehaul) + n(l.fuel_surcharge) + n(l.tarp_fee));
}

/** What the BCO is paid: the split of linehaul, plus fuel surcharge and tarp fee in full. */
export function bcoPayout(l: AgencyMoney): number {
  const split = n(l.bco_split_pct) || DEFAULT_BCO_SPLIT_PCT;
  return round2(n(l.gross_linehaul) * (split / 100) + n(l.fuel_surcharge) + n(l.tarp_fee));
}

/** Margin as a percent of what the broker pays, or null when there is no broker rate. */
export function marginPercent(l: AgencyMoney): number | null {
  const broker = n(l.broker_rate);
  return broker ? (n(l.margin) / broker) * 100 : null;
}

export interface AgencyTotals {
  loads: number;
  open: number;
  brokerPays: number;
  carrierCost: number;
  margin: number;
  bcoPayout: number;
}

/** Totals over the loads shown. Cancelled loads count for nothing. */
export function summarizeAgencyLoads(loads: AgencyMoney[]): AgencyTotals {
  const live = loads.filter((l) => l.status !== 'cancelled');
  return {
    loads: live.length,
    open: live.filter((l) => l.status !== 'delivered').length,
    brokerPays: round2(live.reduce((s, l) => s + n(l.broker_rate), 0)),
    carrierCost: round2(live.reduce((s, l) => s + n(l.carrier_rate), 0)),
    margin: round2(live.reduce((s, l) => s + n(l.margin), 0)),
    bcoPayout: round2(live.reduce((s, l) => s + bcoPayout(l), 0)),
  };
}
