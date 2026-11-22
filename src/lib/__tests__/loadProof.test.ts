import { describe, expect, it } from 'vitest';
import { deliveryWeekEnd, discrepancyIssue, loadProofStatus, proveWeekPath, tripIssues, type LoadDiscrepancy } from '../load-proof';
import type { TripProof } from '../weekly-proof';

const disc = (over: Partial<LoadDiscrepancy> = {}): LoadDiscrepancy => ({
  id: 'd1', reason_code: 'trip_rate_mismatch', expected_amount: 2000, actual_amount: 1950, delta_amount: -50, detail: null, resolved_at: null, ...over,
});

const trip = (over: Partial<TripProof> = {}): TripProof => ({
  trip: '5468861', week: '2026-11-25', loadFound: true, advanceOnly: false, partial: false, loadId: 'l1', pickup: null,
  meta: { delivery: null, lane: null, agency: null, tractor: null }, settledTrip: null,
  landstar: { revenue: 2000, charges: 10, advances: 0 }, app: { revenue: 2000, charges: 10, advances: 0 },
  revenueComparable: true, gaps: { charges: { surplus: [], missing: [] }, advances: { surplus: [], missing: [] } }, issues: [], ...over,
});

describe('loadProofStatus', () => {
  it('is proven only after a check that finds no issues', () => {
    const s = loadProofStatus({ status: 'delivered', discrepancies: [], checked: { found: true, trip: trip() } });
    expect(s.state).toBe('proven');
    expect(s.headline).toMatch(/to the cent/);
  });

  it('lists what disagrees, with both amounts, after a check', () => {
    const s = loadProofStatus({
      status: 'delivered', discrepancies: [],
      checked: { found: true, trip: trip({ issues: ['revenue', 'advances'], app: { revenue: 1900, charges: 10, advances: 100 }, landstar: { revenue: 2000, charges: 10, advances: 0 } }) },
    });
    expect(s.state).toBe('open');
    expect(s.issues.map((i) => i.detail)).toEqual([
      'Landstar paid $2,000.00, your load shows $1,900.00.',
      'Landstar advanced $0.00, you have $100.00.',
    ]);
  });

  it('says so when the checked file has no lines for the trip', () => {
    const s = loadProofStatus({ status: 'delivered', discrepancies: [], checked: { found: false, trip: null } });
    expect(s.state).toBe('not_proved');
    expect(s.headline).toBe('Not in that file');
  });

  it('shows open statement-import issues in words', () => {
    const s = loadProofStatus({ status: 'delivered', discrepancies: [disc(), disc({ id: 'd2', resolved_at: '2026-11-20' })] });
    expect(s.state).toBe('open');
    expect(s.issues).toHaveLength(1);
    expect(s.issues[0].title).toBe('Revenue does not match Landstar');
    expect(s.issues[0].detail).toBe('Expected $2,000.00, Landstar $1,950.00, difference −$50.00.');
  });

  it('flags a load the import marked even without logged rows', () => {
    expect(loadProofStatus({ status: 'delivered', discrepancies: [], hasStatementDiscrepancy: true }).state).toBe('open');
  });

  it('does not claim a proof for undelivered loads', () => {
    expect(loadProofStatus({ status: 'in_transit', discrepancies: [] }).state).toBe('not_delivered');
  });

  it('separates resolved issues from never-checked loads', () => {
    expect(loadProofStatus({ status: 'delivered', discrepancies: [disc({ resolved_at: '2026-11-20' })] }).state).toBe('resolved');
    expect(loadProofStatus({ status: 'delivered', discrepancies: [] }).state).toBe('not_proved');
  });
});

describe('issue wording', () => {
  it('names a missing load', () => {
    expect(tripIssues(trip({ issues: ['missing_load'] }))[0].title).toMatch(/not in your loads/);
  });
  it('handles an unknown reason code', () => {
    expect(discrepancyIssue(disc({ reason_code: 'something_new', delta_amount: 0 })).title).toBe('something new');
  });
});

describe('week routing', () => {
  it('puts a delivery on the period-ending day on or after it (Landstar: Wednesday)', () => {
    expect(deliveryWeekEnd('2026-11-19', 3)).toBe('2026-11-25'); // Thu -> next Wed
    expect(deliveryWeekEnd('2026-11-25', 3)).toBe('2026-11-25'); // Wed itself
    expect(deliveryWeekEnd(null, 3)).toBeNull();
  });
  it('follows a different end day', () => {
    expect(deliveryWeekEnd('2026-11-19', 0)).toBe('2026-11-22'); // Sunday-ending
  });
  it('builds the prove-week link', () => {
    expect(proveWeekPath('2026-11-25')).toBe('/finance?view=settlement&prove=1&weekEnd=2026-11-25');
    expect(proveWeekPath(null)).toBe('/finance?view=settlement&prove=1');
  });
});
