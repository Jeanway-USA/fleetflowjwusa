/**
 * Direct deposit file in the standard bank format (NACHA ACH, "PPD" credits). Every record is exactly 94 characters and
 * the file is padded to a multiple of 10 lines. This is a pure module: no database, no browser.
 *
 * Banks differ in small ways (what goes in the origin field, whether they want an offsetting debit). The settings page
 * says which values to copy from the bank. A file that breaks a rule is refused here rather than rejected by the bank.
 */

export interface AchCompany {
  /** Shown to the person on their bank statement (up to 16 characters). */
  name: string;
  /** The 10-character company or originator ID the bank gave the company (often 1 + the EIN). */
  companyId: string;
  /** The bank's 9-digit routing number. */
  bankRouting: string;
  bankName: string;
  /**
   * The company's 9-digit tax ID (EIN). Truist wants the file header's origin to be a blank followed by this number. When it
   * is not given, the company ID is used there instead.
   */
  originId?: string;
}

export interface AchEntry {
  name: string;
  /** 9-digit routing number of the person's bank. */
  routing: string;
  account: string;
  accountType: 'checking' | 'savings';
  /** Whole cents. */
  amountCents: number;
  /** Shown on the file for tracing, up to 15 characters. */
  idNumber: string;
}

export interface AchFile {
  text: string;
  entryCount: number;
  totalCents: number;
  /** Lines in the file including padding. */
  lineCount: number;
}

/** A routing number is valid when its 9 digits pass the bank checksum (3-7-1 weights, total divisible by 10). */
export function routingValid(routing: string): boolean {
  if (!/^\d{9}$/.test(routing)) return false;
  const d = routing.split('').map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

/** Upper-case letters, digits and a few safe marks only, as the format requires. */
export function achText(s: string, length: number): string {
  const clean = String(s ?? '').toUpperCase().replace(/[^A-Z0-9 .,&'\-/#]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.slice(0, length).padEnd(length, ' ');
}

const num = (n: number, length: number) => String(Math.max(0, Math.round(n))).padStart(length, '0').slice(-length);
const yymmdd = (d: Date | string) => {
  const s = typeof d === 'string' ? d : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${s.slice(2, 4)}${s.slice(5, 7)}${s.slice(8, 10)}`;
};

/** Everything that would make the bank refuse the file, in plain words. Empty when the file is good. */
export function achProblems(company: AchCompany, entries: AchEntry[], effectiveDate: string, today?: string): string[] {
  const out: string[] = [];
  if (company.originId && !/^\d{9}$/.test(company.originId.replace(/\D/g, ''))) out.push('The company tax ID (EIN) must be 9 digits.');
  if (!company.name.trim()) out.push('Add the company name for the deposit file in Payroll settings.');
  if (!/^[A-Za-z0-9]{10}$/.test(company.companyId.trim())) out.push('The company ID for the deposit file must be 10 characters. Your bank gives you this.');
  if (!routingValid(company.bankRouting)) out.push('The bank routing number in Payroll settings is not a valid 9-digit routing number.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) out.push('Choose the date the money should arrive.');
  else {
    const day = new Date(`${effectiveDate}T00:00:00`).getDay();
    if (day === 0 || day === 6) out.push('The money can only arrive on a banking day. Choose a weekday.');
    if (today && effectiveDate < today) out.push('The arrival date has already passed. Choose today or a later banking day.');
  }
  if (entries.length === 0) out.push('There is nobody to pay by direct deposit.');
  for (const e of entries) {
    if (!routingValid(e.routing)) out.push(`${e.name}: the routing number is not valid.`);
    if (!/^\d{4,17}$/.test(e.account)) out.push(`${e.name}: the account number must be 4 to 17 digits.`);
    if (!(e.amountCents > 0)) out.push(`${e.name}: the amount must be more than zero.`);
    if (e.amountCents > 9999999999) out.push(`${e.name}: the amount is too large for one deposit.`);
  }
  return out;
}

/** Builds the file text. Throws with the problems if anything is wrong, so a bad file is never produced. */
export function buildAchFile(args: { company: AchCompany; entries: AchEntry[]; effectiveDate: string; createdAt?: Date; batchNumber?: number; entryDescription?: string; fileIdModifier?: string }): AchFile {
  const { company, entries, effectiveDate } = args;
  const createdAt = args.createdAt ?? new Date();
  const todayIso = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')}`;
  const problems = achProblems(company, entries, effectiveDate, todayIso);
  const modifier = (args.fileIdModifier ?? 'A').toUpperCase();
  if (!/^[A-Z0-9]$/.test(modifier)) problems.push('The file letter must be one letter or number.');
  if (problems.length > 0) throw new Error(problems.join(' '));
  const originDigits = (company.originId ?? '').replace(/\D/g, '');
  const origin = originDigits.length === 9 ? ` ${originDigits}` : company.companyId.trim().padStart(10, ' ').slice(0, 10);
  const odfi = company.bankRouting.slice(0, 8);
  const batchNo = num(args.batchNumber ?? 1, 7);
  const lines: string[] = [];

  // 1: file header. Destination is the bank; origin is the company.
  lines.push([
    '1', '01', ` ${company.bankRouting}`, origin,
    yymmdd(createdAt), `${String(createdAt.getHours()).padStart(2, '0')}${String(createdAt.getMinutes()).padStart(2, '0')}`,
    modifier, '094', '10', '1', achText(company.bankName, 23), achText(company.name, 23), ' '.repeat(8),
  ].join(''));

  // 5: batch header, credits only (service class 220).
  lines.push([
    '5', '220', achText(company.name, 16), ' '.repeat(20), company.companyId.trim().padStart(10, ' ').slice(0, 10), 'PPD',
    achText(args.entryDescription ?? 'PAYROLL', 10), ' '.repeat(6), yymmdd(effectiveDate), '   ', '1', odfi, batchNo,
  ].join(''));

  // 6: one entry per person.
  let hash = 0;
  let total = 0;
  entries.forEach((e, i) => {
    hash += Number(e.routing.slice(0, 8));
    total += e.amountCents;
    lines.push([
      '6', e.accountType === 'savings' ? '32' : '22', e.routing.slice(0, 8), e.routing[8], achText(e.account, 17), num(e.amountCents, 10),
      achText(e.idNumber, 15), achText(e.name, 22), '  ', '0', `${odfi}${num(i + 1, 7)}`,
    ].join(''));
  });
  const hash10 = num(hash % 10_000_000_000, 10);

  // 8: batch control.
  lines.push(['8', '220', num(entries.length, 6), hash10, num(0, 12), num(total, 12), company.companyId.trim().padStart(10, ' ').slice(0, 10), ' '.repeat(19), ' '.repeat(6), odfi, batchNo].join(''));

  // 9: file control, then padding lines of nines to fill the last block of 10.
  const blocks = Math.ceil((lines.length + 1) / 10);
  lines.push(['9', num(1, 6), num(blocks, 6), num(entries.length, 8), hash10, num(0, 12), num(total, 12), ' '.repeat(39)].join(''));
  while (lines.length % 10 !== 0) lines.push('9'.repeat(94));

  return { text: lines.join('\r\n') + '\r\n', entryCount: entries.length, totalCents: total, lineCount: lines.length };
}

// ---------------------------------------------------------------------------------------------------------------
// Check amounts in words
// ---------------------------------------------------------------------------------------------------------------

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} hundred`); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '')); } else if (n > 0) { parts.push(ONES[n]); }
  return parts.join(' ');
}

/** "1,234.50" as a check writes it: "One thousand two hundred thirty-four and 50/100". */
export function amountInWords(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100);
  let dollars = Math.floor(cents / 100);
  const c = cents % 100;
  const groups: Array<[number, string]> = [[1_000_000, ' million'], [1000, ' thousand']];
  const parts: string[] = [];
  for (const [size, name] of groups) {
    if (dollars >= size) { parts.push(below1000(Math.floor(dollars / size)) + name); dollars %= size; }
  }
  if (dollars > 0 || parts.length === 0) parts.push(dollars === 0 ? 'zero' : below1000(dollars));
  const words = parts.join(' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)} and ${String(c).padStart(2, '0')}/100`;
}
