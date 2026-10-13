/**
 * Says what a line from a Landstar file really is, from its description. Landstar's files mix three
 * things that look alike: charges to you, early access to money (advances), and revenue lines that
 * were reversed and reissued when a freight bill was revised. Only the first are costs.
 */

export type LineGroup = 'advance' | 'cost' | 'credit';

export type LineVerdict =
  /** Not a cost: leave it out, or archive it if it was already imported. */
  | { action: 'skip'; group: 'total' | 'reversal'; reason: string }
  /** A real line, filed under the wrong type. */
  | { action: 'retype'; toType: string; group: LineGroup; reason: string };

// Revenue lines. When a freight bill is revised Landstar reverses the old line and issues a new one;
// the reversal is not a cost, and the loads already carry the final settled amounts.
const REVENUE_LINE_PATTERNS: RegExp[] = [
  /^updtd\s*fb\s*from\s*agency$/i,
  /^update\s*detention$/i,
  /^fuel\s*surcharge$/i,
  /^tractor\s*(l\/h|line\s*haul)$/i,
  /^line\s*haul$/i,
  /^stop[\s-]*offs?$/i,
  /^detention(\s+at\s+\w+)?$/i,
  /^layover$/i,
  /^additional\s*pt\s*to\s*truck$/i,
  /^unloading$/i,
  /^loading$/i,
  /^lumper\s*charge$/i,
  /^just\s*in\s*time$/i,
  /^new\s*york\s*arbitrary$/i,
  /^tractor\s*percent\s*over\s*con/i,
  /^percent\s*over\s*contract$/i,
  /^blankets?,?\s*straps?,?\s*and\s*pa/i,
  /^deadhead$/i,
];

const RULES: Array<{ pattern: RegExp; toType: string; group: LineGroup; reason: string }> = [
  // Interest Landstar pays you on your escrow comes back as money, and offsets the advance interest it charges.
  { pattern: /escrow\s*int(erest)?\s*pay/i, toType: 'Reimbursement', group: 'credit', reason: 'Interest paid to you on your escrow: money coming back, not a cost.' },
  { pattern: /cont\.?\s*spec\s*adv|partial\s*final\s*s(ett|t)|card\s*contractor\s*pay|card\s*pre-trip/i, toType: 'Advance', group: 'advance', reason: 'An advance: early access to your money, not a cost.' },
  // Landstar's "TOLL CHARGES" are charges to you (code B), not reversed revenue: the weekly proof showed it.
  { pattern: /^bp\s+\S+|masspike|deldot|\be-?z\s*pass\b|^toll\s*charges$/i, toType: 'Tolls', group: 'cost', reason: 'A toll.' },
  { pattern: /fuel\s*tax/i, toType: 'IFTA', group: 'cost', reason: 'Monthly fuel tax.' },
  { pattern: /eobr|airtime/i, toType: 'LCN/Satellite', group: 'cost', reason: 'ELD airtime.' },
  { pattern: /\bplates?\b/i, toType: 'Registration/Plates', group: 'cost', reason: 'Plates.' },
  { pattern: /renewal/i, toType: 'Licensing/Permits', group: 'cost', reason: 'A renewal fee.' },
  { pattern: /mileage\s*tax|ad\s*valorem/i, toType: 'Taxes', group: 'cost', reason: 'A mileage or ad valorem tax.' },
  { pattern: /loan\s*interest|adv\s*int\s*ded/i, toType: 'Interest', group: 'cost', reason: 'Loan interest.' },
  { pattern: /tire\s*purchase/i, toType: 'Maintenance', group: 'cost', reason: 'Tires.' },
  { pattern: /(rpr|repair|redfile|oper\s*exp).*\b(ln|loan)\b/i, toType: 'Maintenance', group: 'cost', reason: 'A repair paid for with a Landstar loan. The repair is the cost, so it counts.' },
  { pattern: /comchek\s*(contr\s*backchg|fee)/i, toType: 'Card Fee', group: 'cost', reason: 'A card fee.' },
];

export function classifyStatementLine(description: string | null | undefined): LineVerdict | null {
  const text = String(description ?? '').trim();
  if (!text) return null;
  if (/^total$/i.test(text)) return { action: 'skip', group: 'total', reason: 'A statement total, not a charge.' };
  if (REVENUE_LINE_PATTERNS.some((p) => p.test(text))) {
    return { action: 'skip', group: 'reversal', reason: 'A revenue line reversed when the freight bill was revised. Your loads already carry the settled amounts.' };
  }
  const rule = RULES.find((r) => r.pattern.test(text));
  return rule ? { action: 'retype', toType: rule.toType, group: rule.group, reason: rule.reason } : null;
}
