/**
 * How a dispatcher sorts the open loads: what is on the road, what needs a driver, what is coming up, and
 * what should have been delivered by now. Dates are plain YYYY-MM-DD strings, compared as text.
 */

/** Statuses that mean the truck is working the load right now. */
export const ON_ROAD_STATUSES = ['at_pickup', 'loading', 'in_transit', 'at_delivery', 'unloading'] as const;
/** Booked but not started. */
export const UPCOMING_STATUSES = ['pending', 'booked', 'assigned'] as const;
/** Everything that is not finished. */
export const OPEN_STATUSES = [...UPCOMING_STATUSES, ...ON_ROAD_STATUSES] as const;

export interface DispatchLoad {
  status: string | null;
  driver_id?: string | null;
  pickup_date?: string | null;
  delivery_date?: string | null;
}

export type DispatchGroup = 'past_due' | 'no_driver' | 'on_road' | 'upcoming';

const isOnRoad = (s: string | null) => (ON_ROAD_STATUSES as readonly string[]).includes(s ?? '');
export const isOpen = (s: string | null) => (OPEN_STATUSES as readonly string[]).includes(s ?? '');

/** A load should have been delivered before today, yet is still open. */
export function isPastDue(l: DispatchLoad, today: string): boolean {
  return isOpen(l.status) && !!l.delivery_date && l.delivery_date < today;
}

/** The one group a load belongs in, most urgent first. */
export function dispatchGroup(l: DispatchLoad, today: string): DispatchGroup {
  if (isPastDue(l, today)) return 'past_due';
  if (!l.driver_id) return 'no_driver';
  return isOnRoad(l.status) ? 'on_road' : 'upcoming';
}

export interface DispatchCounts {
  onRoad: number;
  needDriver: number;
  pastDue: number;
  pickupsSoon: number;
}

/** The numbers across the top of the dashboard. `soon` is the last date counted as a coming pickup. */
export function dispatchCounts(loads: DispatchLoad[], today: string, soon: string): DispatchCounts {
  const open = loads.filter((l) => isOpen(l.status));
  return {
    onRoad: open.filter((l) => isOnRoad(l.status) && !isPastDue(l, today)).length,
    needDriver: open.filter((l) => !l.driver_id && !isPastDue(l, today)).length,
    pastDue: open.filter((l) => isPastDue(l, today)).length,
    pickupsSoon: open.filter((l) => (UPCOMING_STATUSES as readonly string[]).includes(l.status ?? '') && !!l.pickup_date && l.pickup_date >= today && l.pickup_date <= soon).length,
  };
}

export const GROUP_LABELS: Record<DispatchGroup, { title: string; hint: string }> = {
  past_due: { title: 'Past due', hint: 'Delivery date has passed and the load is still open. Mark it delivered or fix the date.' },
  no_driver: { title: 'Needs a driver', hint: 'Booked with nobody assigned.' },
  on_road: { title: 'On the road', hint: 'Loading, moving or unloading now.' },
  upcoming: { title: 'Coming up', hint: 'Assigned and waiting to pick up.' },
};
