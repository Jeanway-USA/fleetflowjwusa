import { describe, expect, it } from 'vitest';
import { documentStates, missingDocuments, periodMatchNote, summarizeWeek, weekChoices, weekFrame } from '../week-import';
import type { StagedFile } from '../settlement-reconciliation';
import type { ProofResult, TripProof } from '../weekly-proof';

const file = (type: StagedFile['type'], status: StagedFile['status'] = 'pending'): StagedFile => ({ file: new File(['x'], `${type}.bin`), type, status });

const trip = (over: Partial<TripProof> & { trip: string }): TripProof => ({
  week: '2026-09-30',
  loadFound: true,
  advanceOnly: false,
  partial: false,
  loadId: 'l1',
  pickup: null,
  meta: { delivery: null, lane: 'DALLAS, TX - DENVER, CO', agency: null, tractor: null },
  settledTrip: null,
  landstar: { revenue: 1000, charges: 10, advances: 0 },
  app: { revenue: 1000, charges: 10, advances: 0 },
  revenueComparable: true,
  gaps: { charges: { surplus: [], missing: [] }, advances: { surplus: [], missing: [] } },
  issues: [],
  ...over,
});

const proof = (trips: TripProof[]): ProofResult => ({
  trips,
  weeks: [],
  provenTrips: trips.filter((t) => t.issues.length === 0).length,
  openTrips: trips.filter((t) => t.issues.length > 0).length,
});

describe('week framing', () => {
  it('names the Landstar week by its period-ending Wednesday', () => {
    // Wed Sep 30 2026, Landstar weeks start Thursday (4)
    const f = weekFrame(new Date(2026, 8, 30), 0, 4);
    expect(f.endIso).toBe('2026-09-30');
    expect(f.startIso).toBe('2026-09-24');
    expect(f.label).toBe('Week ending Wed, Sep 30');
    expect(f.range).toBe('Thu, Sep 24 to Wed, Sep 30');
  });

  it('follows the org end day, not a fixed Wednesday', () => {
    // A Sunday-ending week (starts Monday = 1)
    const f = weekFrame(new Date(2026, 8, 30), 0, 1);
    expect(f.label).toBe('Week ending Sun, Oct 4');
  });

  it('steps back whole weeks', () => {
    const f = weekFrame(new Date(2026, 8, 30), -1, 4);
    expect(f.endIso).toBe('2026-09-23');
    const list = weekChoices(new Date(2026, 8, 30), 4, 3);
    expect(list.map((w) => w.endIso)).toEqual(['2026-09-30', '2026-09-23', '2026-09-16']);
  });
});

describe('document checklist', () => {
  it('shows all four documents with their state', () => {
    const states = documentStates([file('contractor_pdf', 'parsed'), file('freight_bill_xlsx', 'error'), file('settlement_xlsx')]);
    expect(states.map((s) => [s.type, s.status])).toEqual([
      ['contractor_pdf', 'parsed'],
      ['card_activity_pdf', 'missing'],
      ['settlement_xlsx', 'staged'],
      ['freight_bill_xlsx', 'error'],
    ]);
  });

  it('says what a missing document costs', () => {
    const missing = missingDocuments([file('contractor_pdf', 'parsed')]);
    expect(missing.map((m) => m.label)).toEqual(['Card Activity', 'Settlement Details', 'Freight Bill Details']);
    expect(missing.find((m) => m.label === 'Freight Bill Details')?.meaning).toMatch(/proof of this week is weak/);
  });
});

describe('period match note', () => {
  const frame = weekFrame(new Date(2026, 8, 30), 0, 4);
  it('is quiet when the statements cover the picked week', () => {
    expect(periodMatchNote(frame, '2026-09-24', '2026-09-30')).toBeNull();
    expect(periodMatchNote(frame, null, null)).toBeNull();
  });
  it('warns when they cover a different week', () => {
    expect(periodMatchNote(frame, '2026-09-17', '2026-09-23')).toMatch(/not the week ending wed, sep 30 you picked/i);
  });
});

describe('summarizeWeek', () => {
  const frame = weekFrame(new Date(2026, 8, 30), 0, 4);

  it('counts proven and open trips in the picked week only', () => {
    const s = summarizeWeek(
      frame,
      proof([
        trip({ trip: '1' }),
        trip({ trip: '2' }),
        trip({ trip: '3', issues: ['revenue'], app: { revenue: 900, charges: 10, advances: 0 } }),
        trip({ trip: '4', issues: ['missing_load'], loadFound: false }),
        trip({ trip: '5', week: '2026-09-23' }),
      ]),
      { inserted: 12, updated: 1, skipped: 2 },
    );
    expect(s.trips).toBe(4);
    expect(s.proven).toBe(2);
    expect(s.open).toBe(2);
    expect(s.byIssue.revenue).toBe(1);
    expect(s.byIssue.missing_load).toBe(1);
    expect(s.otherWeekTrips).toBe(1);
    expect(s.lines).toContain('2 trips match Landstar to the cent.');
    expect(s.lines).toContain('2 trips need attention.');
    expect(s.lines).toContain('12 expense lines added, 1 updated.');
    expect(s.lines.join(' ')).toMatch(/2 lines were left out/);
    expect(s.clean).toBe(false);
    expect(s.issues[0].trip).toBe('3');
    expect(s.issues[0].detail[0]).toBe('Revenue: Landstar $1,000.00, your load $900.00');
  });

  it('is clean only when every trip matches and nothing was left out', () => {
    const s = summarizeWeek(frame, proof([trip({ trip: '1' })]), { inserted: 3, updated: 0, skipped: 0 });
    expect(s.clean).toBe(true);
    expect(s.lines[0]).toBe('1 trip matches Landstar to the cent.');
  });

  it('says so when no Freight Bill file was read instead of claiming a proof', () => {
    const s = summarizeWeek(frame, null, { inserted: 5, updated: 0, skipped: 0 });
    expect(s.proved).toBe(false);
    expect(s.clean).toBe(false);
    expect(s.lines[0]).toMatch(/No Freight Bill Details file was read/);
  });

  it('says so when the file has nothing for the picked week', () => {
    const s = summarizeWeek(frame, proof([trip({ trip: '9', week: '2026-08-05' })]), null);
    expect(s.trips).toBe(0);
    expect(s.clean).toBe(false);
    expect(s.lines[0]).toMatch(/no trips settled/);
    expect(s.otherWeekTrips).toBe(1);
  });
});
