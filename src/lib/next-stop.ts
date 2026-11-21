import { format, parseISO } from 'date-fns';
import { cityState } from '@/lib/formatters';

const BEFORE_PICKUP = new Set(['assigned', 'loading', 'at_pickup']);

export interface NextStopLoad {
  status: string | null;
  origin: string | null;
  destination: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
}

const day = (d: string | null) => {
  if (!d) return null;
  try { return format(parseISO(d), 'EEE MMM d'); } catch { return null; }
};

/** The next place a load is headed: the pickup until it has been picked up, the delivery after. */
export function nextStop(load: NextStopLoad) {
  const toPickup = BEFORE_PICKUP.has(load.status ?? '');
  return {
    verb: toPickup ? 'Pickup' : 'Delivery',
    place: cityState(toPickup ? load.origin : load.destination) || 'Unknown',
    when: day(toPickup ? load.pickup_date : load.delivery_date),
  };
}
