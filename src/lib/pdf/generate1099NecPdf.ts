import jsPDF from 'jspdf';
import type { EmployerInfo, Row1099 } from '@/hooks/useTaxHubData';

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Generate a Form 1099-NEC recipient copy (Copy B) as a PDF blob.
 * Layout mirrors the IRS 2024 Form 1099-NEC boxes.
 */
export function generate1099NecPdf(opts: {
  year: number;
  employer: EmployerInfo;
  recipient: Row1099;
  /** Full unmasked TIN digits (owner/payroll only). Falls back to last-4. */
  tinFull?: string | null;
  /** 'ssn' or 'ein' — controls formatting of the full TIN when provided. */
  tinType?: string | null;
}): Blob {
  const { year, employer, recipient, tinFull, tinType } = opts;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = 612;
  const M = 36;
  let y = M;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Form 1099-NEC — Nonemployee Compensation', M, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  y += 16;
  doc.text(`Tax Year ${year}   ·   Copy B — For Recipient`, M, y);
  y += 8;
  doc.line(M, y, W - M, y);
  y += 14;

  const drawBox = (x: number, w: number, h: number, label: string, value: string, valueSize = 10) => {
    doc.setDrawColor(120);
    doc.rect(x, y, w, h);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x + 3, y + 8);
    doc.setFontSize(valueSize);
    doc.setFont('helvetica', 'bold');
    doc.text(value || '', x + 4, y + h - 5, { maxWidth: w - 8 });
  };

  // Payer + Recipient identification
  drawBox(M, 300, 66, 'PAYER\'s name, street address, city, state, ZIP',
    [employer.name || '',
     employer.address_line1 || '',
     `${employer.city || ''}${employer.city ? ', ' : ''}${employer.state || ''} ${employer.zip || ''}`.trim(),
    ].filter(Boolean).join('\n'), 9);
  drawBox(M + 300, 240, 66, 'PAYER\'s TIN (EIN)', employer.ein || '—');
  y += 66;

  drawBox(M, 300, 66, 'RECIPIENT\'s name and address',
    [recipient.legal_name || `${recipient.first_name ?? ''} ${recipient.last_name ?? ''}`.trim(),
     recipient.business_name ? `DBA ${recipient.business_name}` : '',
     recipient.address || '',
     recipient.tax_state || ''].filter(Boolean).join('\n'), 9);
  const tinDigits = (tinFull ?? '').replace(/\D/g, '');
  const tinLabel = tinDigits.length === 9
    ? ((tinType ?? '').toLowerCase() === 'ein'
        ? `${tinDigits.slice(0, 2)}-${tinDigits.slice(2)}`
        : `${tinDigits.slice(0, 3)}-${tinDigits.slice(3, 5)}-${tinDigits.slice(5)}`)
    : recipient.tin_last4 ? `XXX-XX-${recipient.tin_last4}` : '(on file)';
  drawBox(M + 300, 240, 66, 'RECIPIENT\'s TIN', tinLabel);
  y += 76;

  // Numbered boxes
  const box = (x: number, w: number, h: number, label: string, value: string) => {
    doc.setDrawColor(120);
    doc.rect(x, y, w, h);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x + 3, y + 8);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x + w - 4, y + h - 5, { align: 'right' });
  };

  const rowH = 44;
  box(M, 260, rowH, '1  Nonemployee compensation', `$ ${fmt(recipient.nonemployee_comp_box1)}`);
  box(M + 260, 280, rowH, '2  Payer made direct sales totaling $5,000 or more', '☐');
  y += rowH;

  box(M, 260, rowH, '3  (Reserved)', '');
  box(M + 260, 280, rowH, '4  Federal income tax withheld', `$ ${fmt(recipient.fed_tax_withheld_box4)}`);
  y += rowH;

  const stH = 44;
  const stW = (W - 2 * M) / 3;
  box(M, stW, stH, '5  State tax withheld',
    `$ ${fmt(recipient.state_tax_withheld_box5)}`);
  box(M + stW, stW, stH, '6  State/Payer\'s state no.', recipient.tax_state || '');
  box(M + 2 * stW, stW, stH, '7  State income', '');
  y += stH + 10;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(
    'This is important tax information and is being furnished to the IRS. If you are required to file a return, a negligence penalty or other sanction may be imposed on you if this income is taxable and the IRS determines that it has not been reported.',
    M, y, { maxWidth: W - 2 * M },
  );
  y += 28;
  doc.setFont('helvetica', 'normal');
  doc.text(`Payer: ${employer.name || '—'} · TIN: ${employer.ein || '—'} · Tax Year: ${year}`, M, y);

  return doc.output('blob');
}
