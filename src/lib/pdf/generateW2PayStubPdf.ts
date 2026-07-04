import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, numberToEnglishUsd } from '@/lib/formatters';

interface StubData {
  id: string;
  org_id: string;
  driver_id: string;
  period_start: string;
  period_end: string;
  payment_date: string | null;
  gross_pay: number;
  net_pay: number | null;
  federal_income_tax: number | null;
  social_security_tax: number | null;
  medicare_tax: number | null;
  additional_medicare_tax: number | null;
  employer_ss_tax: number | null;
  employer_medicare_tax: number | null;
  employer_fica_total: number | null;
  fl_suta_tax: number | null;
  fl_suta_wage_base_applied: number | null;
  filing_status: string | null;
  w4_extra_withholding: number | null;
  w4_dependents_amount: number | null;
  stub_pdf_path: string | null;
}

const fmtDate = (d?: string | null) =>
  d ? format(parseISO(`${d}T00:00:00`), 'MMM d, yyyy') : '—';

/**
 * Build a W-2 pay-stub PDF for a given driver_payroll row.
 * Uploads to the private `documents` bucket at
 *   payroll-stubs/{org_id}/{driver_id}/{payroll_id}.pdf
 * and stamps stub_pdf_path + stub_generated_at on the row (first time only).
 */
export async function generateW2PayStubPdf(payrollId: string): Promise<Blob> {
  const { data: stub, error } = await supabase
    .from('driver_payroll')
    .select('*')
    .eq('id', payrollId)
    .single();
  if (error || !stub) throw new Error(error?.message ?? 'Pay stub not found');

  const { data: driver } = await supabase
    .from('drivers')
    .select('first_name, last_name, email')
    .eq('id', (stub as any).driver_id)
    .maybeSingle();

  const { data: org } = await supabase
    .from('organizations')
    .select('name, logo_url')
    .eq('id', (stub as any).org_id)
    .maybeSingle();

  const s = stub as unknown as StubData;
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  let y = 15;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(org?.name ?? 'Employer', 14, y);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('W-2 Pay Statement', pageW - 14, y, { align: 'right' });
  y += 8;
  doc.setDrawColor(200);
  doc.line(14, y, pageW - 14, y);
  y += 6;

  // Employee + period info
  doc.setFontSize(10);
  doc.text(`Employee: ${driver?.first_name ?? ''} ${driver?.last_name ?? ''}`.trim(), 14, y);
  doc.text(`Pay Date: ${fmtDate(s.payment_date)}`, pageW - 14, y, { align: 'right' });
  y += 5;
  doc.text(`Filing Status: ${s.filing_status ?? 'single'}`, 14, y);
  doc.text(`Period: ${fmtDate(s.period_start)} – ${fmtDate(s.period_end)}`, pageW - 14, y, { align: 'right' });
  y += 8;

  // Earnings
  autoTable(doc, {
    startY: y,
    head: [['Earnings', 'Current']],
    body: [['Gross Pay', formatCurrency(Number(s.gross_pay ?? 0))]],
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // Employee withholdings
  const employeeRows: [string, string][] = [
    ['Federal Income Tax', formatCurrency(Number(s.federal_income_tax ?? 0))],
    ['Social Security (6.2%)', formatCurrency(Number(s.social_security_tax ?? 0))],
    ['Medicare (1.45%)', formatCurrency(Number(s.medicare_tax ?? 0))],
  ];
  if (Number(s.additional_medicare_tax ?? 0) > 0) {
    employeeRows.push(['Additional Medicare (0.9%)', formatCurrency(Number(s.additional_medicare_tax))]);
  }
  const employeeTotal =
    Number(s.federal_income_tax ?? 0) +
    Number(s.social_security_tax ?? 0) +
    Number(s.medicare_tax ?? 0) +
    Number(s.additional_medicare_tax ?? 0);
  employeeRows.push(['Total Employee Withholding', formatCurrency(employeeTotal)]);
  autoTable(doc, {
    startY: y,
    head: [['Employee Withholdings', 'Amount']],
    body: employeeRows,
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 10 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === employeeRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // Net pay banner
  doc.setFillColor(5, 150, 105);
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.rect(14, y, pageW - 28, 12, 'F');
  doc.text('Net Pay', 18, y + 8);
  doc.text(formatCurrency(Number(s.net_pay ?? 0)), pageW - 18, y + 8, { align: 'right' });
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  y += 16;
  doc.setFontSize(9);
  doc.text(numberToEnglishUsd(Number(s.net_pay ?? 0)), 14, y);
  y += 8;

  // Employer accruals (informational; not deducted from net pay)
  autoTable(doc, {
    startY: y,
    head: [['Employer Tax Accruals (not deducted from employee)', 'Amount']],
    body: [
      ['Employer Social Security', formatCurrency(Number(s.employer_ss_tax ?? 0))],
      ['Employer Medicare', formatCurrency(Number(s.employer_medicare_tax ?? 0))],
      ['Employer FICA Match (7.65%)', formatCurrency(Number(s.employer_fica_total ?? 0))],
      [
        `FL Reemployment Tax (SUTA)`,
        formatCurrency(Number(s.fl_suta_tax ?? 0)),
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [148, 163, 184] },
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    'This pay statement is an immutable record generated by FleetFlow. Contact your payroll administrator with any questions.',
    14,
    y,
    { maxWidth: pageW - 28 },
  );

  const blob = doc.output('blob');

  // Upload to private bucket + stamp path (only once — immutable)
  if (!s.stub_pdf_path) {
    const path = `payroll-stubs/${s.org_id}/${s.driver_id}/${s.id}.pdf`;
    const { error: upErr } = await supabase.storage
      .from('documents')
      .upload(path, blob, { contentType: 'application/pdf', upsert: false });
    if (!upErr) {
      await supabase
        .from('driver_payroll')
        .update({ stub_pdf_path: path, stub_generated_at: new Date().toISOString() })
        .eq('id', s.id);
    }
  }

  return blob;
}

export async function downloadW2PayStub(payrollId: string, filename?: string) {
  const blob = await generateW2PayStubPdf(payrollId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? `pay-stub-${payrollId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
