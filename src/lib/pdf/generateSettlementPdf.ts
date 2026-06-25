import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/formatters';

const fmtDate = (d?: string | null) =>
  d ? format(parseISO(`${d}T00:00:00`), 'MMM d, yyyy') : '—';

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

export async function generateSettlementPdf(settlementId: string): Promise<void> {
  const { data: settlement, error: sErr } = await supabase
    .from('driver_settlements')
    .select('*')
    .eq('id', settlementId)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!settlement) throw new Error('Settlement not found');

  const s: any = settlement;

  const [{ data: driver }, { data: org }, { data: items }] = await Promise.all([
    supabase
      .from('drivers')
      .select('first_name, last_name, email, phone')
      .eq('id', s.driver_id)
      .maybeSingle(),
    supabase
      .from('organizations')
      .select('name, logo_url')
      .eq('id', s.org_id)
      .maybeSingle(),
    supabase
      .from('driver_settlement_items')
      .select('id, item_type, amount, description, load_id, expense_id')
      .eq('settlement_id', settlementId),
  ]);

  const loadItems = (items ?? []).filter((i: any) => i.item_type === 'load_pay');
  const reimbItems = (items ?? []).filter((i: any) => i.item_type === 'reimbursement');

  // Fetch underlying loads & expenses for richer rows
  const loadIds = loadItems.map((i: any) => i.load_id).filter(Boolean);
  const expIds = reimbItems.map((i: any) => i.expense_id).filter(Boolean);

  const [{ data: loads }, { data: expenses }] = await Promise.all([
    loadIds.length
      ? supabase
          .from('fleet_loads')
          .select('id, landstar_load_id, origin, destination, actual_miles, booked_miles, rate, delivery_date')
          .in('id', loadIds)
      : Promise.resolve({ data: [] as any[] }),
    expIds.length
      ? supabase
          .from('expenses')
          .select('id, expense_type, description, expense_date, amount')
          .in('id', expIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const loadMap = new Map<string, any>((loads ?? []).map((l: any) => [l.id, l]));
  const expMap = new Map<string, any>((expenses ?? []).map((e: any) => [e.id, e]));

  const logoData = await loadLogo(org?.logo_url);

  const driverName = `${driver?.first_name ?? ''} ${driver?.last_name ?? ''}`.trim() || 'Driver';
  const orgName = org?.name ?? 'Company';

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 90, 'F');

  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', margin, 18, 54, 54);
    } catch {
      /* ignore */
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(orgName, logoData ? margin + 68 : margin, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('SETTLEMENT STATEMENT', logoData ? margin + 68 : margin, 60);

  // Right side: driver block
  doc.setFontSize(10);
  const rx = W - margin;
  doc.setFont('helvetica', 'bold');
  doc.text(driverName, rx, 32, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  if (driver?.email) doc.text(driver.email, rx, 46, { align: 'right' });
  if (driver?.phone) doc.text(driver.phone, rx, 60, { align: 'right' });

  // Period strip
  let y = 110;
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Pay Period:', margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`${fmtDate(s.period_start)} – ${fmtDate(s.period_end)}`, margin + 70, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Payment Date:', W / 2, y);
  doc.setFont('helvetica', 'normal');
  doc.text(fmtDate(s.payment_date), W / 2 + 85, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Status:', rx - 80, y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(s.status || 'draft').toUpperCase(), rx, y, { align: 'right' });

  y += 16;

  // Earnings table
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Load #', 'Origin → Destination', 'Miles', 'Rate', 'Amount']],
    body:
      loadItems.length === 0
        ? [['—', '—', 'No load earnings in this period', '—', '—', formatCurrency(0)]]
        : loadItems.map((i: any) => {
            const l = loadMap.get(i.load_id) || {};
            const miles = l.actual_miles ?? l.booked_miles ?? '';
            return [
              fmtDate(l.delivery_date),
              l.landstar_load_id || (l.id ? String(l.id).slice(0, 8) : '—'),
              `${l.origin ?? ''} → ${l.destination ?? ''}`.trim() === '→' ? '—' : `${l.origin ?? ''} → ${l.destination ?? ''}`,
              miles !== '' ? String(miles) : '—',
              l.rate != null ? formatCurrency(Number(l.rate)) : '—',
              formatCurrency(Number(i.amount ?? 0)),
            ];
          }),
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    margin: { left: margin, right: margin },
    didDrawPage: () => {
      // footer drawn at end
    },
  });

  y = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Gross Pay: ${formatCurrency(Number(s.gross_pay ?? 0))}`, rx, y, { align: 'right' });

  y += 18;

  // Reimbursements table
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Type', 'Description', 'Amount']],
    body:
      reimbItems.length === 0
        ? [['—', '—', 'No reimbursements in this period', formatCurrency(0)]]
        : reimbItems.map((i: any) => {
            const e = expMap.get(i.expense_id) || {};
            return [
              fmtDate(e.expense_date),
              e.expense_type || '—',
              e.description || i.description || '—',
              formatCurrency(Number(i.amount ?? 0)),
            ];
          }),
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: { 3: { halign: 'right' } },
    margin: { left: margin, right: margin },
  });

  y = (doc as any).lastAutoTable.finalY + 8;
  doc.setFont('helvetica', 'bold');
  doc.text(`Reimbursements: ${formatCurrency(Number(s.reimbursements ?? 0))}`, rx, y, {
    align: 'right',
  });

  y += 24;

  // Summary + YTD side-by-side
  const colW = (W - margin * 2 - 16) / 2;

  const drawBlock = (x: number, title: string, rows: [string, string][], highlightLast = false) => {
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    const h = 28 + rows.length * 20;
    doc.rect(x, y, colW, h, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text(title, x + 10, y + 18);
    doc.setFont('helvetica', 'normal');
    let ry = y + 38;
    rows.forEach(([label, val], idx) => {
      const isLast = highlightLast && idx === rows.length - 1;
      doc.setFont('helvetica', isLast ? 'bold' : 'normal');
      doc.setFontSize(isLast ? 11 : 10);
      doc.text(label, x + 10, ry);
      doc.text(val, x + colW - 10, ry, { align: 'right' });
      ry += 20;
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

  // Footer on every page
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(`Generated ${format(new Date(), 'PPpp')}`, margin, H - 24);
    doc.text(`Page ${p} of ${pageCount}`, W - margin, H - 24, { align: 'right' });
  }

  const lastName = (driver?.last_name || 'Driver').replace(/\s+/g, '_');
  doc.save(`Settlement_${lastName}_${s.period_end}.pdf`);
}
