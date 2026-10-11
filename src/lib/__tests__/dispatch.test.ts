import { describe, expect, it } from 'vitest';
import { dispatchCounts, dispatchGroup, isPastDue } from '@/lib/dispatch';

const today = '2026-10-11';
const soon = '2026-10-13';

describe('dispatch groups', () => {
  it('flags an open load whose delivery date has passed as past due, ahead of everything else', () => {
    const l = { status: 'in_transit', driver_id: 'd', delivery_date: '2026-08-02' };
    expect(isPastDue(l, today)).toBe(true);
    expect(dispatchGroup(l, today)).toBe('past_due');
    expect(dispatchGroup({ status: 'assigned', driver_id: null, delivery_date: '2026-08-02' }, today)).toBe('past_due');
  });

  it('never calls a delivered or cancelled load past due', () => {
    expect(isPastDue({ status: 'delivered', delivery_date: '2026-08-02' }, today)).toBe(false);
    expect(isPastDue({ status: 'cancelled', delivery_date: '2026-08-02' }, today)).toBe(false);
  });

  it('sorts the rest by whether it has a driver and whether it has started', () => {
    expect(dispatchGroup({ status: 'pending', driver_id: null, delivery_date: '2026-10-20' }, today)).toBe('no_driver');
    expect(dispatchGroup({ status: 'in_transit', driver_id: 'd', delivery_date: '2026-10-12' }, today)).toBe('on_road');
    expect(dispatchGroup({ status: 'assigned', driver_id: 'd', delivery_date: '2026-10-20' }, today)).toBe('upcoming');
  });

  it('counts the dashboard numbers without counting a load twice', () => {
    const loads = [
      { status: 'in_transit', driver_id: 'a', delivery_date: '2026-10-12' },
      { status: 'in_transit', driver_id: 'a', delivery_date: '2026-08-02' }, // past due, not on the road
      { status: 'assigned', driver_id: null, pickup_date: '2026-10-12', delivery_date: '2026-10-14' },
      { status: 'assigned', driver_id: 'b', pickup_date: '2026-10-13', delivery_date: '2026-10-15' },
      { status: 'assigned', driver_id: 'b', pickup_date: '2026-10-20', delivery_date: '2026-10-22' },
      { status: 'delivered', driver_id: 'b', delivery_date: '2026-10-01' },
    ];
    expect(dispatchCounts(loads, today, soon)).toEqual({ onRoad: 1, needDriver: 1, pastDue: 1, pickupsSoon: 2 });
  });
});
