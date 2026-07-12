import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { formatCurrency, numberToEnglishUsd } from '@/lib/formatters';
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

export async function generateSettlementPdf(
  settlementId: string,
  _opts: { includeVoucher?: boolean } = {},
): Promise<void> {
  const data = await buildSettlementDocumentData(settlementId);
  const { settlement: s, driver, org, reimbursementItems, deductionItems, breakdown, ytd } = data;

  // Fetch full banking (owner/payroll only; RPC enforces access, silently null otherwise)
  let bankRouting: string | null = null;
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: bank } = await supabase.rpc('get_driver_banking', {
      _driver_id: s.driver_id,
    });
    const row = Array.isArray(bank) && bank.length > 0 ? (bank[0] as any) : null;
    bankRouting = row?.routing_number ?? null;
  } catch {
    bankRouting = null;
  }
  const routingLabel = (() => {
    const d = (bankRouting ?? '').replace(/\D/g, '');
    if (d.length !== 9) return bankRouting || '—';
    return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`;
  })();

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

  // ---------- Top monospace administrative tracker line ----------
  const TRACKER_H = 16;
  const id8 = String(s.driver_id ?? s.id).slice(0, 8).toUpperCase().padEnd(8, '0');
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, TRACKER_H, 'F');
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(113, 113, 122);
  doc.text(
    `CO: JW    FILE: ${id8}    DEPT: DISPATCH    CLOCK: ${id8}    NUMBER: 00000000`,
    margin,
    11,
  );

  // ---------- Corporate header banner ----------
  const HEADER_TOP = TRACKER_H;
  const HEADER_H = 110;
  doc.setFillColor(24, 24, 27); // zinc-900
  doc.rect(0, HEADER_TOP, W, HEADER_H, 'F');

  let leftX = margin;
  if (logoData) {
    try {
      doc.addImage(logoData, logoFmt, margin, HEADER_TOP + 22, 56, 56);
      leftX = margin + 68;
    } catch {
      /* ignore */
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(safe(CORPORATE_HEADER.name), leftX, HEADER_TOP + 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225);
  doc.text(safe(CORPORATE_HEADER.subtitle), leftX, HEADER_TOP + 62);

  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  doc.text(safe(CORPORATE_HEADER.address), leftX, HEADER_TOP + 78);

  // Right side: title, statement #, status pill
  const rx = W - margin;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text('SETTLEMENT & EARNINGS STATEMENT', rx, HEADER_TOP + 40, { align: 'right' });

  doc.setFontSize(9);
  doc.setTextColor(226, 232, 240);
  doc.text(`Statement #${statementNo}`, rx, HEADER_TOP + 56, { align: 'right' });

  // Status pill
  const pillText = status;
  const [pr, pg, pb] = STATUS_COLOR[status];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const pillW = doc.getTextWidth(pillText) + 16;
  const pillH = 16;
  const pillX = rx - pillW;
  const pillY = HEADER_TOP + 66;
  doc.setFillColor(pr, pg, pb);
  doc.roundedRect(pillX, pillY, pillW, pillH, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(pillText, pillX + pillW / 2, pillY + 11, { align: 'center' });

  // ---------- Statement Details + Contractor Information (dense grid) ----------
  let y = HEADER_TOP + HEADER_H + 18;

  const colMidGap = 16;
  const colW = (contentW - colMidGap) / 2;

  const HAIRLINE: [number, number, number] = [228, 228, 231]; // zinc-200
  const ZEBRA: [number, number, number] = [248, 250, 252];    // slate-50
  const HEAD_BG: [number, number, number] = [244, 244, 245];  // zinc-100
  const HEAD_FG: [number, number, number] = [82, 82, 91];     // zinc-600
  const TEXT: [number, number, number] = [24, 24, 27];

  const denseStyles = {
    fontSize: 9,
    cellPadding: { top: 2.5, bottom: 2.5, left: 6, right: 6 } as any,
    textColor: TEXT,
    lineColor: HAIRLINE,
    lineWidth: 0.4,
    overflow: 'linebreak' as const,
    valign: 'middle' as const,
  };
  const denseHead = {
    fillColor: HEAD_BG,
    textColor: HEAD_FG,
    fontStyle: 'bold' as const,
    fontSize: 8,
    halign: 'left' as const,
    cellPadding: { top: 3, bottom: 3, left: 6, right: 6 } as any,
  };
  const denseAlt = { fillColor: ZEBRA };

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [[{ content: 'STATEMENT DETAILS', colSpan: 2 }]],
    body: [
      ['Statement #', statementNo],
      ['Pay Period', `${fmtDate(s.period_start)} - ${fmtDate(s.period_end)}`],
      ['Payment Date', fmtDate(s.payment_date)],
      ['Status', status],
      ['Earnings Method', breakdown.methodLabel],
    ],
    headStyles: denseHead,
    styles: denseStyles,
    alternateRowStyles: denseAlt,
    columnStyles: {
      0: { cellWidth: 100, textColor: HEAD_FG, fontSize: 8 },
      1: { cellWidth: colW - 100, fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin + colW + colMidGap, bottom: FOOTER_RESERVE },
    tableWidth: colW,
    tableLineColor: HAIRLINE,
    tableLineWidth: 0.4,
  });
  const lEndY = (doc as any).lastAutoTable.finalY;

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [[{ content: 'CONTRACTOR INFORMATION', colSpan: 2 }]],
    body: [
      ['Driver Name', driverName],
      ['Driver ID', driverIdLabel],
      ['Email', driver?.email || '—'],
      ['Phone', driver?.phone || '—'],
    ],
    headStyles: denseHead,
    styles: denseStyles,
    alternateRowStyles: denseAlt,
    columnStyles: {
      0: { cellWidth: 100, textColor: HEAD_FG, fontSize: 8 },
      1: { cellWidth: colW - 100, fontStyle: 'bold' },
    },
    margin: { left: margin + colW + colMidGap, right: margin, bottom: FOOTER_RESERVE },
    tableWidth: colW,
    tableLineColor: HAIRLINE,
    tableLineWidth: 0.4,
  });
  const rEndY = (doc as any).lastAutoTable.finalY;
  y = Math.max(lEndY, rEndY) + 16;

  // ---------- Load Earnings & Routes table ----------
  ensureSpace(60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text('Load Earnings & Routes', margin, y);
  y += 6;

  const headStyles = {
    fillColor: HEAD_BG,
    textColor: HEAD_FG,
    fontSize: 8,
    fontStyle: 'bold' as const,
    halign: 'left' as const,
    cellPadding: { top: 3, bottom: 3, left: 6, right: 6 } as any,
  };
  const baseStyles = {
    fontSize: 9,
    cellPadding: { top: 2.5, bottom: 2.5, left: 6, right: 6 } as any,
    textColor: TEXT,
    lineColor: HAIRLINE,
    lineWidth: 0.4,
    overflow: 'linebreak' as const,
    valign: 'middle' as const,
    minCellHeight: 16,
  };
  const alt = { fillColor: ZEBRA };
  const footStyles = {
    fillColor: [241, 245, 249] as [number, number, number],
    textColor: TEXT,
  };


  const loadWidths = { date: 56, load: 60, miles: 44, status: 56, origin: 158, dest: 158 };
  autoTable(doc, {
    theme: 'grid',
    tableLineColor: HAIRLINE,
    tableLineWidth: 0.4,
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

  // ---------- Dual-column itemization: Earnings & Additions / Deductions & Escrows ----------
  const itemColGap = 16;
  const itemColW = (contentW - itemColGap) / 2;

  // Accessorials are folded into base gross pay — never surface a dedicated
  // "Accessorial" line item in the PDF.
  const visibleReimb = reimbursementItems.filter((r) => {
    const t = String(r.description ?? '').toLowerCase();
    return !t.includes('accessorial');
  });
  const earningsBody: Array<[string, string]> = [
    [breakdown.methodLabel, formatCurrency(breakdown.basePay)],
  ];
  if (visibleReimb.length === 0) {
    earningsBody.push(['No reimbursements in this period', formatCurrency(0)]);
  } else {
    visibleReimb.forEach((r) => {
      earningsBody.push([
        `Reimbursement — ${r.description ?? 'Other'}`,
        formatCurrency(Number(r.amount ?? 0)),
      ]);
    });
  }

  const deductionsBody: Array<[string, string]> =
    deductionItems.length === 0
      ? [['No deductions in this period', formatCurrency(0)]]
      : deductionItems.map((d) => [
          d.description ?? 'Deduction',
          formatCurrency(-Math.abs(Number(d.amount ?? 0))),
        ]);

  ensureSpace(80);
  const itemsStartY = y;

  autoTable(doc, {
    theme: 'grid',
    tableLineColor: HAIRLINE,
    tableLineWidth: 0.4,
    startY: itemsStartY,
    head: [[{ content: 'EARNINGS & ADDITIONS', colSpan: 2 }]],
    body: earningsBody,
    headStyles: { ...headStyles, halign: 'left' as const, fontStyle: 'bold' as const },
    styles: { ...baseStyles, fontSize: 9, cellPadding: 5, minCellHeight: 18 },
    columnStyles: {
      0: { cellWidth: itemColW - 70 },
      1: { cellWidth: 70, halign: 'right' as const, fontStyle: 'bold' as const },
    },
    margin: { left: margin, right: margin + itemColW + itemColGap, bottom: FOOTER_RESERVE },
    tableWidth: itemColW,
  });
  const earningsEndY = (doc as any).lastAutoTable.finalY;

  autoTable(doc, {
    theme: 'grid',
    tableLineColor: HAIRLINE,
    tableLineWidth: 0.4,
    startY: itemsStartY,
    head: [[{ content: 'DEDUCTIONS & ESCROWS', colSpan: 2 }]],
    body: deductionsBody,
    headStyles: { ...headStyles, halign: 'left' as const, fontStyle: 'bold' as const },
    styles: { ...baseStyles, fontSize: 9, cellPadding: 5, minCellHeight: 18 },
    columnStyles: {
      0: { cellWidth: itemColW - 70 },
      1: {
        cellWidth: 70,
        halign: 'right' as const,
        fontStyle: 'bold' as const,
        textColor: [220, 38, 38] as [number, number, number],
      },
    },
    margin: { left: margin + itemColW + itemColGap, right: margin, bottom: FOOTER_RESERVE },
    tableWidth: itemColW,
  });
  const deductionsEndY = (doc as any).lastAutoTable.finalY;
  y = Math.max(earningsEndY, deductionsEndY) + 18;

  // ---------- Dual summary cards (4 rows: Gross / Reimb / Deductions / Net) ----------
  const summaryBlockH = 22 + 3 * 18 + 28 + 6;
  ensureSpace(summaryBlockH + 28);

  const sColW = (contentW - 16) / 2;

  const drawSummary = (
    x: number,
    title: string,
    gross: number,
    reimb: number,
    ded: number,
    net: number,
  ) => {
    const rows: Array<[string, number, boolean]> = [
      ['Gross Pay', gross, false],
      ['Total Reimbursements', reimb, false],
      ['Total Deductions', -Math.abs(ded), true],
    ];
    const cardH = 22 + rows.length * 18 + 28;

    doc.setDrawColor(228, 228, 231);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, sColW, cardH, 4, 4, 'S');

    // Header bar
    doc.setFillColor(24, 24, 27);
    doc.rect(x, y, sColW, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(safe(title.toUpperCase()), x + 10, y + 14);

    // Rows
    let ry = y + 22 + 14;
    rows.forEach(([label, val, isRed]) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(82, 82, 91);
      doc.text(safe(label), x + 10, ry);
      if (isRed) {
        doc.setTextColor(220, 38, 38);
      } else {
        doc.setTextColor(24, 24, 27);
      }
      doc.text(formatCurrency(val), x + sColW - 10, ry, { align: 'right' });
      ry += 18;
    });

    // Net Pay highlighted band
    const bandY = ry - 12;
    doc.setFillColor(241, 245, 249);
    doc.rect(x + 1, bandY, sColW - 2, 26, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(24, 24, 27);
    doc.text('Net Pay', x + 10, bandY + 17);
    doc.text(formatCurrency(net), x + sColW - 10, bandY + 17, { align: 'right' });

    return cardH;
  };

  const h1 = drawSummary(margin, 'Current Period', currentGross, currentReimb, currentDed, currentNet);
  const h2 = drawSummary(
    margin + sColW + 16,
    'Year-to-Date',
    ytd.gross,
    ytd.reimbursements,
    ytd.deductions,
    ytdNet,
  );
  y += Math.max(h1, h2) + 10;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(113, 113, 122);
  doc.text(
    'Calculation Note: Net Pay = Gross Pay + Reimbursements - Deductions',
    W / 2,
    y,
    { align: 'center' },
  );


  // ---------- Detachable Check Voucher (always at base) ----------
  {
    const voucherH = 200;
    if (y + voucherH > H - FOOTER_RESERVE) {
      doc.addPage();
      y = margin;
    }
    y += 16;

    const vx = margin;
    const vy = y;
    const vw = contentW;
    const vh = voucherH;

    // Tear label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(113, 113, 122);
    doc.text('-- DETACH HERE - NON-NEGOTIABLE VOUCHER --', W / 2, vy - 4, {
      align: 'center',
    });

    // Background fill (~ bg-zinc-50/40) + squared dashed border
    doc.setFillColor(250, 250, 251);
    doc.rect(vx, vy, vw, vh, 'F');
    doc.setDrawColor(212, 212, 216); // zinc-300
    doc.setLineWidth(1.5);
    (doc as any).setLineDashPattern?.([5, 4], 0);
    doc.rect(vx, vy, vw, vh, 'S');
    (doc as any).setLineDashPattern?.([], 0);

    // Diagonal 45° watermark
    const gs: any = (doc as any).GState
      ? new (doc as any).GState({ opacity: 0.1 })
      : null;
    if (gs) (doc as any).setGState(gs);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(120, 120, 130);
    doc.text(
      'NON-NEGOTIABLE - FOR RECORD PURPOSES ONLY',
      vx + vw / 2,
      vy + vh / 2 + 6,
      { align: 'center', angle: 45 },
    );
    if (gs) {
      const gsReset: any = new (doc as any).GState({ opacity: 1 });
      (doc as any).setGState(gsReset);
    }

    // Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(24, 24, 27);
    doc.text(safe(CORPORATE_HEADER.name), vx + 14, vy + 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);
    doc.text('PAYROLL VOUCHER', vx + 14, vy + 32);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('CHECK NO.', vx + vw - 14, vy + 20, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(24, 24, 27);
    doc.text(`VCH-${statementNo}`, vx + vw - 14, vy + 34, { align: 'right' });

    // Separator
    doc.setDrawColor(228, 228, 231);
    doc.line(vx + 14, vy + 44, vx + vw - 14, vy + 44);

    // Pay to / amount
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(113, 113, 122);
    doc.text('PAY TO THE ORDER OF', vx + 14, vy + 58);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(24, 24, 27);
    doc.text(safe(driverName), vx + 14, vy + 74);
    doc.setDrawColor(160, 160, 170);
    doc.line(vx + 14, vy + 78, vx + vw / 2 - 10, vy + 78);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(113, 113, 122);
    doc.text('AMOUNT', vx + vw - 14, vy + 58, { align: 'right' });
    doc.setDrawColor(160, 160, 170);
    doc.roundedRect(vx + vw / 2 + 10, vy + 62, vw / 2 - 24, 20, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(24, 24, 27);
    doc.text(formatCurrency(currentNet), vx + vw - 20, vy + 77, { align: 'right' });

    // Amount in words
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(113, 113, 122);
    doc.text('AMOUNT IN WORDS', vx + 14, vy + 96);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(40, 40, 50);
    const words = safe(numberToEnglishUsd(currentNet));
    doc.text(words, vx + 14, vy + 110);
    doc.line(vx + 14, vy + 113, vx + vw - 14, vy + 113);

    // Field grid
    const fieldRowY = vy + 128;
    const colMid = vx + vw / 2;
    const labelField = (lx: number, ly: number, label: string, value: string) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(113, 113, 122);
      doc.text(label, lx, ly);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(24, 24, 27);
      doc.text(safe(value), lx, ly + 11);
    };
    labelField(vx + 14, fieldRowY, 'PAY DATE', fmtDate(s.payment_date));
    labelField(
      colMid + 6,
      fieldRowY,
      'MEMO',
      `Settlement ${fmtDate(s.period_start)} - ${fmtDate(s.period_end)}`,
    );
    labelField(vx + 14, fieldRowY + 26, 'BANK ROUTING', routingLabel);
    labelField(colMid + 6, fieldRowY + 26, 'METHOD', 'ACH Direct Deposit on File');

    // Signature
    const sigY = vy + vh - 24;
    doc.setFont('times', 'italic');
    doc.setFontSize(16);
    doc.setTextColor(30, 30, 40);
    doc.text('Jean-Way Payroll', vx + 14, sigY - 6);
    doc.setDrawColor(40, 40, 50);
    doc.line(vx + 14, sigY, vx + vw / 2 - 20, sigY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(113, 113, 122);
    doc.text('AUTHORIZED SIGNATURE', vx + 14, sigY + 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(24, 24, 27);
    doc.text(fmtDate(s.payment_date), colMid + 6, sigY - 6);
    doc.line(colMid + 6, sigY, vx + vw - 14, sigY);
    doc.setFontSize(7);
    doc.setTextColor(113, 113, 122);
    doc.text('DATE', colMid + 6, sigY + 9);

    y = vy + vh + 12;
  }

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
