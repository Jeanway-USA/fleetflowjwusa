import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/formatters';

const fmtDate = (d?: string | null) =>
  d ? format(parseISO(`${d}T00:00:00`), 'MMM d, yyyy') : '—';

const fmtDateShort = (d?: string | null) =>
  d ? format(parseISO(`${d}T00:00:00`), 'MM/dd/yyyy') : '—';

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
          'first_name, last_name, email, phone, landstar_operator_id, hire_date, pay_type',
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

  const loadItems = (items ?? []).filter((i: any) => i.item_type === 'load_pay');
  const reimbItems = (items ?? []).filter((i: any) => i.item_type === 'reimbursement');

  const loadIds = loadItems.map((i: any) => i.load_id).filter(Boolean);
  const { data: loads } = loadIds.length
    ? await supabase
        .from('fleet_loads')
        .select(
          'id, landstar_load_id, origin, destination, actual_miles, booked_miles, rate, delivery_date',
        )
        .in('id', loadIds)
    : { data: [] as any[] };

  const loadMap = new Map<string, any>((loads ?? []).map((l: any) => [l.id, l]));

  // Chronological order by delivery date
  const sortedLoads = [...loadItems].sort((a: any, b: any) => {
    const da = loadMap.get(a.load_id)?.delivery_date ?? '';
    const db = loadMap.get(b.load_id)?.delivery_date ?? '';
    return da.localeCompare(db);
  });

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

  // ---------- Header band ----------
  const HEADER_H = 110;
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, HEADER_H, 'F');

  // Left: logo + company
  let leftX = margin;
  if (logoData) {
    try {
      doc.addImage(logoData, logoFmt, margin, 20, 60, 60);
      leftX = margin + 72;
    } catch {
      /* ignore */
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(orgName, leftX, 38);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let leftY = 54;
  if (companyAddress) {
    companyAddress.split(/\r?\n/).forEach((line) => {
      doc.text(line, leftX, leftY);
      leftY += 11;
    });
  }
  const ids: string[] = [];
  if (org?.dot_number) ids.push(`USDOT ${org.dot_number}`);
  if (org?.mc_number) ids.push(`MC ${org.mc_number}`);
  if (ids.length) {
    doc.text(ids.join('  ·  '), leftX, leftY);
  }

  // Right: driver block
  const rx = W - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(driverName, rx, 32, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let rightY = 46;
  if (driverIdLabel) {
    doc.text(driverIdLabel, rx, rightY, { align: 'right' });
    rightY += 11;
  }
  if (driver?.email) {
    doc.text(driver.email, rx, rightY, { align: 'right' });
    rightY += 11;
  }
  if (driver?.phone) {
    doc.text(driver.phone, rx, rightY, { align: 'right' });
    rightY += 11;
  }

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

  // Period info grid
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text('PAY PERIOD', margin, y);
  doc.text('PAYMENT DATE', margin + 200, y);
  doc.text('STATUS', rx - 60, y);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(
    `${fmtDate(s.period_start)} – ${fmtDate(s.period_end)}`,
    margin,
    y + 14,
  );
  doc.text(fmtDate(s.payment_date), margin + 200, y + 14);
  doc.text(String(s.status || 'draft').toUpperCase(), rx, y + 14, {
    align: 'right',
  });

  y += 30;

  // ---------- Earnings table ----------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Load Earnings', margin, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Load #', 'Origin → Destination', 'Miles', 'Linehaul', 'Amount']],
    body:
      sortedLoads.length === 0
        ? [['—', '—', 'No load earnings in this period', '—', '—', formatCurrency(0)]]
        : sortedLoads.map((i: any) => {
            const l = loadMap.get(i.load_id) || {};
            const miles = l.actual_miles ?? l.booked_miles ?? '';
            const od = `${l.origin ?? ''} → ${l.destination ?? ''}`;
            return [
              fmtDateShort(l.delivery_date),
              l.landstar_load_id || (l.id ? String(l.id).slice(0, 8) : '—'),
              od.trim() === '→' ? '—' : od,
              miles !== '' ? String(miles) : '—',
              l.rate != null ? formatCurrency(Number(l.rate)) : '—',
              formatCurrency(Number(i.amount ?? 0)),
            ];
          }),
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
      fontSize: 9,
      halign: 'left',
    },
    styles: { fontSize: 9, cellPadding: 5, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
    foot: [
      [
        { content: 'Gross Pay', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
        {
          content: formatCurrency(Number(s.gross_pay ?? 0)),
          styles: { halign: 'right', fontStyle: 'bold' },
        },
      ],
    ],
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
  });

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
            i.description || '—',
            formatCurrency(Number(i.amount ?? 0)),
          ]),
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
      fontSize: 9,
      halign: 'left',
    },
    styles: { fontSize: 9, cellPadding: 5, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold', cellWidth: 110 } },
    margin: { left: margin, right: margin },
    foot: [
      [
        {
          content: 'Total Reimbursements',
          styles: { halign: 'right', fontStyle: 'bold' },
        },
        {
          content: formatCurrency(Number(s.reimbursements ?? 0)),
          styles: { halign: 'right', fontStyle: 'bold' },
        },
      ],
    ],
    footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42] },
  });

  y = (doc as any).lastAutoTable.finalY + 22;

  // ---------- Summary + YTD side-by-side ----------
  // Page-break guard
  const blockHeight = 28 + 3 * 20 + 12;
  if (y + blockHeight > H - 90) {
    doc.addPage();
    y = margin;
  }

  const colW = (W - margin * 2 - 16) / 2;

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

    // Title bar
    doc.setFillColor(15, 23, 42);
    doc.rect(x, y, colW, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(title, x + 10, y + 15);

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
      doc.text(label, x + 10, ry);
      doc.setTextColor(15, 23, 42);
      doc.text(val, x + colW - 10, ry, { align: 'right' });
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
    const wrapped = doc.splitTextToSize(taxNote, W - margin * 2);
    doc.text(wrapped, margin, footerY + 12);

    const contactLine = payrollContact
      ? `For payroll inquiries or disputes, contact: ${payrollContact}`
      : 'For payroll inquiries or disputes, please contact your dispatcher or payroll administrator.';
    const contactWrapped = doc.splitTextToSize(contactLine, W - margin * 2);
    doc.text(contactWrapped, margin, footerY + 12 + wrapped.length * 9);

    doc.setFontSize(7);
    doc.setTextColor(140, 148, 165);
    doc.text(
      `Generated ${format(new Date(), 'PPpp')}`,
      margin,
      H - 16,
    );
    doc.text(`Page ${p} of ${pageCount}`, W - margin, H - 16, { align: 'right' });
  }

  const lastName = (driver?.last_name || 'Driver').replace(/\s+/g, '_');
  doc.save(`Settlement_${lastName}_${s.period_end}.pdf`);
}
