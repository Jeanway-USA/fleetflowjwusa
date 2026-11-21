import { format, parseISO } from 'date-fns';
import { settlementWeek, type WeekDay } from '@/lib/settlement-week';
import type { StagedFile } from '@/lib/settlement-reconciliation';
import type { ProofIssue, ProofResult, TripProof } from '@/lib/weekly-proof';

/**
 * The weekly Landstar import as a job: pick the settlement week, see which of the four documents are in, prove the
 * week, and read what matched and what is still open. Everything here is plain logic so it can be tested.
 */

export type WeekDocType = Exclude<StagedFile['type'], 'unknown'>;

/** The four documents Landstar produces for a settlement week, in the order the office usually has them. */
export const WEEK_DOCUMENTS: Array<{ type: WeekDocType; label: string; short: string; kind: 'pdf' | 'xlsx'; ifMissing: string }> = [
  {
    type: 'contractor_pdf',
    label: 'Contractor Statement',
    short: 'PDF',
    kind: 'pdf',
    ifMissing: 'Without the Contractor Statement there is no itemized, authoritative list of what Landstar paid and took, so the week cannot be checked line by line.',
  },
  {
    type: 'card_activity_pdf',
    label: 'Card Activity',
    short: 'PDF',
    kind: 'pdf',
    ifMissing: 'Without Card Activity, fuel, DEF, scale and cash-advance charges on the card are not imported.',
  },
  {
    type: 'settlement_xlsx',
    label: 'Settlement Details',
    short: 'XLSX',
    kind: 'xlsx',
    ifMissing: 'Without Settlement Details, the Contractor Statement lines are not cross-checked against Landstar’s own detail.',
  },
  {
    type: 'freight_bill_xlsx',
    label: 'Freight Bill Details',
    short: 'XLSX',
    kind: 'xlsx',
    ifMissing: 'Without Freight Bill Details, trip revenue cannot be proven trip by trip, so the proof of this week is weak.',
  },
];

export type DocStatus = 'missing' | 'staged' | 'parsing' | 'parsed' | 'error';

export interface DocState {
  type: WeekDocType;
  status: DocStatus;
  file?: StagedFile;
}

/** One row per expected document: missing, staged (waiting to be read), reading, read, or failed. */
export function documentStates(files: StagedFile[]): DocState[] {
  return WEEK_DOCUMENTS.map(({ type }) => {
    const file = files.find((f) => f.type === type);
    if (!file) return { type, status: 'missing' as const };
    const status: DocStatus = file.status === 'pending' ? 'staged' : file.status === 'parsing' ? 'parsing' : file.status === 'parsed' ? 'parsed' : 'error';
    return { type, status, file };
  });
}

/** What the office does not have yet, and what that costs them. */
export function missingDocuments(files: StagedFile[]): Array<{ label: string; meaning: string }> {
  const states = documentStates(files);
  return WEEK_DOCUMENTS.filter((d) => states.find((s) => s.type === d.type)?.status === 'missing').map((d) => ({ label: d.label, meaning: d.ifMissing }));
}

/** Files that were added but whose kind could not be told, so nothing is silently ignored. */
export function unrecognizedFiles(files: StagedFile[]): StagedFile[] {
  return files.filter((f) => f.type === 'unknown');
}

export interface WeekFrame {
  offset: number;
  /** YYYY-MM-DD of the first day and of the period-ending day. */
  startIso: string;
  endIso: string;
  /** "Week ending Wed, Sep 30" */
  label: string;
  /** "Thu, Sep 24 to Wed, Sep 30" */
  range: string;
}

/** The settlement week `offset` weeks from today (0 = the week holding today, -1 = the last one), on the org's week. */
export function weekFrame(today: Date, offset: number, weekStartsOn: WeekDay): WeekFrame {
  const w = settlementWeek(today, offset, weekStartsOn);
  return {
    offset,
    startIso: w.isoDays[0],
    endIso: w.isoDays[6],
    label: `Week ending ${format(w.end, 'EEE, MMM d')}`,
    range: `${format(w.start, 'EEE, MMM d')} to ${format(w.end, 'EEE, MMM d')}`,
  };
}

/** Choices for the week picker: this week, then the weeks before it. */
export function weekChoices(today: Date, weekStartsOn: WeekDay, count = 8): WeekFrame[] {
  return Array.from({ length: count }, (_, i) => weekFrame(today, -i, weekStartsOn));
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The picked week against the period the statements themselves say they cover. */
export function periodMatchNote(frame: WeekFrame, periodStart: string | null, periodEnd: string | null): string | null {
  if (!periodEnd) return null;
  if (periodEnd === frame.endIso) return null;
  const when = (d: string) => { try { return format(parseISO(d), 'EEE, MMM d'); } catch { return d; } };
  return `These statements cover ${periodStart ? `${when(periodStart)} to ` : 'the period ending '}${when(periodEnd)}, not the ${frame.label.toLowerCase()} you picked. Check you chose the right week.`;
}

export interface ImportOutcome {
  inserted: number;
  updated: number;
  /** Lines the office left unticked or that had no usable date: counted so nothing disappears quietly. */
  skipped: number;
}

export interface IssueRow {
  trip: string;
  lane: string | null;
  issues: ProofIssue[];
  /** One plain line per disagreeing amount, with both sides. */
  detail: string[];
}

export interface WeekSummary {
  frame: WeekFrame;
  /** Whether a Freight Bill Details file was read, i.e. whether trips could be proven at all. */
  proved: boolean;
  trips: number;
  proven: number;
  open: number;
  byIssue: Record<ProofIssue, number>;
  /** Trips Landstar settled with only charges and advances, recorded as expenses and not as loads. */
  advanceOnly: number;
  issues: IssueRow[];
  /** Trips in the proof that belong to other weeks, so they are not counted here. */
  otherWeekTrips: number;
  outcome: ImportOutcome | null;
  lines: string[];
  /** True when the week is proven and nothing is waiting. */
  clean: boolean;
}

const usd = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function issueDetail(t: TripProof): string[] {
  const out: string[] = [];
  if (t.issues.includes('missing_load')) out.push('Settled by Landstar but not in your loads');
  if (t.issues.includes('revenue')) out.push(`Revenue: Landstar ${usd(t.landstar.revenue)}, your load ${usd(t.app.revenue)}`);
  if (t.issues.includes('charges')) out.push(`Charges: Landstar ${usd(t.landstar.charges)}, you have ${usd(t.app.charges)}`);
  if (t.issues.includes('advances')) out.push(`Advances: Landstar ${usd(t.landstar.advances)}, you have ${usd(t.app.advances)}`);
  return out;
}

/**
 * What the office reads after "Prove this week": how many trips match Landstar to the cent, how many need
 * attention and why, what the import added, and anything that was left out.
 */
export function summarizeWeek(frame: WeekFrame, proof: ProofResult | null, outcome: ImportOutcome | null): WeekSummary {
  const inWeek = proof ? proof.trips.filter((t) => t.week === frame.endIso) : [];
  const openTrips = inWeek.filter((t) => t.issues.length > 0);
  const byIssue: Record<ProofIssue, number> = { missing_load: 0, revenue: 0, charges: 0, advances: 0 };
  for (const t of openTrips) for (const i of t.issues) byIssue[i] += 1;
  const proven = inWeek.length - openTrips.length;
  const proved = !!proof;

  const lines: string[] = [];
  if (!proved) {
    lines.push('No Freight Bill Details file was read, so trips were not proven against Landstar. Add it to prove this week.');
  } else if (inWeek.length === 0) {
    lines.push(`Landstar's Freight Bill Details has no trips settled in the ${frame.label.toLowerCase()}. Check you picked the right week.`);
  } else {
    if (proven > 0) lines.push(`${plural(proven, 'trip')} ${proven === 1 ? 'matches' : 'match'} Landstar to the cent.`);
    if (openTrips.length > 0) lines.push(`${plural(openTrips.length, 'trip')} ${openTrips.length === 1 ? 'needs' : 'need'} attention.`);
    if (byIssue.missing_load > 0) lines.push(`${plural(byIssue.missing_load, 'trip')} Landstar settled ${byIssue.missing_load === 1 ? 'is' : 'are'} missing from your loads.`);
    if (byIssue.revenue > 0) lines.push(`${plural(byIssue.revenue, 'trip')} ${byIssue.revenue === 1 ? 'has' : 'have'} revenue that disagrees with Landstar.`);
    if (byIssue.charges > 0) lines.push(`${plural(byIssue.charges, 'trip')} ${byIssue.charges === 1 ? 'has' : 'have'} charges that disagree.`);
    if (byIssue.advances > 0) lines.push(`${plural(byIssue.advances, 'trip')} ${byIssue.advances === 1 ? 'has' : 'have'} advances that disagree.`);
  }
  const otherWeekTrips = proof ? proof.trips.length - inWeek.length : 0;
  if (otherWeekTrips > 0) lines.push(`${plural(otherWeekTrips, 'trip')} in the file ${otherWeekTrips === 1 ? 'belongs' : 'belong'} to other weeks and ${otherWeekTrips === 1 ? 'is' : 'are'} not counted here.`);

  if (outcome) {
    const added = outcome.inserted + outcome.updated;
    lines.push(added > 0 ? `${plural(outcome.inserted, 'expense line')} added${outcome.updated > 0 ? `, ${outcome.updated} updated` : ''}.` : 'No expense lines were added.');
    if (outcome.skipped > 0) lines.push(`${plural(outcome.skipped, 'line')} ${outcome.skipped === 1 ? 'was' : 'were'} left out (not ticked, or no usable date).`);
  }

  return {
    frame,
    proved,
    trips: inWeek.length,
    proven,
    open: openTrips.length,
    byIssue,
    advanceOnly: inWeek.filter((t) => t.advanceOnly).length,
    issues: openTrips.map((t) => ({ trip: t.trip, lane: t.meta.lane, issues: t.issues, detail: issueDetail(t) })),
    otherWeekTrips,
    outcome,
    lines,
    clean: proved && inWeek.length > 0 && openTrips.length === 0 && (outcome?.skipped ?? 0) === 0,
  };
}
