import { format, parseISO } from 'date-fns';
import { periodEndOnOrAfter, type WeekDay } from '@/lib/settlement-week';
import type { TripProof } from '@/lib/weekly-proof';

/**
 * Where one load stands against what Landstar actually paid. A load is only "proven" once its trip has been checked
 * against Landstar's Freight Bill Details (that file is not stored), so without a check the honest answers are
 * "open issues" (statement import logged a disagreement), "not delivered yet", "issues resolved" or "not proved yet".
 */

export interface LoadDiscrepancy {
  id: string;
  reason_code: string;
  expected_amount: number;
  actual_amount: number;
  delta_amount: number;
  detail: string | null;
  resolved_at: string | null;
}

export type LoadProofState = 'proven' | 'open' | 'resolved' | 'not_delivered' | 'not_proved';

export interface LoadProofIssue {
  /** Short plain-English headline. */
  title: string;
  /** What disagrees, with both amounts when they are known. */
  detail: string;
}

export interface LoadProofStatus {
  state: LoadProofState;
  headline: string;
  note: string;
  issues: LoadProofIssue[];
}

const usd = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function reasonTitle(code: string): string {
  switch (code) {
    case 'trip_rate_mismatch': return 'Revenue does not match Landstar';
    case 'no_load_match': return 'Trip not found in your loads';
    case 'period_total_mismatch': return 'Pay-cycle total does not match';
    default: return code.replace(/_/g, ' ');
  }
}

/** A discrepancy the statement import logged, in words. */
export function discrepancyIssue(d: LoadDiscrepancy): LoadProofIssue {
  const parts = [`Expected ${usd(Number(d.expected_amount))}, Landstar ${usd(Number(d.actual_amount))}`];
  const delta = Number(d.delta_amount);
  if (delta) parts.push(`difference ${delta > 0 ? '+' : '−'}${usd(Math.abs(delta))}`);
  return { title: reasonTitle(d.reason_code), detail: `${parts.join(', ')}.` };
}

/** A weekly-proof trip's open issues, in words, with Landstar's amount against yours. */
export function tripIssues(t: TripProof): LoadProofIssue[] {
  const out: LoadProofIssue[] = [];
  if (t.issues.includes('missing_load')) out.push({ title: 'Settled by Landstar but not in your loads', detail: 'Add the load so its revenue is counted.' });
  if (t.issues.includes('revenue')) out.push({ title: 'Revenue does not match', detail: `Landstar paid ${usd(t.landstar.revenue)}, your load shows ${usd(t.app.revenue)}.` });
  if (t.issues.includes('charges')) out.push({ title: 'Charges do not match', detail: `Landstar took ${usd(t.landstar.charges)}, you have ${usd(t.app.charges)}.` });
  if (t.issues.includes('advances')) out.push({ title: 'Advances do not match', detail: `Landstar advanced ${usd(t.landstar.advances)}, you have ${usd(t.app.advances)}.` });
  return out;
}

interface StatusInput {
  status: string | null;
  discrepancies: LoadDiscrepancy[];
  /** The load's own flag from the statement import. */
  hasStatementDiscrepancy?: boolean;
  /** Result of checking this trip against a Freight Bill Details file just now, or null if not checked. */
  checked?: { found: boolean; trip: TripProof | null } | null;
}

export function loadProofStatus(input: StatusInput): LoadProofStatus {
  const { checked } = input;
  if (checked) {
    if (!checked.found || !checked.trip) {
      return { state: 'not_proved', headline: 'Not in that file', note: 'This trip has no lines in the Freight Bill Details you chose. Pick the file for the week Landstar settled it.', issues: [] };
    }
    const issues = tripIssues(checked.trip);
    if (issues.length === 0) {
      return { state: 'proven', headline: 'Proven: matches Landstar to the cent', note: 'Revenue, charges and advances all agree with the Freight Bill Details you checked.', issues: [] };
    }
    return { state: 'open', headline: `${issues.length} thing${issues.length === 1 ? '' : 's'} to fix`, note: 'Compared with the Freight Bill Details you chose.', issues };
  }

  const open = input.discrepancies.filter((d) => !d.resolved_at);
  if (open.length > 0) {
    return { state: 'open', headline: `${open.length} open issue${open.length === 1 ? '' : 's'} from the statement import`, note: 'Logged when the weekly statement was imported.', issues: open.map(discrepancyIssue) };
  }
  if (input.hasStatementDiscrepancy) {
    return { state: 'open', headline: 'Flagged by the statement import', note: 'The import marked this load as disagreeing with Landstar. Prove the week to see the amounts.', issues: [] };
  }
  if (input.status && !['delivered', 'invoiced', 'paid'].includes(input.status)) {
    return { state: 'not_delivered', headline: 'Not delivered yet', note: 'Landstar settles a load after it is delivered, so there is nothing to prove yet.', issues: [] };
  }
  if (input.discrepancies.length > 0) {
    return { state: 'resolved', headline: 'Earlier issues resolved', note: 'Every issue the statement import logged for this load was marked resolved. It has not been re-checked against a Freight Bill file.', issues: [] };
  }
  return { state: 'not_proved', headline: 'Not in a proved week yet', note: 'No statement import has flagged this load, and it has not been checked against Landstar’s Freight Bill Details.', issues: [] };
}

/** The settlement week a delivered load belongs to: the period-ending day on or after its delivery date. */
export function deliveryWeekEnd(deliveryDate: string | null | undefined, weekEndDay: WeekDay): string | null {
  if (!deliveryDate) return null;
  try {
    return format(periodEndOnOrAfter(parseISO(deliveryDate), weekEndDay), 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

/** Where the "Prove this week" button goes: the Settlement tab with the prove window open on this load's week. */
export function proveWeekPath(weekEndIso: string | null): string {
  const base = '/finance?view=settlement&prove=1';
  return weekEndIso ? `${base}&weekEnd=${weekEndIso}` : base;
}
