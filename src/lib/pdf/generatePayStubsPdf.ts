import jsPDF from 'jspdf';
import type { EmployerBlock } from '@/lib/pdf/generateW2Pdf';
import type { PayRun } from '@/lib/payroll/payRun';
import { registerRows, type StubData, type StubLine } from '@/lib/payroll/stubs';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const dateLong = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const dateShort = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const employerLines = (e: EmployerBlock) => [e.name ?? '', e.address_line1 ?? '', e.address_line2 ?? '', [e.city, [e.state, e.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean);

/** One pay stub per page. A stub for a run that is not approved yet says so across the top. */
export function generatePayStubsPdf(stubs: StubData[], employer: EmployerBlock): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const M = 48;
  const W = 612 - M * 2;
  stubs.forEach((s, idx) => {
    if (idx > 0) doc.addPage();
    let y = 54;
    doc.setTextColor(0);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Pay stub', M, y);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    employerLines(employer).forEach((l, i) => doc.text(l, 612 - M, y - 8 + i * 11, { align: 'right' }));
    y += 12;
    if (s.runStatus === 'draft') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('DRAFT: this pay has not been approved. The numbers can still change.', M, y);
      y += 14;
    }
    doc.setDrawColor(0);
    doc.line(M, y, M + W, y);
    y += 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(s.name, M, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(s.payeeKind, M, y + 12);
    doc.text(`Pay date: ${dateLong(s.payDate)}`, M + W, y, { align: 'right' });
    doc.text(`Pay period: ${dateShort(s.periodStart)} to ${dateShort(s.periodEnd)}`, M + W, y + 12, { align: 'right' });
    y += 40;

    const section = (title: string, lines: StubLine[], opts: { minus?: boolean; empty?: string } = {}) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(title, M, y);
      y += 4;
      doc.setDrawColor(150);
      doc.line(M, y, M + W, y);
      y += 13;
      doc.setFontSize(9);
      if (lines.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(110);
        doc.text(opts.empty ?? 'None', M, y);
        doc.setTextColor(0);
        y += 14;
      }
      for (const l of lines) {
        doc.setFont('helvetica', 'normal');
        // A long description (a load's route, for example) wraps instead of running into the amount.
        const wrapped: string[] = doc.splitTextToSize(l.label, l.detail ? 190 : 380);
        const shown = wrapped.slice(0, 3);
        if (wrapped.length > 3) shown[2] = `${shown[2].slice(0, -1)}...`;
        doc.text(shown, M, y);
        if (l.detail) {
          doc.setFontSize(8);
          doc.setTextColor(110);
          doc.text(l.detail, M + 210, y, { maxWidth: 240 });
          doc.setTextColor(0);
          doc.setFontSize(9);
        }
        doc.text(`${opts.minus ? '-' : ''}${money(l.amount)}`, M + W, y, { align: 'right' });
        y += 13 * shown.length;
      }
      y += 8;
    };

    section('Earnings (taxable)', s.earnings, { empty: 'Nothing earned in this period' });
    if (s.reimbursements.length > 0) section('Reimbursements (not taxable)', s.reimbursements);
    section('Taxes withheld', s.taxes, { minus: true, empty: 'No taxes withheld' });
    if (s.deductions.length > 0) section('Deductions', s.deductions, { minus: true });

    // Summary
    y += 4;
    doc.setDrawColor(0);
    doc.line(M, y, M + W, y);
    y += 16;
    const row = (label: string, value: string, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(bold ? 11 : 9);
      doc.text(label, M, y);
      doc.text(value, M + W, y, { align: 'right' });
      y += bold ? 18 : 13;
    };
    row('Gross pay', money(s.gross));
    if (s.nonTaxable > 0) row('Plus reimbursements', money(s.nonTaxable));
    row('Less taxes withheld', `-${money(s.taxTotal)}`);
    if (s.deductionTotal > 0) row('Less deductions', `-${money(s.deductionTotal)}`);
    y += 2;
    row('Take-home pay', money(s.net), true);

    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Year to date', M, y);
    y += 4;
    doc.setDrawColor(150);
    doc.line(M, y, M + W, y);
    y += 13;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gross pay ${money(s.ytd.gross)}`, M, y);
    doc.text(`Taxes withheld ${money(s.ytd.taxes)}`, M + 190, y);
    doc.text(`Take-home pay ${money(s.ytd.net)}`, M + 380, y);
    if (s.notes.length > 0) {
      y += 22;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Leave', M, y);
      y += 4;
      doc.line(M, y, M + W, y);
      y += 13;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      s.notes.forEach((n) => { doc.text(n, M, y); y += 12; });
    }

    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text('Keep this stub with your records. Your Form W-2 for the year reports the totals.', M, 740);
    doc.setTextColor(0);
  });
  return doc.output('blob');
}

/** The payroll register: one line per person, with the totals, for the owner, the accountant or an audit. Landscape. */
export function generateRegisterPdf(stubs: StubData[], run: PayRun, employer: EmployerBlock): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'landscape' });
  const M = 40;
  const W = 792 - M * 2;
  let y = 48;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Payroll register', M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${employer.name ?? ''}${employer.ein ? `   EIN ${employer.ein}` : ''}`, 792 - M, y - 6, { align: 'right' });
  y += 14;
  doc.text(`Pay date ${dateLong(run.pay_date)}   Status: ${run.status}${run.status === 'draft' ? ' (not approved)' : ''}`, M, y);
  y += 22;

  const cols = [
    { h: 'Person', x: 0, align: 'left' as const },
    { h: 'Type', x: 150, align: 'left' as const },
    { h: 'Period', x: 200, align: 'left' as const },
    { h: 'Gross', x: 395, align: 'right' as const },
    { h: 'Reimbursed', x: 465, align: 'right' as const },
    { h: 'Taxes withheld', x: 550, align: 'right' as const },
    { h: 'Deductions', x: 625, align: 'right' as const },
    { h: 'Take-home', x: 700, align: 'right' as const },
  ];
  const head = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    cols.forEach((c) => doc.text(c.h, M + c.x, y, { align: c.align }));
    y += 4;
    doc.line(M, y, M + W, y);
    y += 13;
  };
  head();
  const rows = registerRows(stubs);
  const tot = { gross: 0, nonTaxable: 0, taxTotal: 0, deductionTotal: 0, net: 0, employerTotal: 0 };
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (const r of rows) {
    if (y > 540) { doc.addPage(); y = 48; head(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); }
    doc.text(r.name, M, y);
    doc.text(r.kind, M + 150, y);
    doc.text(r.period, M + 200, y);
    doc.text(money(r.gross), M + 395, y, { align: 'right' });
    doc.text(money(r.nonTaxable), M + 465, y, { align: 'right' });
    doc.text(money(r.taxTotal), M + 550, y, { align: 'right' });
    doc.text(money(r.deductionTotal), M + 625, y, { align: 'right' });
    doc.text(money(r.net), M + 700, y, { align: 'right' });
    for (const k of Object.keys(tot) as Array<keyof typeof tot>) tot[k] += r[k];
    y += 14;
  }
  y += 2;
  doc.line(M, y, M + W, y);
  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.text(`Totals (${rows.length} ${rows.length === 1 ? 'person' : 'people'})`, M, y);
  doc.text(money(tot.gross), M + 395, y, { align: 'right' });
  doc.text(money(tot.nonTaxable), M + 465, y, { align: 'right' });
  doc.text(money(tot.taxTotal), M + 550, y, { align: 'right' });
  doc.text(money(tot.deductionTotal), M + 625, y, { align: 'right' });
  doc.text(money(tot.net), M + 700, y, { align: 'right' });
  y += 26;
  doc.setFont('helvetica', 'normal');
  doc.text(`Employer payroll taxes on this run: ${money(tot.employerTotal)}.   Total cost of this payroll: ${money(tot.gross + tot.employerTotal)}.`, M, y);
  y += 12;
  doc.setFontSize(7.5);
  doc.setTextColor(110);
  doc.text(`Prepared ${dateShort(new Date().toISOString().slice(0, 10))} from the saved pay. Keep with payroll records for at least four years.`, M, 570);
  return doc.output('blob');
}
