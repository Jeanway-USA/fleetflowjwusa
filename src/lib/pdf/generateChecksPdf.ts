import jsPDF from 'jspdf';
import type { EmployerBlock } from '@/lib/pdf/generateW2Pdf';
import { amountInWords } from '@/lib/payroll/ach';

export interface CheckToPrint {
  number: number;
  payee: string;
  amount: number;
  /** The date written on the check. */
  date: string;
  memo: string;
  /** A line for each stub: what the check is for. */
  stubLines: Array<[string, string]>;
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const dateShort = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
const employerLines = (e: EmployerBlock) => [e.name ?? '', e.address_line1 ?? '', e.address_line2 ?? '', [e.city, [e.state, e.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean);

/**
 * One check per page on "check on top" stock (a letter page with the check in the top third and two stubs below).
 * The routing and account numbers along the bottom of a check are pre-printed on the stock, so none are printed here.
 * A page for a check that is not valid yet is not made: callers pass only approved payments.
 */
export function generateChecksPdf(checks: CheckToPrint[], employer: EmployerBlock): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const L = 54;
  const R = 612 - 54;
  checks.forEach((c, idx) => {
    if (idx > 0) doc.addPage();
    doc.setTextColor(0);

    // Check, top third.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    employerLines(employer).slice(0, 1).forEach((l) => doc.text(l, L, 62));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    employerLines(employer).slice(1).forEach((l, i) => doc.text(l, L, 75 + i * 11));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(String(c.number), R, 62, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Date', R - 150, 100);
    doc.text(dateShort(c.date), R, 100, { align: 'right' });

    doc.setFontSize(8);
    doc.text('PAY TO THE', L, 128);
    doc.text('ORDER OF', L, 138);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(c.payee, L + 54, 134);
    doc.line(L + 50, 138, R - 120, 138);
    doc.setFontSize(12);
    doc.text(`**${money(c.amount)}`, R - 8, 134, { align: 'right' });
    doc.rect(R - 112, 120, 112, 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(amountInWords(c.amount), L, 168);
    doc.line(L, 172, R - 10, 172);
    doc.text('DOLLARS', R, 168, { align: 'right' });

    doc.setFontSize(9);
    doc.text(`Memo  ${c.memo}`, L, 214);
    doc.line(L + 28, 218, L + 230, 218);
    doc.line(R - 200, 214, R, 214);
    doc.setFontSize(7);
    doc.text('AUTHORIZED SIGNATURE', R - 200, 222);

    // Two stubs below, the same on each.
    for (const top of [262, 502]) {
      doc.setDrawColor(150);
      doc.setLineDashPattern([3, 3], 0);
      doc.line(0, top - 14, 612, top - 14);
      doc.setLineDashPattern([], 0);
      doc.setDrawColor(0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`Check ${c.number}`, L, top + 4);
      doc.text(c.payee, L, top + 18);
      doc.text(money(c.amount), R, top + 4, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      c.stubLines.slice(0, 12).forEach(([label, value], i) => {
        doc.text(label, L, top + 38 + i * 13);
        doc.text(value, R, top + 38 + i * 13, { align: 'right' });
      });
    }
  });
  return doc.output('blob');
}
