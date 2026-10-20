/**
 * What a driver does to a load, in one place. The home screen and My Loads both move a load through the same
 * steps, so the steps, their words, and where the driver is on the trip are decided here and tested here.
 */

export type LoadStatus = 'pending' | 'assigned' | 'loading' | 'in_transit' | 'delivered' | 'cancelled';

/** Each status and the one a driver moves it to. */
export const STATUS_PROGRESSION: Record<string, string> = {
  pending: 'assigned',
  assigned: 'loading',
  loading: 'in_transit',
  in_transit: 'delivered',
};

export const nextStatusOf = (status: string): string | null => STATUS_PROGRESSION[status] ?? null;

/** The button that moves the load on. */
export function progressLabel(status: string): string {
  switch (status) {
    case 'pending': return 'Accept load';
    case 'assigned': return 'Arrived at pickup';
    case 'loading': return 'Loaded, departing';
    case 'in_transit': return 'Mark delivered';
    default: return '';
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case 'pending': return 'Pending';
    case 'assigned': return 'Assigned';
    case 'loading': return 'Loading';
    case 'in_transit': return 'In transit';
    case 'delivered': return 'Delivered';
    case 'cancelled': return 'Cancelled';
    default: return status.replace(/_/g, ' ');
  }
}

/** "1234 Dock Rd, Reading, PA 19601" becomes "Reading, PA". */
export function condensedAddress(address: string | null | undefined): string {
  if (!address) return '-';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const match = parts[i].match(/\b([A-Z]{2})\b/);
    if (match) {
      const city = i > 0 ? parts[i - 1] : '';
      return city ? `${city}, ${match[1]}` : match[1];
    }
  }
  return parts[0] || address;
}

/** How far through the trip each status is: 0 not started, 1 at pickup, 2 hauling, 3 delivered. */
export function tripStage(status: string): 0 | 1 | 2 | 3 {
  switch (status) {
    case 'loading': return 1;
    case 'in_transit': return 2;
    case 'delivered': return 3;
    default: return 0;
  }
}

/** "2026-10-20" as "Tue Oct 20", without letting the time zone shift the day. */
export function shortDate(date: string | null | undefined): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return null;
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const day = new Date(y, m - 1, d);
  return day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '');
}

export type StopKind = 'pickup' | 'stop' | 'delivery';

export interface IntermediateStopLike {
  id: string;
  stop_number: number | null;
  stop_type: string | null;
  facility_name: string | null;
  location: string | null;
  scheduled_date: string | null;
  status: string | null;
  completed_at: string | null;
}

export interface LadderRow {
  key: string;
  kind: StopKind;
  /** Stop number down the ladder: pickup is 1. */
  index: number;
  place: string;
  detail: string | null;
  done: boolean;
  /** The one row the driver is heading for. */
  next: boolean;
  stop?: IntermediateStopLike;
}

/**
 * The trip as a ladder: pickup, each intermediate stop in order, then delivery. A row is done once the driver has
 * passed it, and the first row not done is the next stop. Pickup is passed when the load leaves for delivery;
 * delivery is done when the load is delivered.
 */
export function buildLadder(
  load: { status: string; origin: string; destination: string },
  stops: IntermediateStopLike[] | undefined | null,
): LadderRow[] {
  const stage = tripStage(load.status);
  const ordered = [...(stops ?? [])].sort((a, b) => (a.stop_number ?? 0) - (b.stop_number ?? 0));
  const rows: LadderRow[] = [
    { key: 'pickup', kind: 'pickup', index: 1, place: condensedAddress(load.origin), detail: load.origin, done: stage >= 2, next: false },
    ...ordered.map((s, i): LadderRow => ({
      key: s.id,
      kind: 'stop',
      index: i + 2,
      place: s.facility_name || condensedAddress(s.location),
      detail: s.location,
      done: (s.status ?? 'pending') === 'completed',
      next: false,
      stop: s,
    })),
    { key: 'delivery', kind: 'delivery', index: ordered.length + 2, place: condensedAddress(load.destination), detail: load.destination, done: stage >= 3, next: false },
  ];
  if (load.status === 'cancelled') return rows;
  const next = rows.find((r) => !r.done);
  if (next) next.next = true;
  return rows;
}

/** Counts for the ladder's header: stops done of all, as "2 of 4". */
export function ladderProgress(rows: LadderRow[]): { done: number; total: number } {
  return { done: rows.filter((r) => r.done).length, total: rows.length };
}

/**
 * What kind of appointment a stop has, in plain words and no symbols: a hard appointment, an open window, or
 * first come first served. Returns null when there is no time to show.
 */
export function appointmentText(
  timeType: string | null | undefined,
  time: string | null | undefined,
  endTime?: string | null,
): { kind: 'appointment' | 'window' | 'fcfs'; text: string; label: string } | null {
  if (!time) return null;
  if (timeType === 'window') return { kind: 'window', text: endTime ? `Open window ${time} to ${endTime}` : `Open window from ${time}`, label: 'Open window' };
  if (timeType === 'fcfs') return { kind: 'fcfs', text: `First come first served from ${time}`, label: 'First come first served' };
  return { kind: 'appointment', text: `Appointment ${time}`, label: 'Appointment' };
}

/** Splits dispatch's special instructions into the main text and the intermediate stops list. */
export function splitInstructions(notes: string | null | undefined): { main: string; stops: string } {
  if (!notes) return { main: '', stops: '' };
  const content = notes.split(/---\s*Updated from Rate Confirmation\s*---/i)[0]?.trim() || '';
  const stopsMatch = content.match(/===\s*INTERMEDIATE STOPS\s*===\n?([\s\S]*?)$/i);
  const stops = stopsMatch?.[1]?.trim() ?? '';
  const main = stopsMatch ? content.replace(/===\s*INTERMEDIATE STOPS\s*===[\s\S]*$/i, '').trim() : content;
  return { main, stops };
}
