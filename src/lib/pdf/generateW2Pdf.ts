import jsPDF from 'jspdf';
import type { EmployerInfo } from '@/hooks/useTaxHubData';
import type { W2Row } from '@/hooks/useTaxHubData';

interface DriverBlock {
  firstName: string | null;
  lastName: string | null;
  ssnFull?: string | null;
  ssnLast4?: string | null;
  address?: string | null;
  tax_state?: string | null;
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Generate a Form W-2 recipient copy (Copy B/C) as a PDF blob.
 * Layout mirrors the IRS 2024 Form W-2 lettered/numbered boxes.
 * NOTE: Copy A (SSA-filed) is not produced here; use SSA BSO for e-filing.
 */
export function generateW2Pdf(opts: {
  year: number;
  employer: EmployerInfo;
  driver: DriverBlock;
  totals: W2Row;
}): Blob {
  const { year, employer, driver, totals } = opts;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = 612;
  const M = 36;
  let y = M;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Form W-2 — Wage and Tax Statement`, M, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  y += 16;
  doc.text(`Tax Year ${year}   ·   Copy B — To be filed with employee's federal tax return`, M, y);
  y += 8;
  doc.setDrawColor(0);
  doc.line(M, y, W - M, y);
  y += 14;

  const drawBox = (x: number, w: number, h: number, label: string, value: string, opts?: { valueSize?: number }) => {
    doc.setDrawColor(120);
    doc.rect(x, y, w, h);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x + 3, y + 8);
    doc.setFontSize(opts?.valueSize ?? 11);
    doc.setFont('helvetica', 'bold');
    doc.text(value || '', x + 4, y + h - 5);
  };

  // Row 1: Employer identification block
  const rowH = 44;
  drawBox(M, 220, rowH, 'a  Employee SSN', driver.ssnLast4 ? `XXX-XX-${driver.ssnLast4}` : '(on file)');
  drawBox(M + 220, 320, rowH, 'b  Employer identification number (EIN)', employer.ein || '—');
  y += rowH;

  drawBox(M, 320, rowH, 'c  Employer name, address, and ZIP',
    [employer.name || '',
     employer.address_line1 || '',
     `${employer.city || ''}${employer.city ? ', ' : ''}${employer.state || ''} ${employer.zip || ''}`.trim()]
      .filter(Boolean).join('\n'), { valueSize: 9 });
  drawBox(M + 320, 220, rowH, 'd  Control number', '');
  y += rowH;

  drawBox(M, 540, rowH, 'e/f  Employee name and address',
    [`${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim(),
     driver.address || '', driver.tax_state || ''].filter(Boolean).join('  ·  '),
    { valueSize: 10 });
  y += rowH + 6;

  // Numbered boxes grid
  const boxes: Array<[string, number, number, number]> = [
    // [label, box#, colStart(0..3), colSpan]
  ];
  const colW = (W - 2 * M) / 4;
  const boxH = 34;

  const cellX = (i: number) => M + i * colW;
  const drawNum = (row: number, col: number, num: string, label: string, value: string) => {
    const x = cellX(col);
    const yy = y + row * boxH;
    doc.setDrawColor(120);
    doc.rect(x, yy, colW, boxH);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`${num}  ${label}`, x + 3, yy + 8);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + colW - 4, yy + boxH - 5, { align: 'right' });
  };

  drawNum(0, 0, '1', 'Wages, tips, other comp.', fmt(totals.wages_box1));
  drawNum(0, 1, '2', 'Federal income tax withheld', fmt(totals.fit_box2));
  drawNum(0, 2, '3', 'Social security wages', fmt(totals.ss_wages_box3));
  drawNum(0, 3, '4', 'Social security tax withheld', fmt(totals.ss_tax_box4));

  drawNum(1, 0, '5', 'Medicare wages and tips', fmt(totals.medicare_wages_box5));
  drawNum(1, 1, '6', 'Medicare tax withheld', fmt(totals.medicare_tax_box6));
  drawNum(1, 2, '7', 'Social security tips', fmt(0));
  drawNum(1, 3, '8', 'Allocated tips', fmt(0));

  drawNum(2, 0, '9', '', '');
  drawNum(2, 1, '10', 'Dependent care benefits', fmt(0));
  drawNum(2, 2, '11', 'Nonqualified plans', fmt(0));
  drawNum(2, 3, '12a', 'See instructions', '');

  drawNum(3, 0, '13', 'Stat. emp. / Retire. / Sick', '☐ ☐ ☐');
  drawNum(3, 1, '14', 'Other', '');
  drawNum(3, 2, '12b', '', '');
  drawNum(3, 3, '12c', '', '');

  y += 4 * boxH + 6;

  // State row
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('State and local wages', M, y);
  y += 6;

  const stateCols: Array<[string, string, string]> = [
    ['15  State', totals.tax_state || '', ''],
    ['16  State wages, tips, etc.', fmt(totals.state_wages_box16), ''],
    ['17  State income tax', fmt(totals.state_tax_box17), ''],
    ['18  Local wages', fmt(0), ''],
    ['19  Local income tax', fmt(0), ''],
    ['20  Locality name', '', ''],
  ];
  const stateColW = (W - 2 * M) / stateCols.length;
  stateCols.forEach((c, i) => {
    const x = M + i * stateColW;
    doc.setDrawColor(120);
    doc.rect(x, y, stateColW, 30);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(c[0], x + 3, y + 8);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(c[1], x + stateColW - 4, y + 24, { align: 'right' });
  });
  y += 40;

  // Footer notice
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(
    'This information is being furnished to the Internal Revenue Service. If you are required to file a tax return, a negligence penalty or other sanction may be imposed on you if this income is taxable and you fail to report it.',
    M, y, { maxWidth: W - 2 * M },
  );
  y += 28;
  doc.setFont('helvetica', 'normal');
  doc.text(`Employer: ${employer.name || '—'} · EIN: ${employer.ein || '—'} · Tax Year: ${year}`, M, y);

  return doc.output('blob');
}
