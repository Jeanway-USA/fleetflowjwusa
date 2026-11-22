import type { PendingAction } from '@/components/executive/PendingActionsCard';
import type { WeekFrame, WeekSummary } from '@/lib/week-import';

/**
 * To-do rows for the Landstar settlement week: has the last finished week been proven, and are trips still open.
 *
 * What the app remembers: when a week is proved (the weekly import finishes), one small record per week is saved in
 * company_settings under `proved_week:<week-ending date>`. The Freight Bill lines themselves are not stored, so this
 * record is the only trace that a week was proved and how it ended. Heuristic: the last finished week needs proving
 * when loads were delivered in it and no record exists; it stays on the list while the record says trips were open
 * or Freight Bill Details was missing, until the week is proved again. Open statement discrepancies are read live.
 */

export const PROVED_WEEK_PREFIX = 'proved_week:';
export const provedWeekKey = (weekEndIso: string) => `${PROVED_WEEK_PREFIX}${weekEndIso}`;

export interface ProvedWeekRecord {
  /** When the week was proved (ISO timestamp). */
  at: string;
  trips: number;
  proven: number;
  /** Trips still disagreeing with Landstar when the week was proved. */
  open: number;
  /** Whether Freight Bill Details was read; without it trips cannot be proven. */
  hadFreightBill: boolean;
  /** Labels of the documents that were not added. */
  missingDocuments: string[];
}

export function recordFromSummary(summary: WeekSummary, missingDocuments: string[], now: Date = new Date()): ProvedWeekRecord {
  return {
    at: now.toISOString(),
    trips: summary.trips,
    proven: summary.proven,
    open: summary.open,
    hadFreightBill: summary.proved,
    missingDocuments,
  };
}

export const serializeRecord = (r: ProvedWeekRecord) => JSON.stringify(r);

/** The one slice of the database client the writer needs, so it can be tested without a database. */
export interface SettingsClient {
  from(table: 'company_settings'): {
    upsert(row: { org_id: string; setting_key: string; setting_value: string }, options: { onConflict: string }): PromiseLike<{ error: unknown }>;
  };
}

/**
 * Saves how a week ended after "Prove this week", under the same key and in the same shape proveWeekActions reads.
 * Proving the week again replaces the note, which is how a week with open trips stops being listed once it is clean.
 */
export async function saveProvedWeek(
  client: SettingsClient,
  orgId: string | null,
  summary: WeekSummary,
  missingDocuments: string[],
  now: Date = new Date(),
): Promise<{ saved: boolean; error?: unknown }> {
  if (!orgId) return { saved: false, error: new Error('No organization') };
  const record = recordFromSummary(summary, missingDocuments, now);
  const { error } = await client
    .from('company_settings')
    .upsert({ org_id: orgId, setting_key: provedWeekKey(summary.frame.endIso), setting_value: serializeRecord(record) }, { onConflict: 'org_id,setting_key' });
  return error ? { saved: false, error } : { saved: true };
}

/** Reads a saved record; anything unreadable counts as no record, so the week is simply offered for proving again. */
export function parseRecord(value: string | null | undefined): ProvedWeekRecord | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value);
    if (!v || typeof v !== 'object') return null;
    return {
      at: typeof v.at === 'string' ? v.at : '',
      trips: Number(v.trips) || 0,
      proven: Number(v.proven) || 0,
      open: Math.max(0, Number(v.open) || 0),
      hadFreightBill: !!v.hadFreightBill,
      missingDocuments: Array.isArray(v.missingDocuments) ? v.missingDocuments.map(String) : [],
    };
  } catch {
    return null;
  }
}

interface ActionInput {
  /** The last finished settlement week. */
  frame: WeekFrame;
  record: ProvedWeekRecord | null;
  /** Loads delivered in that week: with none there is nothing to prove. */
  deliveredInWeek: number;
  /** Statement discrepancies nobody has resolved. */
  unresolvedDiscrepancies: number;
}

const GAPS_PATH = '/finance?view=settlement';
/** The Settlement tab with the prove window open on this week (Finance reads prove and weekEnd). */
const proveWeekPath = (weekEndIso: string) => `/finance?view=settlement&prove=1&weekEnd=${weekEndIso}`;
const weekName = (frame: WeekFrame) => frame.label.replace(/^Week ending /, 'week ending ');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function proveWeekActions({ frame, record, deliveredInWeek, unresolvedDiscrepancies }: ActionInput): PendingAction[] {
  const out: PendingAction[] = [];

  if (!record) {
    if (deliveredInWeek > 0) {
      out.push({
        id: 'prove-week',
        type: 'settlement',
        title: `Prove ${weekName(frame)}`,
        detail: `${plural(deliveredInWeek, 'delivered load')} not yet checked against Landstar`,
        count: deliveredInWeek,
        priority: 'high',
        link: proveWeekPath(frame.endIso),
      });
    }
  } else if (record.open > 0) {
    out.push({
      id: 'open-trips',
      type: 'settlement',
      title: `${plural(record.open, 'trip')} still open, ${weekName(frame)}`,
      detail: 'They disagree with Landstar. Fix them, then prove the week again.',
      count: record.open,
      priority: 'high',
      link: GAPS_PATH,
    });
  } else if (record.hadFreightBill && record.trips === 0 && deliveredInWeek > 0) {
    // The Freight Bill file held no trips for this week (wrong week or wrong file), so nothing was actually proved.
    out.push({
      id: 'prove-week',
      type: 'settlement',
      title: `Prove ${weekName(frame)}`,
      detail: 'The Freight Bill file had no trips for this week. Use the file for this week.',
      count: deliveredInWeek,
      priority: 'high',
      link: proveWeekPath(frame.endIso),
    });
  } else if (!record.hadFreightBill) {
    out.push({
      id: 'prove-week-partial',
      type: 'settlement',
      title: `Finish proving ${weekName(frame)}`,
      detail: 'Imported without Freight Bill Details, so trips were not proven.',
      count: 1,
      priority: 'medium',
      link: proveWeekPath(frame.endIso),
    });
  }

  if (unresolvedDiscrepancies > 0) {
    out.push({
      id: 'statement-discrepancies',
      type: 'settlement',
      title: 'Statement discrepancies to resolve',
      detail: 'Landstar and your loads disagree.',
      count: unresolvedDiscrepancies,
      priority: 'high',
      link: GAPS_PATH,
    });
  }
  return out;
}

const RANK: Record<PendingAction['priority'], number> = { high: 0, medium: 1, low: 2 };

/** High priority first; within a priority the money rows come before everything else, and order is otherwise kept. */
export function sortActions(actions: PendingAction[]): PendingAction[] {
  return actions
    .map((a, i) => ({ a, i }))
    .sort((x, y) => RANK[x.a.priority] - RANK[y.a.priority] || Number(y.a.type === 'settlement') - Number(x.a.type === 'settlement') || x.i - y.i)
    .map((x) => x.a);
}
