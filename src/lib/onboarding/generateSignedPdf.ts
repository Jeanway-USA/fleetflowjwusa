import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

const COMPANY_ADDRESS = '4700 Diplomacy Rd, Fort Worth, TX 76155';
const TOKEN_REGEX =
  /\{\{\s*(today_date|company_address|driver_address|driver_name|owner_signature|driver_signature)\s*\}\}/g;

export interface GenerateSignedPdfArgs {
  title: string;
  content: string;
  driverAddress: string;
  signature: string | null;
  driverName: string;
}

/**
 * Build a PDF where template tokens are replaced with the captured values.
 * `{{driver_signature}}` is embedded as a PNG; other tokens render as inline text.
 */
export function generateSignedPdf({
  title,
  content,
  driverAddress,
  signature,
  driverName,
}: GenerateSignedPdfArgs): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 54;
  const marginTop = 60;
  const marginBottom = 60;
  const maxWidth = pageWidth - marginX * 2;
  const lineHeight = 16;
  const todayFormatted = format(new Date(), 'MMMM d, yyyy');
  const signedAt = format(new Date(), "MMMM d, yyyy 'at' h:mm a");

  let y = marginTop;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(title, marginX, y);
  y += 22;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Signed on ${signedAt}`, marginX, y);
  y += 24;
  doc.setTextColor(0);
  doc.setFontSize(11);

  const ensureRoom = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  const writeText = (text: string) => {
    if (!text) return;
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      ensureRoom(lineHeight);
      doc.text(line, marginX, y);
      y += lineHeight;
    }
  };

  // Walk template, replacing tokens
  const segments: Array<{ kind: 'text' | 'token'; value: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_REGEX.lastIndex = 0;
  while ((match = TOKEN_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', value: content.slice(lastIndex, match.index) });
    }
    segments.push({ kind: 'token', value: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ kind: 'text', value: content.slice(lastIndex) });
  }

  let buffer = '';
  const flush = () => {
    if (buffer) {
      writeText(buffer);
      buffer = '';
    }
  };

  for (const seg of segments) {
    if (seg.kind === 'text') {
      buffer += seg.value;
      continue;
    }
    switch (seg.value) {
      case 'today_date':
        buffer += todayFormatted;
        break;
      case 'company_address':
        buffer += COMPANY_ADDRESS;
        break;
      case 'driver_address':
        buffer += driverAddress || '________________________';
        break;
      case 'driver_name':
        buffer += driverName || '________________________';
        break;
      case 'owner_signature':
        buffer += '[Owner Signature Pending]';
        break;
      case 'driver_signature': {
        flush();
        y += 8;
        ensureRoom(90);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Driver Signature:', marginX, y);
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        if (signature) {
          try {
            doc.addImage(signature, 'PNG', marginX, y, 200, 70);
          } catch {
            doc.text('[signature]', marginX, y + 20);
          }
          y += 78;
        } else {
          doc.text('________________________', marginX, y + 20);
          y += 30;
        }
        break;
      }
    }
  }
  flush();

  // Footer
  y += 24;
  ensureRoom(40);
  doc.setDrawColor(200);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 16;
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Signed by: ${driverName}`, marginX, y);
  doc.text(signedAt, pageWidth - marginX, y, { align: 'right' });

  return doc.output('blob');
}
