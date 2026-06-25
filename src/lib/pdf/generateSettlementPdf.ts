import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/formatters';
import { fetchPayBreakdown } from '@/lib/settlement-pay-breakdown';

const fmtDate = (d?: string | null) =>
  d ? format(parseISO(`${d}T00:00:00`), 'MMM d, yyyy') : '—';

const fmtDateShort = (d?: string | null) =>
  d ? format(parseISO(`${d}T00:00:00`), 'MM/dd/yyyy') : '—';

const fmtMiles = (n: number) =>
  n.toLocaleString('en-US', { maximumFractionDigits: 0 });

/**
 * jsPDF's default helvetica uses WinAnsi encoding, which does not include
 * many common typographic glyphs (→ × – — • etc.). Passing them through
 * produces garbage like `!'`. This swaps them for safe ASCII equivalents
 * before any text reaches the PDF.
 */
const safe = (s: unknown): string =>
  String(s ?? '')
    .replace(/\u2192/g, '->') // →
    .replace(/\u2190/g, '<-') // ←
    .replace(/\u00d7/g, 'x') // ×
    .replace(/[\u2013\u2014]/g, '-') // – —
    .replace(/[\u2018\u2019]/g, "'") // ‘ ’
    .replace(/[\u201c\u201d]/g, '"') // “ ”
    .replace(/\u2022/g, '*') // •
    .replace(/\u00a0/g, ' '); // nbsp

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
  const { data: settlement, error: sErr } = await supabase
    .from('driver_settlements')
    .select('*')
    .eq('id', settlementId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!settlement) throw new Error('Settlement not found');

  const s: any = settlement;

  const [{ data: driver }, { data: org }, { data: items }, { data: settings }] =
    await Promise.all([
      supabase
        .from('drivers')
        .select(
          'first_name, last_name, email, phone, landstar_operator_id, hire_date, pay_type, pay_rate',
        )
        .eq('id', s.driver_id)
        .maybeSingle(),
      supabase
        .from('organizations')
        .select('name, logo_url, dot_number, mc_number, tms_mode')
        .eq('id', s.org_id)
        .maybeSingle(),
      supabase
        .from('driver_settlement_items')
        .select('id, item_type, amount, description, load_id, expense_id')
        .eq('settlement_id', settlementId),
      supabase
        .from('company_settings')
        .select('setting_key, setting_value')
        .eq('org_id', s.org_id)
        .in('setting_key', ['company_address', 'payroll_contact']),
    ]);

  const settingMap = new Map<string, string>(
    (settings ?? []).map((r: any) => [r.setting_key, r.setting_value]),
  );
  const companyAddress = settingMap.get('company_address') ?? '';
  const payrollContact = settingMap.get('payroll_contact') ?? '';

  const reimbItems = (items ?? []).filter((i: any) => i.item_type === 'reimbursement');

  const breakdown = await fetchPayBreakdown(s, driver as any);

  const logoData = await loadLogo(org?.logo_url);
  const logoFmt = logoData ? detectLogoFormat(logoData) : 'PNG';

  const driverName =
    `${driver?.first_name ?? ''} ${driver?.last_name ?? ''}`.trim() || 'Driver';
  const orgName = org?.name ?? 'Company';
  const driverIdLabel =
    driver?.landstar_operator_id ||
    (s.driver_id ? `ID ${String(s.driver_id).slice(0, 8).toUpperCase()}` : '');
  const isContractor = (driver?.pay_type ?? '') !== 'employee';

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = W - margin * 2;

  // ---------- Header band ----------
  const HEADER_H = 110;
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, HEADER_H, 'F');

  let leftX = margin;
  if (logoData) {
    try {
      doc.addImage(logoData, logoFmt, margin, 20, 60, 60);
      leftX = margin + 72;
    } catch {
      /* ignore */
    }
  }
  const leftMaxW = W / 2 - leftX - 10;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(
    doc.splitTextToSize(safe(orgName), leftMaxW)[0] ?? safe(orgName),
    leftX,
    38,
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let leftY = 54;
  if (companyAddress) {
    safe(companyAddress)
      .split(/\r?\n/)
      .forEach((line) => {
        const wrapped = doc.splitTextToSize(line, leftMaxW);
        wrapped.forEach((ln: string) => {
          doc.text(ln, leftX, leftY);
          leftY += 11;
        });
      });
  }
  const ids: string[] = [];
  if (org?.dot_number) ids.push(`USDOT ${org.dot_number}`);
  if (org?.mc_number) ids.push(`MC ${org.mc_number}`);
  if (ids.length) doc.text(safe(ids.join('  ·  ')), leftX, leftY);

  const rx = W - margin;
  const rightMaxW = 240;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(
    doc.splitTextToSize(safe(driverName), rightMaxW)[0] ?? safe(driverName),
    rx,
    32,
    { align: 'right' },
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let rightY = 46;
  const rightLine = (val?: string | null) => {
    if (!val) return;
    const wrapped = doc.splitTextToSize(safe(val), rightMaxW);
    wrapped.forEach((ln: string) => {
      doc.text(ln, rx, rightY, { align: 'right' });
      rightY += 11;
    });
  };
  if (driverIdLabel) rightLine(driverIdLabel);
  if (driver?.email) rightLine(driver.email);
  if (driver?.phone) rightLine(driver.phone);

  // ---------- Title + period strip ----------
  let y = HEADER_H + 22;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('Settlement Statement', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Statement #${String(s.id).slice(0, 8).toUpperCase()}`,
    rx,
    y,
    { align: 'right' },
  );

  y += 14;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, W - margin, y);
  y += 16;

  // Period info grid (4 columns)
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  const col1 = margin;
  const col2 = margin + 170;
  const col3 = margin + 320;
  doc.text('PAY PERIOD', col1, y);
  doc.text('PAYMENT DATE', col2, y);
  doc.text('EARNINGS METHOD', col3, y);
  doc.text('STATUS', rx, y, { align: 'right' });

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(
    safe(`${fmtDate(s.period_start)} - ${fmtDate(s.period_end)}`),
    col1,
    y + 14,
  );
  doc.text(fmtDate(s.payment_date), col2, y + 14);
  doc.setFontSize(9);
  doc.text(
    doc.splitTextToSize(safe(breakdown.methodLabel), rx - col3 - 60)[0] ??
      safe(breakdown.methodLabel),
    col3,
    y + 14,
  );
  doc.setFontSize(10);
  doc.text(safe(String(s.status || 'draft').toUpperCase()), rx, y + 14, {
    align: 'right',
  });

  y += 34;

  // ---------- Pay Calculation band ----------
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentW, 28, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('PAY CALCULATION', margin + 10, y + 11);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  const formulaMaxW = contentW - 140;
  const formulaSafe = safe(breakdown.formulaLabel);
  const formulaLines = doc.splitTextToSize(formulaSafe, formulaMaxW);
  doc.text(formulaLines[0], W - margin - 10, y + 19, { align: 'right' });
  y += 40;

  // ---------- Earnings table (per pay type) ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Load Earnings', margin, y);
  y += 6;

  const headStyles = {
    fillColor: [15, 23, 42] as [number, number, number],
    textColor: 255,
    fontSize: 9,
    halign: 'left' as const,
  };
  const baseStyles = {
    fontSize: 9,
    cellPadding: 5,
    textColor: [30, 41, 59] as [number, number, number],
    overflow: 'linebreak' as const,
    valign: 'top' as const,
  };
  const alt = { fillColor: [248, 250, 252] as [number, number, number] };
  const footStyles = {
    fillColor: [241, 245, 249] as [number, number, number],
    textColor: [15, 23, 42] as [number, number, number],
  };

  if (breakdown.payType === 'flat') {
    // total contentW ≈ 532. widths sum to 532.
    const widths = { date: 62, load: 64, origin: 156, dest: 156, miles: 44, status: 50 };
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Load #', 'Origin', 'Destination', 'Miles', 'Status']],
      body:
        breakdown.loads.length === 0
          ? [['—', '—', 'No loads recorded in this period', '', '—', '—']]
          : breakdown.loads.map((l) => [
              fmtDateShort(l.delivery_date ?? l.pickup_date),
              safe(l.landstar_load_id || String(l.id).slice(0, 8)),
              safe(l.origin ?? ''),
              safe(l.destination ?? ''),
              fmtMiles(Number(l.booked_miles ?? l.actual_miles ?? 0)),
              safe(String(l.status ?? '—').replace(/_/g, ' ')),
            ]),
      headStyles,
      styles: baseStyles,
      alternateRowStyles: alt,
      columnStyles: {
        0: { cellWidth: widths.date },
        1: { cellWidth: widths.load },
        2: { cellWidth: widths.origin },
        3: { cellWidth: widths.dest },
        4: { cellWidth: widths.miles, halign: 'right' },
        5: { cellWidth: widths.status },
      },
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      foot: [
        [
          { content: 'Flat Rate Base Pay', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
          { content: formatCurrency(breakdown.basePay), styles: { halign: 'right', fontStyle: 'bold' } },
        ],
      ],
      footStyles,
    });
  } else if (breakdown.payType === 'per_mile') {
    const widths = { date: 58, load: 60, origin: 130, dest: 130, miles: 50, rate: 50, amt: 54 };
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Load #', 'Origin', 'Destination', 'Miles', 'Rate', 'Amount']],
      body:
        breakdown.loads.length === 0
          ? [['—', '—', 'No completed loads in this period', '', '—', '—', formatCurrency(0)]]
          : breakdown.loads.map((l) => {
              const mi = Number(l.booked_miles ?? l.actual_miles ?? 0);
              return [
                fmtDateShort(l.delivery_date),
                safe(l.landstar_load_id || String(l.id).slice(0, 8)),
                safe(l.origin ?? ''),
                safe(l.destination ?? ''),
                fmtMiles(mi),
                `$${breakdown.payRate.toFixed(2)}/mi`,
                formatCurrency(mi * breakdown.payRate),
              ];
            }),
      headStyles,
      styles: baseStyles,
      alternateRowStyles: alt,
      columnStyles: {
        0: { cellWidth: widths.date },
        1: { cellWidth: widths.load },
        2: { cellWidth: widths.origin },
        3: { cellWidth: widths.dest },
        4: { cellWidth: widths.miles, halign: 'right' },
        5: { cellWidth: widths.rate, halign: 'right' },
        6: { cellWidth: widths.amt, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      foot: [
        [
          { content: 'Totals', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
          { content: `${fmtMiles(breakdown.totalLoadedMiles)} mi`, styles: { halign: 'right', fontStyle: 'bold' } },
          { content: '', styles: {} },
          { content: formatCurrency(breakdown.basePay), styles: { halign: 'right', fontStyle: 'bold' } },
        ],
      ],
      footStyles,
    });
  } else if (breakdown.payType === 'percentage') {
    const pct = breakdown.payRate;
    const split = breakdown.truckSplit;
    const widths = { date: 56, load: 56, origin: 116, dest: 116, lh: 60, split: 64, drv: 64 };
    autoTable(doc, {
      startY: y,
      head: [
        [
          'Date',
          'Load #',
          'Origin',
          'Destination',
          'Linehaul',
          `After ${(split * 100).toFixed(0)}% Split`,
          `Driver ${pct}%`,
        ],
      ],
      body:
        breakdown.loads.length === 0
          ? [['—', '—', 'No completed loads in this period', '', '—', '—', formatCurrency(0)]]
          : breakdown.loads.map((l) => {
              const linehaul = Number(l.rate ?? 0);
              const afterSplit = linehaul * split;
              const driverShare = afterSplit * (pct / 100);
              return [
                fmtDateShort(l.delivery_date),
                safe(l.landstar_load_id || String(l.id).slice(0, 8)),
                safe(l.origin ?? ''),
                safe(l.destination ?? ''),
                formatCurrency(linehaul),
                formatCurrency(afterSplit),
                formatCurrency(driverShare),
              ];
            }),
      headStyles,
      styles: baseStyles,
      alternateRowStyles: alt,
      columnStyles: {
        0: { cellWidth: widths.date },
        1: { cellWidth: widths.load },
        2: { cellWidth: widths.origin },
        3: { cellWidth: widths.dest },
        4: { cellWidth: widths.lh, halign: 'right' },
        5: { cellWidth: widths.split, halign: 'right' },
        6: { cellWidth: widths.drv, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      foot: [
        [
          { content: 'Totals', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
          { content: formatCurrency(breakdown.totalLinehaul), styles: { halign: 'right', fontStyle: 'bold' } },
          { content: formatCurrency(breakdown.totalAfterSplit), styles: { halign: 'right', fontStyle: 'bold' } },
          { content: formatCurrency(breakdown.basePay), styles: { halign: 'right', fontStyle: 'bold' } },
        ],
      ],
      footStyles,
    });
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Description', 'Amount']],
      body: [['Base Pay', formatCurrency(breakdown.basePay)]],
      headStyles,
      styles: baseStyles,
      alternateRowStyles: alt,
      columnStyles: {
        0: { cellWidth: contentW - 120 },
        1: { cellWidth: 120, halign: 'right', fontStyle: 'bold' },
      },
      margin: { left: margin, right: margin },
      tableWidth: contentW,
    });
  }

  y = (doc as any).lastAutoTable.finalY + 18;

  // ---------- Reimbursements table ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Reimbursements', margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Description', 'Amount']],
    body:
      reimbItems.length === 0
        ? [['No reimbursements in this period', formatCurrency(0)]]
        : reimbItems.map((i: any) => [
            safe(i.description || '—'),
            formatCurrency(Number(i.amount ?? 0)),
          ]),
    headStyles,
    styles: baseStyles,
    alternateRowStyles: alt,
    columnStyles: {
      0: { cellWidth: contentW - 120 },
      1: { cellWidth: 120, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    foot: [
      [
        { content: 'Total Reimbursements', styles: { halign: 'right', fontStyle: 'bold' } },
        {
          content: formatCurrency(Number(s.reimbursements ?? 0)),
          styles: { halign: 'right', fontStyle: 'bold' },
        },
      ],
    ],
    footStyles,
  });

  y = (doc as any).lastAutoTable.finalY + 22;

  // ---------- Summary + YTD side-by-side ----------
  const blockHeight = 30 + 3 * 22 + 24;
  if (y + blockHeight > H - 90) {
    doc.addPage();
    y = margin;
  }

  const colW = (contentW - 16) / 2;

  const drawBlock = (
    x: number,
    title: string,
    rows: [string, string][],
    highlightLast = false,
  ) => {
    const h = 30 + rows.length * 22;
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.rect(x, y, colW, h, 'FD');

    doc.setFillColor(15, 23, 42);
    doc.rect(x, y, colW, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(safe(title), x + 10, y + 15);

    doc.setTextColor(15, 23, 42);
    let ry = y + 38;
    rows.forEach(([label, val], idx) => {
      const isLast = highlightLast && idx === rows.length - 1;
      if (isLast) {
        doc.setDrawColor(226, 232, 240);
        doc.line(x + 10, ry - 12, x + colW - 10, ry - 12);
      }
      doc.setFont('helvetica', isLast ? 'bold' : 'normal');
      doc.setFontSize(isLast ? 11 : 10);
      doc.setTextColor(isLast ? 15 : 71, isLast ? 23 : 85, isLast ? 42 : 105);
      doc.text(safe(label), x + 10, ry);
      doc.setTextColor(15, 23, 42);
      doc.text(safe(val), x + colW - 10, ry, { align: 'right' });
      ry += 22;
    });
    return h;
  };

  drawBlock(
    margin,
    'CURRENT PERIOD',
    [
      ['Gross Pay', formatCurrency(Number(s.gross_pay ?? 0))],
      ['Reimbursements', formatCurrency(Number(s.reimbursements ?? 0))],
      ['Net Pay', formatCurrency(Number(s.net_pay ?? 0))],
    ],
    true,
  );
  drawBlock(
    margin + colW + 16,
    'YEAR-TO-DATE',
    [
      ['YTD Gross', formatCurrency(Number(s.ytd_gross ?? 0))],
      ['YTD Reimbursements', formatCurrency(Number(s.ytd_reimbursements ?? 0))],
      ['YTD Net Pay', formatCurrency(Number(s.ytd_net ?? 0))],
    ],
    true,
  );

  const blocksH = 30 + 3 * 22;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Net Pay = Gross Pay + Reimbursements',
    margin,
    y + blocksH + 14,
  );

  // ---------- Footer (every page) ----------
  const taxNote = isContractor
    ? 'This settlement reflects payment for independent contractor services. No federal, state, or local taxes have been withheld. The recipient is responsible for all applicable self-employment and income tax obligations.'
    : 'This settlement reflects gross wages. Tax withholdings, deductions, and benefits are reported separately on the employee pay statement and annual W-2.';

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const footerY = H - 72;

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, footerY, W - margin, footerY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    const wrapped = doc.splitTextToSize(safe(taxNote), contentW);
    doc.text(wrapped, margin, footerY + 12);

    const contactLine = payrollContact
      ? `For payroll inquiries or disputes, contact: ${payrollContact}`
      : 'For payroll inquiries or disputes, please contact your dispatcher or payroll administrator.';
    const contactWrapped = doc.splitTextToSize(safe(contactLine), contentW);
    doc.text(contactWrapped, margin, footerY + 12 + wrapped.length * 10);

    doc.setFontSize(7);
    doc.setTextColor(140, 148, 165);
    doc.text(`Generated ${format(new Date(), 'PPpp')}`, margin, H - 16);
    doc.text(`Page ${p} of ${pageCount}`, W - margin, H - 16, { align: 'right' });
  }

  const lastName = (driver?.last_name || 'Driver').replace(/\s+/g, '_');
  doc.save(`Settlement_${lastName}_${s.period_end}.pdf`);
}
