import jsPDF from 'jspdf';
import type { W2Data } from '@/lib/tax/reports';
import { formatDateLong, quarterDue } from '@/lib/tax/dates';

/**
 * Substitute Form W-2 employee copies for tax year 2026, built to IRS Publication 1141 (Rev. 08-2026, section 2.3):
 * white paper, black ink, boxes 1 to 6 in the upper right at least 1 1/8 by 1/4 inch, the boxes and titles of the official
 * form, the form title, tax year, "Department of the Treasury--Internal Revenue Service", the copy description, boxes 1 and 2
 * of Copy B outlined in bold, the Copy C notice, and instructions to the employee. Each copy is its own page so it is easy to
 * separate.
 *
 * These are for the EMPLOYEE (and the employer's own file). Copy A, the copy filed with the Social Security
 * Administration, can not be printed from plain paper. It must be filed electronically (SSA Business Services Online) or on
 * the official red-ink form.
 */

export interface EmployerBlock {
  name: string | null;
  ein: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface W2PdfInput {
  year: number;
  employer: EmployerBlock;
  w2: W2Data;
  /** Employer state ID numbers (box 15), by state code. */
  stateIds?: Record<string, string>;
  /** Full SSN, only when the person printing is allowed to see it; otherwise the last four digits are printed. */
  ssnFull?: string | null;
  /** Anything the employer wants to tell the employee in box 14a, each item labeled. */
  box14a?: Array<{ label: string; amount: number }>;
  /** Include Copy D, the employer's own file copy. */
  includeEmployerCopy?: boolean;
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function maskedSsn(full: string | null | undefined, last4: string | null | undefined): string {
  const digits = (full ?? '').replace(/\D/g, '');
  if (digits.length === 9) return `***-**-${digits.slice(5)}`;
  return last4 ? `***-**-${last4}` : '';
}

export function formatSsn(full: string | null | undefined): string {
  const d = (full ?? '').replace(/\D/g, '');
  return d.length === 9 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : '';
}

const NOTICE_TO_EMPLOYEE = [
  ['Do you have to file?', 'Refer to the Form 1040 instructions to determine if you are required to file a tax return. Even if you don\'t have to file a tax return, you may be eligible for a refund if box 2 shows an amount or if you are eligible for any credit.'],
  ['Earned income tax credit (EITC).', 'You may be able to take the EITC for 2026 if your adjusted gross income (AGI) is less than a certain amount. The amount of the credit is based on income and family size. Workers without children could qualify for a smaller credit. You and any qualifying children must have valid social security numbers (SSNs). You can\'t take the EITC if your investment income is more than the specified amount for 2026 or if income is earned for services provided while you were an inmate at a penal institution. For 2026 income limits and more information, visit www.irs.gov/EITC. See also Pub. 596. Any EITC that is more than your tax liability is refunded to you, but only if you file a tax return.'],
  ['Employee\'s social security number (SSN).', 'For your protection, this form may show only the last four digits of your SSN. However, your employer has reported your complete SSN to the IRS and the Social Security Administration (SSA).'],
  ['Corrections.', 'If your name, SSN, or address is incorrect, correct Copies B, C, and 2 and ask your employer to correct your employment record. Be sure to ask the employer to file Form W-2c, Corrected Wage and Tax Statement, with the SSA to correct any name, SSN, or money amount error reported to the SSA on Form W-2. Be sure to get your copies of Form W-2c from your employer for all corrections made so you may file them with your tax return. If your name and SSN are correct but aren\'t the same as shown on your social security card, you should ask for a new card that displays your correct name at any SSA office or by calling 800-772-1213. You may also visit the SSA website at www.SSA.gov.'],
  ['Credit for excess taxes.', 'If you had more than one employer in 2026 and more than $11,439.00 in social security taxes were withheld, you may be able to claim a credit for the excess against your federal income tax. See the Form 1040 instructions.'],
];

const INSTRUCTIONS_FOR_EMPLOYEE = [
  ['Box 1.', 'Enter this amount on the wages line of your tax return unless those instructions direct you to report it elsewhere.'],
  ['Box 2.', 'Enter this amount on the federal income tax withheld line of your tax return.'],
  ['Box 5.', 'You may be required to report this amount on Form 8959. See the Form 1040 instructions to determine if you are required to complete Form 8959.'],
  ['Box 6.', 'This amount includes the 1.45% Medicare tax withheld on all Medicare wages and tips shown in box 5, as well as the 0.9% Additional Medicare Tax on any of those Medicare wages and tips above $200,000.'],
  ['Boxes 15 to 17.', 'State and local information. Use these amounts when you file a state, city or local income tax return (Copy 2).'],
  ['Note.', 'Boxes that are blank do not apply to you. Reimbursements your employer paid you for business expenses under an accountable plan are not wages and are not shown on this form.'],
];

type Copy = { key: 'B' | 'C' | '2' | 'D'; label: string; sub?: string };

const COPIES: Copy[] = [
  { key: 'B', label: 'Copy B--To Be Filed With Employee\'s FEDERAL Tax Return.', sub: 'This information is being furnished to the Internal Revenue Service.' },
  { key: 'C', label: 'Copy C--For EMPLOYEE\'S RECORDS', sub: '(See Notice to Employee on the back of Copy B.)' },
  { key: '2', label: 'Copy 2--To Be Filed With Employee\'s State, City, or Local Income Tax Return.' },
  { key: 'D', label: 'Copy D--For EMPLOYER.' },
];

export function generateW2Pdf(input: W2PdfInput): Blob {
  const { year, w2 } = input;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const hasState = w2.states.length > 0;
  const copies = COPIES.filter((c) => (c.key === '2' ? hasState : c.key === 'D' ? input.includeEmployerCopy !== false : true));

  copies.forEach((copy, i) => {
    if (i > 0) doc.addPage();
    drawFront(doc, copy, input);
    if (copy.key === 'B' || copy.key === 'C' || copy.key === '2') {
      doc.addPage();
      drawBack(doc, copy, year);
    }
  });
  return doc.output('blob');
}

function drawFront(doc: jsPDF, copy: Copy, input: W2PdfInput) {
  const { year, employer, w2 } = input;
  const X = 36;
  const Y = 64;
  const W = 540;
  const labelSize = 6.5;
  const valueSize = 10.5;

  doc.setTextColor(0);
  doc.setDrawColor(0);

  // Copy description at the top (Pub 1141 allows it at the top; the title and year are repeated below).
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(copy.label, X, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (copy.sub) doc.text(copy.sub, X, 48);
  if (copy.key === 'C') {
    doc.setFontSize(7);
    const note = doc.splitTextToSize('This information is being furnished to the Internal Revenue Service. If you are required to file a tax return, a negligence penalty or other sanction may be imposed on you if this income is taxable and you fail to report it.', 280);
    doc.text(note, X + 250, 36);
  }

  const box = (x: number, y: number, w: number, h: number, label: string, value = '', opts: { bold?: boolean; align?: 'left' | 'right' } = {}) => {
    doc.setLineWidth(opts.bold ? 2 : 0.6);
    doc.rect(X + x, Y + y, w, h);
    doc.setLineWidth(0.6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(labelSize);
    doc.text(label, X + x + 3, Y + y + 8);
    if (value) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(valueSize);
      if (opts.align === 'right') doc.text(value, X + x + w - 5, Y + y + h - 6, { align: 'right' });
      else doc.text(value, X + x + 4, Y + y + h - 6);
    }
  };
  const lines = (x: number, y: number, w: number, label: string, rows: string[]) => {
    doc.rect(X + x, Y + y, w, 0); // no-op keeps style stable
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(labelSize);
    doc.text(label, X + x + 3, Y + y + 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(valueSize - 0.5);
    rows.filter(Boolean).forEach((r, idx) => doc.text(r, X + x + 4, Y + y + 20 + idx * 12));
  };

  const L = 262; // left column width
  const R = W - L; // right area
  const half = R / 2;
  const row = 30;
  const bold = copy.key === 'B';

  // Left column.
  box(0, 0, L, row, 'a  Employee\'s social security number', maskedSsn(input.ssnFull, w2.payee.ssnLast4));
  box(0, row, L, row, 'b  Employer identification number (EIN)', employer.ein ?? '');
  box(0, row * 2, L, 70, 'c  Employer\'s name, address, and ZIP code');
  lines(0, row * 2, L, 'c  Employer\'s name, address, and ZIP code', [
    employer.name ?? '',
    employer.address_line1 ?? '',
    employer.address_line2 ?? '',
    [employer.city, [employer.state, employer.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  ]);
  box(0, row * 2 + 70, L, 38, 'e  Employee\'s first name and initial          Last name');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(valueSize);
  doc.text(`${w2.payee.firstName}   ${w2.payee.lastName}`.trim(), X + 4, Y + row * 2 + 70 + 30);
  box(0, row * 2 + 108, L, row * 8 + 44 - (row * 2 + 108), 'f  Employee\'s address and ZIP code');
  const addr = w2.payee.address ?? '';
  // "123 Main St, Dallas, TX 75001" prints as the street on one line and "Dallas, TX 75001" on the next.
  const cut = addr.indexOf(',');
  const addrLines = addr.includes('\n') ? addr.split('\n') : cut > 0 ? [addr.slice(0, cut), addr.slice(cut + 1).trim()] : [addr];
  addrLines.filter(Boolean).slice(0, 3).forEach((part, idx) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(valueSize - 1);
    doc.text(part, X + 4, Y + row * 2 + 108 + 22 + idx * 11);
  });

  // Right area: core boxes 1 to 6 (upper right, in order).
  box(L, 0, half, row, '1  Wages, tips, other compensation', money(w2.box1), { bold, align: 'right' });
  box(L + half, 0, half, row, '2  Federal income tax withheld', money(w2.box2), { bold, align: 'right' });
  box(L, row, half, row, '3  Social security wages', money(w2.box3), { align: 'right' });
  box(L + half, row, half, row, '4  Social security tax withheld', money(w2.box4), { align: 'right' });
  box(L, row * 2, half, row, '5  Medicare wages and tips', money(w2.box5), { align: 'right' });
  box(L + half, row * 2, half, row, '6  Medicare tax withheld', money(w2.box6), { align: 'right' });
  box(L, row * 3, half, row, '7  Social security tips');
  box(L + half, row * 3, half, row, '8  Allocated tips');
  box(L, row * 4, half, row, '9');
  box(L + half, row * 4, half, row, '10  Dependent care benefits');
  box(L, row * 5, half, row, '11  Nonqualified plans');
  box(L + half, row * 5, half, row, '12a  See instructions for box 12');
  // Box 13 with its three checkboxes.
  const h13 = 44; // box 13 carries three labeled check boxes, so it is taller than the others
  box(L, row * 6, half, h13, '13');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  ['Statutory employee', 'Retirement plan', 'Third-party sick pay'].forEach((t, idx) => {
    const cx = X + L + 8 + idx * 46;
    doc.rect(cx, Y + row * 6 + 13, 7, 7);
    doc.text(t, cx - 2, Y + row * 6 + 29, { maxWidth: 44 });
  });
  box(L + half, row * 6, half, h13, '12b');
  const info = (input.box14a ?? []).map((e) => `${e.label} ${money(e.amount)}`);
  const y14 = row * 6 + h13;
  box(L, y14, half, row, '14a  Other');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  info.slice(0, 2).forEach((t, idx) => doc.text(t, X + L + 4, Y + y14 + 18 + idx * 9));
  box(L + half, y14, half, row, '12c');
  box(L, y14 + row, half, row, '14b  Treasury Tipped Occupation Code(s)');
  box(L + half, y14 + row, half, row, '12d');

  // State and local row.
  const sy = y14 + row * 2 + 4;
  const sh = 52;
  const cols = [
    { x: 0, w: 130, label: '15  State   Employer\'s state ID number' },
    { x: 130, w: 100, label: '16  State wages, tips, etc.' },
    { x: 230, w: 86, label: '17  State income tax' },
    { x: 316, w: 86, label: '18  Local wages, tips, etc.' },
    { x: 402, w: 66, label: '19  Local income tax' },
    { x: 468, w: 72, label: '20  Locality name' },
  ];
  cols.forEach((c) => box(c.x, sy, c.w, sh, c.label));
  w2.states.slice(0, 2).forEach((s, idx) => {
    const ty = Y + sy + 22 + idx * 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(valueSize - 0.5);
    doc.text(`${s.code}  ${input.stateIds?.[s.code] ?? ''}`.trim(), X + 4, ty);
    doc.text(money(s.wages), X + 130 + 100 - 5, ty, { align: 'right' });
    doc.text(money(s.tax), X + 230 + 86 - 5, ty, { align: 'right' });
  });

  // Title block under the form: form number and title, tax year, and the agency.
  const ty = Y + sy + sh + 22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Form W-2   Wage and Tax Statement', X, ty);
  doc.setFontSize(22);
  doc.text(String(year), X + 270, ty + 2, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Department of the Treasury--Internal Revenue Service', X + W, ty, { align: 'right' });
  doc.setFontSize(7);
  doc.text(copy.label, X, ty + 12);

  // Notes that help the reader but are not part of the form.
  let ny = ty + 40;
  doc.setFontSize(8);
  if (copy.key === 'D') {
    doc.setFont('helvetica', 'bold');
    doc.text('Employer\'s file copy', X, ny);
    doc.setFont('helvetica', 'normal');
    ny += 12;
    const note = doc.splitTextToSize(`Keep this with the payroll records for at least four years after the tax is due or paid. Pay records counted: ${w2.recordCount}.${w2.reimbursementsExcluded > 0 ? ` Accountable-plan reimbursements of $${money(w2.reimbursementsExcluded)} were paid and are correctly not included in box 1.` : ''}${w2.stateProgramsWithheld > 0 ? ` State paid-leave and long-term-care contributions withheld after tax: $${money(w2.stateProgramsWithheld)} (included in wages, not deducted from them).` : ''}`, W);
    doc.text(note, X, ny);
  }
}

function drawBack(doc: jsPDF, copy: Copy, year: number) {
  const X = 48;
  const W = 516;
  let y = 56;
  doc.setTextColor(0);
  const isB = copy.key === 'B';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(isB ? 'Notice to Employee' : 'Instructions for Employee', X, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(isB ? '(Back of Copy B)' : `(Back of Copy ${copy.key}. See also Notice to Employee on the back of Copy B.)`, X, y + 8);
  y += 28;
  doc.setFontSize(9);
  const items = isB ? NOTICE_TO_EMPLOYEE : INSTRUCTIONS_FOR_EMPLOYEE;
  for (const [head, body] of items) {
    doc.setFont('helvetica', 'bold');
    doc.text(head, X, y);
    y += 11;
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(body, W);
    doc.text(wrapped, X, y);
    y += wrapped.length * 11 + 8;
  }
  doc.setFontSize(7.5);
  doc.text(`Form W-2 (${year}). For the latest information about Form W-2, go to www.irs.gov/FormW2.`, X, 740);
}

// ---------------------------------------------------------------------------------------------------------------
// Filing sheet: every box in the order SSA Business Services Online asks for it, plus the W-3 totals.
// ---------------------------------------------------------------------------------------------------------------

export interface FilingSheetInput {
  year: number;
  employer: EmployerBlock;
  forms: Array<{ w2: W2Data; ssnFull: string | null; stateIds?: Record<string, string> }>;
  stateIds?: Record<string, string>;
}

/**
 * A worksheet for typing the W-2s into SSA's free "W-2 Online" tool (up to 50 forms at a time) and for checking the W-3 that
 * the tool builds. It carries full Social Security numbers, so it is for the person filing only and should be shredded after use.
 */
export function generateFilingSheetPdf(input: FilingSheetInput): Blob {
  const { year, employer, forms } = input;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const M = 48;
  let y = 56;
  const line = (text: string, size = 9, bold = false) => {
    if (y > 740) { doc.addPage(); y = 56; }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(text, M, y);
    y += size + 4;
  };

  line(`W-2 filing worksheet, tax year ${year}`, 15, true);
  line('Contains full Social Security numbers. For the person filing only. Shred after use.', 9);
  line(`Employer: ${employer.name ?? ''}   EIN ${employer.ein ?? ''}`, 9);
  line(`${employer.address_line1 ?? ''} ${employer.address_line2 ?? ''}, ${employer.city ?? ''}, ${employer.state ?? ''} ${employer.zip ?? ''}`, 9);
  line(`File with the SSA by ${formatDateLong(quarterDue(year, 4))}. E-file at www.ssa.gov/bso (free W-2 Online for up to 50 forms; 10 or more W-2s must be filed electronically).`, 8);
  y += 8;

  const total = { n: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 };
  forms.forEach(({ w2, ssnFull, stateIds }, idx) => {
    if (y > 620) { doc.addPage(); y = 56; }
    doc.setDrawColor(150);
    doc.line(M, y - 6, 564, y - 6);
    line(`${idx + 1}. ${w2.payee.firstName} ${w2.payee.lastName}`, 11, true);
    line(`a  SSN ${formatSsn(ssnFull) || 'MISSING'}      e  Name ${w2.payee.firstName} ${w2.payee.lastName}`);
    line(`f  Address ${w2.payee.address ?? 'MISSING'}`);
    line(`1  Wages ${money(w2.box1)}     2  Federal tax withheld ${money(w2.box2)}`);
    line(`3  Social security wages ${money(w2.box3)}     4  Social security tax ${money(w2.box4)}`);
    line(`5  Medicare wages ${money(w2.box5)}     6  Medicare tax ${money(w2.box6)}`);
    if (w2.states.length === 0) line('15 to 17  State: none (no state income tax withheld for this employee)');
    w2.states.forEach((s) => line(`15  State ${s.code}  ID ${stateIds?.[s.code] ?? input.stateIds?.[s.code] ?? 'MISSING'}     16  State wages ${money(s.wages)}     17  State income tax ${money(s.tax)}`));
    y += 6;
    total.n += 1; total.b1 += w2.box1; total.b2 += w2.box2; total.b3 += w2.box3; total.b4 += w2.box4; total.b5 += w2.box5; total.b6 += w2.box6;
  });

  if (y > 600) { doc.addPage(); y = 56; }
  doc.line(M, y - 6, 564, y - 6);
  line('Form W-3 totals (the SSA tool builds the W-3 itself; these are for checking it)', 11, true);
  line(`Kind of payer: 941      Number of Forms W-2: ${total.n}`);
  line(`1  Wages ${money(total.b1)}     2  Federal tax withheld ${money(total.b2)}`);
  line(`3  Social security wages ${money(total.b3)}     4  Social security tax ${money(total.b4)}`);
  line(`5  Medicare wages ${money(total.b5)}     6  Medicare tax ${money(total.b6)}`);
  y += 6;
  line('These totals must match the four Forms 941 for the year: wages, income tax withheld, and the social security and Medicare tax.', 8);
  return doc.output('blob');
}
