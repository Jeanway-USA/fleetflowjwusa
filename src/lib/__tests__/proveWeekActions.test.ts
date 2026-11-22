import { describe, expect, it } from 'vitest';
import { parseRecord, proveWeekActions, provedWeekKey, recordFromSummary, serializeRecord, sortActions, type ProvedWeekRecord } from '../prove-week-actions';
import { summarizeWeek, weekFrame } from '../week-import';
import type { PendingAction } from '@/components/executive/PendingActionsCard';

const frame = weekFrame(new Date(2026, 10, 25), -1, 4); // last finished week: ends Wed Nov 18
const clean: ProvedWeekRecord = { at: '2026-11-19T15:00:00Z', trips: 4, proven: 4, open: 0, hadFreightBill: true, missingDocuments: [] };

describe('proveWeekActions', () => {
  it('asks to prove the last finished week when loads were delivered and nothing was proved', () => {
    const [a] = proveWeekActions({ frame, record: null, deliveredInWeek: 3, unresolvedDiscrepancies: 0 });
    expect(a).toMatchObject({ id: 'prove-week', type: 'settlement', priority: 'high', title: 'Prove week ending Wed, Nov 18', count: 3 });
    expect(a.link).toBe('/finance?view=settlement&prove=1&weekEnd=2026-11-18');
    expect(a.detail).toBe('3 delivered loads not yet checked against Landstar');
  });

  it('has nothing to prove when no load was delivered that week', () => {
    expect(proveWeekActions({ frame, record: null, deliveredInWeek: 0, unresolvedDiscrepancies: 0 })).toEqual([]);
  });

  it('shows nothing for a clean proven week', () => {
    expect(proveWeekActions({ frame, record: clean, deliveredInWeek: 4, unresolvedDiscrepancies: 0 })).toEqual([]);
  });

  it('lists open trips after a partial prove, linking to the gaps', () => {
    const [a] = proveWeekActions({ frame, record: { ...clean, proven: 2, open: 2 }, deliveredInWeek: 4, unresolvedDiscrepancies: 0 });
    expect(a).toMatchObject({ id: 'open-trips', priority: 'high', count: 2, title: '2 trips still open, week ending Wed, Nov 18', link: '/finance?view=settlement' });
  });

  it('uses the singular for one open trip', () => {
    expect(proveWeekActions({ frame, record: { ...clean, open: 1 }, deliveredInWeek: 1, unresolvedDiscrepancies: 0 })[0].title).toMatch(/^1 trip still open/);
  });

  it('asks to finish a week imported without Freight Bill Details, at medium priority', () => {
    const [a] = proveWeekActions({ frame, record: { ...clean, hadFreightBill: false, trips: 0, proven: 0 }, deliveredInWeek: 4, unresolvedDiscrepancies: 0 });
    expect(a).toMatchObject({ id: 'prove-week-partial', priority: 'medium' });
    expect(a.link).toContain('prove=1');
  });

  it('adds open statement discrepancies on their own', () => {
    const actions = proveWeekActions({ frame, record: clean, deliveredInWeek: 4, unresolvedDiscrepancies: 3 });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ id: 'statement-discrepancies', count: 3, priority: 'high' });
  });
});

describe('records', () => {
  it('round-trips and tolerates junk', () => {
    expect(parseRecord(serializeRecord(clean))).toEqual(clean);
    expect(parseRecord('not json')).toBeNull();
    expect(parseRecord(null)).toBeNull();
    expect(parseRecord('"text"')).toBeNull();
    expect(parseRecord('{"open":-4}')?.open).toBe(0);
  });

  it('builds a record from the week summary', () => {
    const summary = summarizeWeek(frame, null, { inserted: 5, updated: 0, skipped: 0 });
    const r = recordFromSummary(summary, ['Freight Bill Details'], new Date('2026-11-19T12:00:00Z'));
    expect(r).toMatchObject({ hadFreightBill: false, open: 0, missingDocuments: ['Freight Bill Details'], at: '2026-11-19T12:00:00.000Z' });
  });

  it('keys one record per week ending', () => {
    expect(provedWeekKey('2026-11-18')).toBe('proved_week:2026-11-18');
  });
});

describe('sortActions', () => {
  const a = (id: string, type: PendingAction['type'], priority: PendingAction['priority']): PendingAction => ({ id, type, title: id, count: 1, priority });
  it('puts high first and money rows ahead of other rows of the same priority', () => {
    const sorted = sortActions([a('creds', 'credential', 'medium'), a('maint', 'maintenance', 'high'), a('draft', 'settlement', 'medium'), a('prove', 'settlement', 'high')]);
    expect(sorted.map((x) => x.id)).toEqual(['prove', 'maint', 'draft', 'creds']);
  });
  it('keeps the original order otherwise', () => {
    expect(sortActions([a('x', 'document', 'low'), a('y', 'document', 'low')]).map((x) => x.id)).toEqual(['x', 'y']);
  });
});

// ---- the writer and the reader must agree ----
import { saveProvedWeek, type SettingsClient } from '../prove-week-actions';
import type { ProofResult, TripProof } from '../weekly-proof';

function fakeClient(failWith?: unknown) {
  const rows: Array<{ row: Record<string, string>; options: { onConflict: string } }> = [];
  const client: SettingsClient = {
    from: () => ({
      upsert: async (row, options) => {
        rows.push({ row, options });
        return { error: failWith ?? null };
      },
    }),
  };
  return { client, rows };
}

const proofTrip = (trip: string, issues: TripProof['issues'] = []): TripProof => ({
  trip, week: frame.endIso, loadFound: true, advanceOnly: false, partial: false, loadId: 'l', pickup: null,
  meta: { delivery: null, lane: 'A - B', agency: null, tractor: null }, settledTrip: null,
  landstar: { revenue: 1000, charges: 0, advances: 0 }, app: { revenue: 1000, charges: 0, advances: 0 },
  revenueComparable: true, gaps: { charges: { surplus: [], missing: [] }, advances: { surplus: [], missing: [] } }, issues,
});
const proofOf = (trips: TripProof[]): ProofResult => ({ trips, weeks: [], provenTrips: trips.filter((t) => !t.issues.length).length, openTrips: trips.filter((t) => t.issues.length).length });

/** Writes the note the way StatementUpload does, then reads it back the way Today does. */
async function proveThenReadToday(trips: TripProof[] | null, deliveredInWeek: number, unresolvedDiscrepancies = 0) {
  const summary = summarizeWeek(frame, trips ? proofOf(trips) : null, { inserted: 4, updated: 0, skipped: 0 });
  const { client, rows } = fakeClient();
  const result = await saveProvedWeek(client, 'org-1', summary, trips ? [] : ['Freight Bill Details'], new Date('2026-11-19T12:00:00Z'));
  expect(result.saved).toBe(true);
  const written = rows[0];
  const record = parseRecord(written.row.setting_value);
  return { written, actions: proveWeekActions({ frame, record, deliveredInWeek, unresolvedDiscrepancies }) };
}

describe('saveProvedWeek', () => {
  it('writes under the key and conflict target Today reads', async () => {
    const { written } = await proveThenReadToday([proofTrip('1')], 1);
    expect(written.row.org_id).toBe('org-1');
    expect(written.row.setting_key).toBe(provedWeekKey(frame.endIso));
    expect(written.options.onConflict).toBe('org_id,setting_key');
    expect(parseRecord(written.row.setting_value)).toMatchObject({ trips: 1, proven: 1, open: 0, hadFreightBill: true, at: '2026-11-19T12:00:00.000Z' });
  });

  it('a clean prove clears the prove-week action', async () => {
    const { actions } = await proveThenReadToday([proofTrip('1'), proofTrip('2')], 2);
    expect(actions).toEqual([]);
  });

  it('a prove with open trips leaves an open-trips follow-up that links to the gaps', async () => {
    const { actions } = await proveThenReadToday([proofTrip('1'), proofTrip('2', ['revenue']), proofTrip('3', ['charges', 'advances'])], 3);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ id: 'open-trips', count: 2, priority: 'high', link: '/finance?view=settlement' });
    expect(actions[0].id).not.toBe('prove-week');
  });

  it('proving again once clean replaces the open note and clears the follow-up', async () => {
    const first = await proveThenReadToday([proofTrip('1', ['revenue'])], 1);
    expect(first.actions[0].id).toBe('open-trips');
    const second = await proveThenReadToday([proofTrip('1')], 1);
    expect(second.written.row.setting_key).toBe(first.written.row.setting_key); // same key, so the upsert replaces it
    expect(second.actions).toEqual([]);
  });

  it('a week imported without Freight Bill is only a medium follow-up, never the urgent prove row', async () => {
    const { actions } = await proveThenReadToday(null, 2);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ id: 'prove-week-partial', priority: 'medium' });
  });

  it('a Freight Bill with no trips for the week is not a proof: the prove row stays', async () => {
    const { actions } = await proveThenReadToday([], 2);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ id: 'prove-week', priority: 'high' });
  });

  it('reports a failed save instead of pretending it worked', async () => {
    const summary = summarizeWeek(frame, proofOf([proofTrip('1')]), null);
    const { client } = fakeClient(new Error('row-level security'));
    expect((await saveProvedWeek(client, 'org-1', summary, [])).saved).toBe(false);
    expect((await saveProvedWeek(fakeClient().client, null, summary, [])).saved).toBe(false);
  });
});
