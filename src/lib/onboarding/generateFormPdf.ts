import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

export interface FormPdfField {
  label: string;
  value: string;
}

export interface FormPdfSection {
  heading: string;
  fields: FormPdfField[];
  notes?: string[];
}

export interface GenerateFormPdfArgs {
  title: string;
  subtitle?: string;
  driverName: string;
  sections: FormPdfSection[];
  signatureLabel: string;
  signature: string | null;
}

/**
 * Renders a structured onboarding form (W-4, I-9, W-9, IOO, direct-deposit)
 * as a simple labeled PDF with an embedded signature image. Independent of the
 * markdown-template renderer used for admin-authored templates.
 */
export function generateFormPdf({
  title,
  subtitle,
  driverName,
  sections,
  signatureLabel,
  signature,
}: GenerateFormPdfArgs): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 54;
  const marginTop = 60;
  const marginBottom = 60;
  const maxWidth = pageWidth - marginX * 2;
  const signedAt = format(new Date(), "MMMM d, yyyy 'at' h:mm a");

  let y = marginTop;

  const ensureRoom = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(title, marginX, y);
  y += 22;
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(90);
    const wrapped = doc.splitTextToSize(subtitle, maxWidth) as string[];
    for (const line of wrapped) {
      ensureRoom(14);
      doc.text(line, marginX, y);
      y += 14;
    }
    doc.setTextColor(0);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Driver: ${driverName || '—'}`, marginX, y);
  y += 12;
  doc.text(`Signed on ${signedAt}`, marginX, y);
  y += 20;
  doc.setTextColor(0);

  for (const section of sections) {
    ensureRoom(28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(section.heading, marginX, y);
    y += 6;
    doc.setDrawColor(210);
    doc.setLineWidth(0.5);
    doc.line(marginX, y, marginX + maxWidth, y);
    y += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    for (const f of section.fields) {
      const labelText = `${f.label}: `;
      doc.setFont('helvetica', 'bold');
      const labelWidth = doc.getTextWidth(labelText);
      doc.setFont('helvetica', 'normal');
      const valueText = (f.value ?? '').toString() || '—';
      const wrapped = doc.splitTextToSize(valueText, maxWidth - labelWidth) as string[];
      ensureRoom(16 * Math.max(wrapped.length, 1));
      doc.setFont('helvetica', 'bold');
      doc.text(labelText, marginX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(wrapped[0] ?? '—', marginX + labelWidth, y);
      y += 16;
      for (let i = 1; i < wrapped.length; i++) {
        ensureRoom(16);
        doc.text(wrapped[i], marginX + labelWidth, y);
        y += 16;
      }
    }

    if (section.notes && section.notes.length > 0) {
      y += 4;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(90);
      for (const note of section.notes) {
        const wrapped = doc.splitTextToSize(note, maxWidth) as string[];
        for (const line of wrapped) {
          ensureRoom(13);
          doc.text(line, marginX, y);
          y += 13;
        }
      }
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
    }

    y += 14;
  }

  // Signature block
  ensureRoom(100);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(signatureLabel, marginX, y);
  y += 8;
  if (signature) {
    try {
      doc.addImage(signature, 'PNG', marginX, y, 220, 72);
      y += 78;
    } catch {
      doc.setFont('helvetica', 'normal');
      doc.text('[signature]', marginX, y + 20);
      y += 30;
    }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.text('________________________', marginX, y + 20);
    y += 30;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Signed ${signedAt}`, marginX, y);

  return doc.output('blob');
}
