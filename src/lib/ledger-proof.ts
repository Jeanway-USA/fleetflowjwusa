import { roundCents } from '@/lib/revenue-calculator';

/**
 * Landstar's year-to-date Settlement Details export lists every line of money that moved in a settlement, so its
 * total is the year's Settled Amt. This sorts those lines into plain categories and sets each one beside what the
 * app holds for the same category, so any difference points at the lines behind it.
 */

export interface LedgerLine {
  description: string;
  trip: string | null;
  /** As Landstar signs it: money to you is positive, money taken is negative. */
  amount: number;
}

export type LedgerKind = 'revenue' | 'advance' | 'cost' | 'cash';

export interface LedgerCategory {
  key: string;
  label: string;
  kind: LedgerKind;
  /** Where the money goes: costs and advances are things the app records; cash items are not profit and are not recorded. */
  note?: string;
}

const C = (key: string, label: string, kind: LedgerKind, note?: string): LedgerCategory => ({ key, label, kind, note });

export const CATEGORIES = {
  revenue: C('revenue', 'Trip revenue', 'revenue', 'Linehaul, fuel surcharge and accessorials, with their reversals'),
  safety: C('safety', 'Safety program', 'revenue', 'Counts as 1099 revenue'),
  advances: C('advances', 'Card advances', 'advance', 'Pre-trip and special advances loaded on your fuel card'),
  cardFees: C('cardFees', 'Card fees', 'cost'),
  scanning: C('scanning', 'Trip scanning', 'cost'),
  depositFees: C('depositFees', 'Direct-deposit fees', 'cost'),
  insurance: C('insurance', 'Insurance', 'cost'),
  cpp: C('cpp', 'CPP and benefits', 'cost'),
  warranty: C('warranty', 'Truck warranty', 'cost'),
  tolls: C('tolls', 'Tolls', 'cost'),
  taxes: C('taxes', 'Mileage and ad valorem taxes', 'cost'),
  fuelTax: C('fuelTax', 'Fuel tax', 'cost'),
  permits: C('permits', 'Plates, permits and renewals', 'cost'),
  satellite: C('satellite', 'Satellite, ELD and PrePass', 'cost'),
  interest: C('interest', 'Interest', 'cost', 'Charged on advances and loans, less interest paid to you'),
  repairLoans: C('repairLoans', 'Repair loan payments', 'cost', 'Installments on loans that paid for repairs'),
  tires: C('tires', 'Tires', 'cost'),
  weekly: C('weekly', 'Other weekly deduction', 'cost'),
  escrowIn: C('escrowIn', 'Escrow held back', 'cash', 'Your money set aside by Landstar; not a cost'),
  escrowOut: C('escrowOut', 'Escrow returned to you', 'cash', 'Money released from escrow; not income'),
  loanProceeds: C('loanProceeds', 'Loan money paid out', 'cash', 'Borrowed money that paid for repairs; not income'),
  refunds: C('refunds', 'Refunds and credits', 'cash'),
  other: C('other', 'Not recognized', 'cost'),
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

type Rule = [RegExp, CategoryKey, ((amount: number) => boolean)?];
const negative = (a: number) => a < 0;
const positive = (a: number) => a > 0;

// Order matters: the first rule that matches wins.
const RULES: Rule[] = [
  [/120\s*day\s*safety/i, 'safety'],
  [/escrow\s*int(erest)?\s*pay/i, 'interest'],
  [/adv\w*\s*int\w*\s*ded|loan\s*interest/i, 'interest'],
  [/reimb\s*voluntary\s*escrow/i, 'escrowOut'],
  [/trip%?\s*escrow/i, 'escrowIn'],
  [/set\s*up\s.*loan/i, 'loanProceeds'],
  [/(repair|rpr|redfile|combo|oper\s*exp).*\b(ln|loan)\b/i, 'loanProceeds', positive],
  [/(repair|rpr|redfile|combo|oper\s*exp).*\b(ln|loan)\b/i, 'repairLoans'],
  [/^(ua|void)\s*card\s*fee|^card\s*fee|comchek\s*fee|comchek\s*contr\s*backchg/i, 'cardFees'],
  [/^(ua|void)\s*card\s*pre-?trip|card\s*pre-?trip|partial\s*final|cont\.?\s*spec\s*adv|card\s*contractor\s*pay/i, 'advances'],
  [/trkstp\s*scn/i, 'scanning'],
  [/dd\s*fee|direct-?\s*deposit\s*fee/i, 'depositFees'],
  [/unladen|liability/i, 'insurance'],
  [/\/cpp/i, 'cpp'],
  [/warranty/i, 'warranty'],
  [/^bp\s+\S+|masspike|deldot|toll\s*charges/i, 'tolls'],
  [/mileage\s*tax|ad\s*valorem/i, 'taxes'],
  [/fuel\s*tax/i, 'fuelTax'],
  [/plates?\b|permits?\b|renewal/i, 'permits'],
  [/lcn\s*fees|eobr|airtime|prepass|satellite\s*motor/i, 'satellite', negative],
  [/tire\s*purchase/i, 'tires'],
  [/c#?-?\d+-\d+-iw/i, 'weekly'],
  // Landstar counts the satellite surveillance credit in the 1099 revenue it prints.
  [/satellite\s*motor/i, 'revenue', positive],
  [/^ref\s*#|^ref#|ga\s*mar\s*credit/i, 'refunds', positive],
  [/trk\s*payment\s*ln/i, 'weekly'],
  // Revenue lines, last so that a word like "loading" inside a charge name never wins.
  [/^(tractor\s*(l\/h|line\s*haul|percent\s*over)|fuel\s*surcharge|stop[\s-]*offs?|detention|layover|loading|unloading|additional\s*pt|percent\s*over|updtd\s*fb|update\s*(detention|fsc)|just\s*in\s*time|lumper\s*charge|new\s*york\s*arbitrary|blankets|deadhead|service\s*incentive)/i, 'revenue'],
];

export function categorize(description: string, amount: number): LedgerCategory {
  const text = description.trim();
  for (const [pattern, key, when] of RULES) {
    if (pattern.test(text) && (!when || when(amount))) return CATEGORIES[key];
  }
  return CATEGORIES.other;
}

/** The same sorting for an expense the app holds, falling back to its type when its wording says nothing. */
const TYPE_FALLBACK: Record<string, CategoryKey> = {
  'Card Fee': 'cardFees',
  'Trip Scanning': 'scanning',
  'Direct Deposit Fee': 'depositFees',
  Insurance: 'insurance',
  'CPP/Benefits': 'cpp',
  'Truck Warranty': 'warranty',
  Tolls: 'tolls',
  Taxes: 'taxes',
  IFTA: 'fuelTax',
  'Registration/Plates': 'permits',
  'Licensing/Permits': 'permits',
  'LCN/Satellite': 'satellite',
  'PrePass/Scale': 'satellite',
  Interest: 'interest',
  Maintenance: 'repairLoans',
  Advance: 'advances',
  Misc: 'other',
};

/** Types the app records that are not Landstar settlement lines at all: the card's own spending and its cash moves. */
const NOT_SETTLEMENT_TYPES = new Set(['Fuel', 'DEF', 'Fuel Discount', 'Direct Deposit', 'Cash Advance', 'Card Load']);

export interface AppExpenseRow {
  expense_type: string;
  amount: number | string | null;
  description?: string | null;
}

export function categorizeApp(e: AppExpenseRow): LedgerCategory | null {
  if (NOT_SETTLEMENT_TYPES.has(e.expense_type)) return null;
  // The card charges $1 each time it moves money to the bank; Landstar's settlement does not list it.
  if (e.expense_type === 'Direct Deposit Fee' && /^direct-?\s*deposit fee\s*$/i.test((e.description ?? '').trim())) return null;
  // Scale tickets paid with the fuel card are card spending, not a settlement deduction like PrePass.
  if (/^cat\s*scale\b/i.test((e.description ?? '').trim())) return null;
  const amount = e.expense_type === 'Reimbursement' ? -Math.abs(Number(e.amount) || 0) : Math.abs(Number(e.amount) || 0);
  const byWords = e.description ? categorize(e.description, -Math.abs(amount)) : CATEGORIES.other;
  if (byWords.key !== 'other') return byWords;
  const key = TYPE_FALLBACK[e.expense_type];
  return key ? CATEGORIES[key] : null;
}

export interface LedgerRow {
  category: LedgerCategory;
  /** What Landstar's lines add up to in this category, as money taken (a cost is positive, a credit negative). */
  landstar: number;
  lines: number;
  /** The same for the app; null where the app does not record this kind of money. */
  app: number | null;
  difference: number | null;
}

export interface LedgerResult {
  /** Every Settlement Details line added together: the year's Settled Amt. */
  settled: number;
  rows: LedgerRow[];
  /** Money to you from revenue lines, and from refunds and cash returned, and money taken. */
  totals: { revenue: number; moneyIn: number; moneyOut: number };
}

const COMPARED = new Set<LedgerKind>(['cost', 'advance']);

export function buildLedger(lines: LedgerLine[], appExpenses: AppExpenseRow[]): LedgerResult {
  const byKey = new Map<string, { category: LedgerCategory; total: number; count: number }>();
  let settled = 0;
  let revenue = 0;
  let moneyIn = 0;
  let moneyOut = 0;
  for (const line of lines) {
    settled += line.amount;
    const category = categorize(line.description, line.amount);
    const row = byKey.get(category.key) ?? { category, total: 0, count: 0 };
    row.total += line.amount;
    row.count += 1;
    byKey.set(category.key, row);
    if (category.kind === 'revenue') revenue += line.amount;
    else if (line.amount > 0) moneyIn += line.amount;
    else moneyOut += -line.amount;
  }

  const appByKey = new Map<string, number>();
  for (const e of appExpenses) {
    const category = categorizeApp(e);
    if (!category) continue;
    const sign = e.expense_type === 'Reimbursement' ? -1 : 1;
    appByKey.set(category.key, (appByKey.get(category.key) ?? 0) + sign * Math.abs(Number(e.amount) || 0));
  }

  const keys = new Set<string>([...byKey.keys(), ...[...appByKey.keys()]]);
  const rows: LedgerRow[] = [...keys]
    .map((key) => {
      const landstarRow = byKey.get(key);
      const category = landstarRow?.category ?? CATEGORIES[key as CategoryKey];
      const landstar = roundCents(-(landstarRow?.total ?? 0));
      const compared = COMPARED.has(category.kind);
      const app = compared ? roundCents(appByKey.get(key) ?? 0) : null;
      return { category, landstar, lines: landstarRow?.count ?? 0, app, difference: app === null ? null : roundCents(app - landstar) };
    })
    .sort((a, b) => Math.abs(b.landstar) - Math.abs(a.landstar));

  return { settled: roundCents(settled), rows, totals: { revenue: roundCents(revenue), moneyIn: roundCents(moneyIn), moneyOut: roundCents(moneyOut) } };
}
