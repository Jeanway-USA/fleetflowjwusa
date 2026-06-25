import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/formatters';
import {
  buildSettlementDocumentData,
  CORPORATE_HEADER,
  LEGAL_DISCLOSURE,
  statusLabel,
  type SettlementStatusLabel,
} from '@/lib/settlement-document-data';

const fmtDate = (d?: string | null) =>
  d ? format(parseISO(`${d}T00:00:00`), 'MMM d, yyyy') : '—';
const fmtDateShort = (d?: string | null) =>
  d ? format(parseISO(`${d}T00:00:00`), 'MM/dd/yyyy') : '—';
const fmtMiles = (n: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 0 });

const safe = (s: unknown): string =>
  String(s ?? '')
    .replace(/\u2192/g, '->')
    .replace(/\u2190/g, '<-')
    .replace(/\u00d7/g, 'x')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2022/g, '*')
    .replace(/\u00a0/g, ' ');

const STATUS_COLOR: Record<SettlementStatusLabel, [number, number, number]> = {
  DRAFT: [113, 113, 122],
  PENDING: [217, 119, 6],
  APPROVED: [71, 85, 105],
  PAID: [5, 150, 105],
};

async function loadLogo(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(new Error('logo load failed'));
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function detectLogoFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')
    ? 'JPEG'
    : 'PNG';
}

export async function generateSettlementPdf(settlementId: string): Promise<void> {
  const data = await buildSettlementDocumentData(settlementId);
  const { settlement: s, driver, org, reimbursementItems, deductionItems, breakdown, ytd } = data;

  const driverName =
    `${driver?.first_name ?? ''} ${driver?.last_name ?? ''}`.trim() || 'Driver';
  const driverIdLabel =
    driver?.landstar_operator_id ||
    (s.driver_id ? `ID ${String(s.driver_id).slice(0, 8).toUpperCase()}` : '—');
  const statementNo = String(s.id).slice(0, 8).toUpperCase();
  const status = statusLabel(s.status);

  const currentGross = Number(s.gross_pay ?? 0);
  const currentReimb = Number(s.reimbursements ?? 0);
  const currentDed = Number(s.deductions ?? 0);
  const currentNet = currentGross + currentReimb - currentDed;
  const ytdNet = ytd.gross + ytd.reimbursements - ytd.deductions;


  const logoData = await loadLogo(org?.logo_url);
  const logoFmt = logoData ? detectLogoFormat(logoData) : 'PNG';

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = W - margin * 2;

  // Footer reserve calc — disclosure + meta line
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  const disclosureLines = doc.splitTextToSize(safe(LEGAL_DISCLOSURE), contentW);
  const FOOTER_RESERVE = 20 + disclosureLines.length * 10 + 18;

  const ensureSpace = (needed: number) => {
    if (y + needed > H - FOOTER_RESERVE) {
      doc.addPage();
      y = margin;
    }
  };

  // ---------- Corporate header banner ----------
  const HEADER_H = 110;
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, HEADER_H, 'F');

  let leftX = margin;
  if (logoData) {
    try {
      doc.addImage(logoData, logoFmt, margin, 22, 56, 56);
      leftX = margin + 68;
    } catch {
      /* ignore */
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(safe(CORPORATE_HEADER.name), leftX, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225);
  doc.text(safe(CORPORATE_HEADER.subtitle), leftX, 62);

  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(safe(CORPORATE_HEADER.address), leftX, 78);

  // Right side: title, statement #, status pill
  const rx = W - margin;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text('SETTLEMENT & EARNINGS STATEMENT', rx, 40, { align: 'right' });

  doc.setFontSize(9);
  doc.setTextColor(226, 232, 240);
  doc.text(`Statement #${statementNo}`, rx, 56, { align: 'right' });

  // Status pill
  const pillText = status;
  const [pr, pg, pb] = STATUS_COLOR[status];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const pillW = doc.getTextWidth(pillText) + 16;
  const pillH = 16;
  const pillX = rx - pillW;
  const pillY = 66;
  doc.setFillColor(pr, pg, pb);
  doc.roundedRect(pillX, pillY, pillW, pillH, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(pillText, pillX + pillW / 2, pillY + 11, { align: 'center' });

  // ---------- Statement Details + Contractor Information ----------
  let y = HEADER_H + 22;
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.5);

  const colMidGap = 18;
  const colW = (contentW - colMidGap) / 2;

  // Section labels
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  doc.text('STATEMENT DETAILS', margin, y);
  doc.text('CONTRACTOR INFORMATION', margin + colW + colMidGap, y);
  y += 6;
  doc.line(margin, y, margin + colW, y);
  doc.line(margin + colW + colMidGap, y, margin + contentW, y);
  y += 14;

  const leftDetails: [string, string][] = [
    ['Statement #', statementNo],
    ['Pay Period', `${fmtDate(s.period_start)} - ${fmtDate(s.period_end)}`],
    ['Payment Date', fmtDate(s.payment_date)],
    ['Status', status],
    ['Earnings Method', breakdown.methodLabel],
  ];
  const rightDetails: [string, string][] = [
    ['Driver Name', driverName],
    ['Driver ID', driverIdLabel],
    ['Email', driver?.email || '—'],
    ['Phone', driver?.phone || '—'],
  ];

  const drawDetails = (
    rows: [string, string][],
    x: number,
    boxed: boolean,
  ) => {
    const rowH = 16;
    const padTop = boxed ? 10 : 0;
    const padBottom = boxed ? 10 : 0;
    const h = padTop + rows.length * rowH + padBottom;
    if (boxed) {
      doc.setDrawColor(228, 228, 231);
      doc.roundedRect(x, y - 4, colW, h, 4, 4, 'S');
    }
    let ry = y + padTop + 4;
    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(113, 113, 122);
      doc.text(safe(label.toUpperCase()), x + (boxed ? 10 : 0), ry);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(24, 24, 27);
      const valX = x + (boxed ? 10 : 0) + 96;
      const valMaxW = colW - (boxed ? 20 : 0) - 96;
      const wrapped = doc.splitTextToSize(safe(value), valMaxW);
      doc.text(wrapped[0] ?? safe(value), valX, ry);
      ry += rowH;
    });
    return h;
  };

  const lh = drawDetails(leftDetails, margin, false);
  const rh = drawDetails(rightDetails, margin + colW + colMidGap, true);
  y += Math.max(lh, rh) + 10;

  // ---------- Load Earnings & Routes table ----------
  ensureSpace(60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text('Load Earnings & Routes', margin, y);
  y += 6;

  const headStyles = {
    fillColor: [15, 23, 42] as [number, number, number],
    textColor: 255,
    fontSize: 9,
    halign: 'left' as const,
  };
  const baseStyles = {
    fontSize: 9,
    cellPadding: 6,
    textColor: [30, 41, 59] as [number, number, number],
    overflow: 'linebreak' as const,
    valign: 'top' as const,
    minCellHeight: 22,
  };
  const alt = { fillColor: [248, 250, 252] as [number, number, number] };
  const footStyles = {
    fillColor: [241, 245, 249] as [number, number, number],
    textColor: [15, 23, 42] as [number, number, number],
  };

  const loadWidths = { date: 56, load: 60, miles: 44, status: 56, origin: 158, dest: 158 };
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Load #', 'Miles', 'Status', 'Origin', 'Destination']],
    body:
      breakdown.loads.length === 0
        ? [['—', '—', '—', '—', 'No loads recorded in this period', '']]
        : breakdown.loads.map((l) => [
            fmtDateShort(l.delivery_date ?? l.pickup_date),
            safe(l.landstar_load_id || String(l.id).slice(0, 8)),
            fmtMiles(Number(l.booked_miles ?? l.actual_miles ?? 0)),
            safe(String(l.status ?? '—').replace(/_/g, ' ')),
            safe(l.origin ?? ''),
            safe(l.destination ?? ''),
          ]),
    headStyles,
    styles: baseStyles,
    alternateRowStyles: alt,
    columnStyles: {
      0: { cellWidth: loadWidths.date },
      1: { cellWidth: loadWidths.load },
      2: { cellWidth: loadWidths.miles, halign: 'right' },
      3: { cellWidth: loadWidths.status },
      4: { cellWidth: loadWidths.origin },
      5: { cellWidth: loadWidths.dest },
    },
    margin: { left: margin, right: margin, bottom: FOOTER_RESERVE },
    tableWidth: contentW,
    foot:
      breakdown.payType === 'flat'
        ? [
            [
              {
                content: 'Flat Rate Base Pay',
                colSpan: 5,
                styles: { halign: 'right', fontStyle: 'bold' },
              },
              {
                content: formatCurrency(breakdown.basePay),
                styles: { halign: 'right', fontStyle: 'bold' },
              },
            ],
          ]
        : breakdown.payType === 'per_mile'
          ? [
              [
                {
                  content: `Total ${fmtMiles(breakdown.totalLoadedMiles)} mi × $${breakdown.payRate.toFixed(2)}/mi`,
                  colSpan: 5,
                  styles: { halign: 'right', fontStyle: 'bold' },
                },
                {
                  content: formatCurrency(breakdown.basePay),
                  styles: { halign: 'right', fontStyle: 'bold' },
                },
              ],
            ]
          : breakdown.payType === 'percentage'
            ? [
                [
                  {
                    content: `Linehaul ${formatCurrency(breakdown.totalLinehaul)} · After ${(breakdown.truckSplit * 100).toFixed(0)}% split ${formatCurrency(breakdown.totalAfterSplit)} · Driver ${breakdown.payRate}%`,
                    colSpan: 5,
                    styles: { halign: 'right', fontStyle: 'bold', fontSize: 8 },
                  },
                  {
                    content: formatCurrency(breakdown.basePay),
                    styles: { halign: 'right', fontStyle: 'bold' },
                  },
                ],
              ]
            : [
                [
                  {
                    content: 'Base Pay',
                    colSpan: 5,
                    styles: { halign: 'right', fontStyle: 'bold' },
                  },
                  {
                    content: formatCurrency(breakdown.basePay),
                    styles: { halign: 'right', fontStyle: 'bold' },
                  },
                ],
              ],
    footStyles,
  });

  y = (doc as any).lastAutoTable.finalY + 18;

  // ---------- Earnings & Reimbursements itemized list ----------
  const lineRows: [string, number][] = [['Flat Rate Base Pay', breakdown.basePay]];
  if (reimbursementItems.length === 0) {
    lineRows.push(['No reimbursements in this period', 0]);
  } else {
    reimbursementItems.forEach((r) => {
      lineRows.push([`Reimbursement — ${r.description ?? 'Other'}`, Number(r.amount ?? 0)]);
    });
  }

  ensureSpace(28 + lineRows.length * 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text('Earnings & Reimbursements', margin, y);
  y += 12;

  lineRows.forEach(([label, val]) => {
    doc.setDrawColor(244, 244, 245);
    doc.line(margin, y + 12, W - margin, y + 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(63, 63, 70);
    doc.text(safe(label), margin, y + 8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(24, 24, 27);
    doc.text(formatCurrency(val), W - margin, y + 8, { align: 'right' });
    y += 16;
  });
  y += 8;

  // ---------- Dual summary cards ----------
  const summaryBlockH = 22 + 3 * 22 + 6;
  ensureSpace(summaryBlockH + 28);

  const sColW = (contentW - 16) / 2;

  const drawSummary = (
    x: number,
    title: string,
    gross: number,
    reimb: number,
    net: number,
  ) => {
    const rows: [string, number][] = [
      ['Gross Pay', gross],
      ['Reimbursements', reimb],
    ];
    const cardH = 22 + rows.length * 22 + 26;

    doc.setDrawColor(228, 228, 231);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, sColW, cardH, 4, 4, 'S');

    // Header bar
    doc.setFillColor(15, 23, 42);
    doc.rect(x, y, sColW, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(safe(title.toUpperCase()), x + 10, y + 14);

    // Rows
    let ry = y + 22 + 16;
    doc.setTextColor(24, 24, 27);
    rows.forEach(([label, val]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(82, 82, 91);
      doc.text(safe(label), x + 10, ry);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(24, 24, 27);
      doc.text(formatCurrency(val), x + sColW - 10, ry, { align: 'right' });
      ry += 22;
    });

    // Net Pay highlighted band
    const bandY = ry - 14;
    doc.setFillColor(241, 245, 249);
    doc.rect(x + 1, bandY, sColW - 2, 26, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('Net Pay', x + 10, bandY + 17);
    doc.text(formatCurrency(net), x + sColW - 10, bandY + 17, { align: 'right' });

    return cardH;
  };

  const h1 = drawSummary(margin, 'Current Period', currentGross, currentReimb, currentNet);
  const h2 = drawSummary(
    margin + sColW + 16,
    'Year-to-Date',
    ytd.gross,
    ytd.reimbursements,
    ytdNet,
  );
  y += Math.max(h1, h2) + 8;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  doc.text('Net Pay = Gross Pay + Reimbursements', W / 2, y, { align: 'center' });

  // ---------- Footer on every page ----------
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const footerTop = H - FOOTER_RESERVE + 4;
    doc.setDrawColor(228, 228, 231);
    doc.line(margin, footerTop, W - margin, footerTop);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(82, 82, 91);
    doc.text(disclosureLines, margin, footerTop + 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 148, 165);
    doc.text(`Generated ${format(new Date(), 'PPpp')}`, margin, H - 14);
    doc.text(`Page ${p} of ${pageCount}`, W - margin, H - 14, { align: 'right' });
  }

  const lastName = (driver?.last_name || 'Driver').replace(/\s+/g, '_');
  doc.save(`Settlement_${lastName}_${s.period_end}.pdf`);
}
