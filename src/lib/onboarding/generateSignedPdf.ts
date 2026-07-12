import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import { extractStateFromAddress } from '@/lib/us-states';
import { formatPayRate, payTypeLabel, type DriverPayType } from '@/lib/pay-format';

const COMPANY_ADDRESS = '4700 Diplomacy Rd, Fort Worth, TX 76155';
const TOKEN_REGEX =
  /\{\{\s*(today_date|company_address|driver_address|cdl_number|contractor_state|owner_signature|driver_signature|license_number|license_expiry|dot_medical_expiry|endorsements_list|twic_status|pay_type|pay_rate|ssn|email|bank_account_type|bank_name|routing_number|account_number)\s*\}\}/g;


export interface GenerateSignedPdfArgs {
  title: string;
  content: string;
  driverAddress: string;
  signature: string | null;
  driverName: string;
  cdlNumber: string;
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
  medicalCardExpiry?: string | null;
  endorsements?: string[] | null;
  hasTwic?: boolean | null;
  twicExpiry?: string | null;
  payType?: DriverPayType;
  payRate?: number | null;
  ssn?: string;
  email?: string;
  bankName?: string;
  routingNumber?: string;
  accountNumber?: string;
  bankAccountType?: 'checking' | 'savings' | '';
  /** When false, the ssn and account_number tokens render the full digits. Default true (redacted). */
  redact?: boolean;
}


function formatDateToken(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'MMMM d, yyyy');
}

// --- Markdown rendering constants ---
const BODY_SIZE = 11;
const H1_SIZE = 18;
const H2_SIZE = 15;
const H3_SIZE = 13;
const BODY_LH = 16;
const H1_LH = 24;
const H2_LH = 20;
const H3_LH = 18;
const PARAGRAPH_GAP = 6;
const LIST_INDENT = 18;
const QUOTE_INDENT = 14;
const HR_COLOR = 200;

type InlineStyle = { bold: boolean; italic: boolean; code: boolean };
type InlineRun = { text: string; style: InlineStyle };

/** Parse inline markdown (bold/italic/code, with escapes) into styled runs. */
function parseInline(text: string): InlineRun[] {
  const runs: InlineRun[] = [];
  let i = 0;
  let bold = false;
  let italic = false;
  let code = false;
  let buf = '';
  const flush = () => {
    if (buf) {
      runs.push({ text: buf, style: { bold, italic, code } });
      buf = '';
    }
  };
  while (i < text.length) {
    const ch = text[i];
    // Escape
    if (ch === '\\' && i + 1 < text.length) {
      buf += text[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      flush();
      code = !code;
      i += 1;
      continue;
    }
    if (!code) {
      // ***bold+italic***
      if (text.startsWith('***', i)) {
        flush();
        bold = !bold;
        italic = !italic;
        i += 3;
        continue;
      }
      // **bold** or __bold__
      if (text.startsWith('**', i) || text.startsWith('__', i)) {
        flush();
        bold = !bold;
        i += 2;
        continue;
      }
      // *italic* or _italic_
      if (ch === '*' || ch === '_') {
        flush();
        italic = !italic;
        i += 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return runs;
}

/**
 * Build a PDF where template tokens are replaced with the captured values.
 * `{{driver_signature}}` is embedded as a PNG; other tokens render as inline text.
 * Markdown formatting (#, **, *, -, 1., ---, >, `) is rendered, not shown literally.
 */
export function generateSignedPdf({
  title,
  content,
  driverAddress,
  signature,
  driverName,
  cdlNumber,
  licenseNumber,
  licenseExpiry,
  medicalCardExpiry,
  endorsements,
  hasTwic,
  twicExpiry,
  payType = null,
  payRate = null,
  ssn,
  email,
  bankName,
  routingNumber,
  accountNumber,
  bankAccountType,
  redact = true,

}: GenerateSignedPdfArgs): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 54;
  const marginTop = 60;
  const marginBottom = 60;
  const maxWidth = pageWidth - marginX * 2;
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
  doc.setFontSize(BODY_SIZE);

  const ensureRoom = (needed: number) => {
    if (y + needed > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  const applyFont = (size: number, style: InlineStyle, blockBold = false) => {
    if (style.code) {
      doc.setFont('courier', style.bold || blockBold ? 'bold' : 'normal');
    } else {
      const wantBold = style.bold || blockBold;
      const wantItalic = style.italic;
      const variant = wantBold && wantItalic
        ? 'bolditalic'
        : wantBold
          ? 'bold'
          : wantItalic
            ? 'italic'
            : 'normal';
      doc.setFont('helvetica', variant);
    }
    doc.setFontSize(size);
  };

  /** Draw a sequence of inline runs, wrapping within [x0, x0+width]. */
  const drawRuns = (
    runs: InlineRun[],
    opts: {
      size: number;
      lineHeight: number;
      x0: number;
      width: number;
      blockBold?: boolean;
      hangingIndent?: number;
    },
  ) => {
    const { size, lineHeight, x0, width, blockBold = false, hangingIndent = 0 } = opts;
    let cursorX = x0;
    let firstLine = true;
    const lineLimit = x0 + width;
    ensureRoom(lineHeight);

    const newline = () => {
      y += lineHeight;
      ensureRoom(lineHeight);
      cursorX = firstLine ? x0 + hangingIndent : x0 + hangingIndent;
      firstLine = false;
    };

    for (const run of runs) {
      if (!run.text) continue;
      applyFont(size, run.style, blockBold);
      // Split run on spaces while preserving them, so we can wrap by word.
      const parts = run.text.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        const w = doc.getTextWidth(part);
        if (cursorX + w > lineLimit && cursorX > x0 + (firstLine ? 0 : hangingIndent)) {
          // wrap
          if (/^\s+$/.test(part)) {
            newline();
            continue;
          }
          newline();
        }
        // If a single word exceeds the line, draw it anyway.
        doc.text(part, cursorX, y);
        cursorX += w;
      }
    }
    y += lineHeight;
  };

  /** Render a markdown string as block-level content. */
  const renderMarkdown = (md: string) => {
    if (!md) return;
    // Normalize CRLF and split into lines (preserve blank lines).
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    let inList = false;

    for (let idx = 0; idx < lines.length; idx++) {
      const raw = lines[idx];
      const line = raw.replace(/\s+$/, '');

      // Blank line → paragraph break
      if (line.trim() === '') {
        y += PARAGRAPH_GAP;
        inList = false;
        continue;
      }

      // Horizontal rule
      if (/^\s*(?:-\s*-\s*-+|\*\s*\*\s*\*+|_\s*_\s*_+)\s*$/.test(line)) {
        y += 6;
        ensureRoom(12);
        doc.setDrawColor(HR_COLOR);
        doc.line(marginX, y, marginX + maxWidth, y);
        y += 10;
        inList = false;
        continue;
      }

      // Headings
      const hMatch = /^(#{1,3})\s+(.*)$/.exec(line);
      if (hMatch) {
        const level = hMatch[1].length;
        const size = level === 1 ? H1_SIZE : level === 2 ? H2_SIZE : H3_SIZE;
        const lh = level === 1 ? H1_LH : level === 2 ? H2_LH : H3_LH;
        y += 4;
        drawRuns(parseInline(hMatch[2]), {
          size,
          lineHeight: lh,
          x0: marginX,
          width: maxWidth,
          blockBold: true,
        });
        y += 2;
        inList = false;
        continue;
      }

      // Blockquote
      const qMatch = /^\s*>\s?(.*)$/.exec(line);
      if (qMatch) {
        const lineStartY = y;
        applyFont(BODY_SIZE, { bold: false, italic: true, code: false });
        drawRuns(
          parseInline(qMatch[1]).map((r) => ({ ...r, style: { ...r.style, italic: true } })),
          {
            size: BODY_SIZE,
            lineHeight: BODY_LH,
            x0: marginX + QUOTE_INDENT,
            width: maxWidth - QUOTE_INDENT,
          },
        );
        // Left bar
        doc.setDrawColor(180);
        doc.setLineWidth(2);
        doc.line(marginX + 4, lineStartY - BODY_LH + 4, marginX + 4, y - 2);
        doc.setLineWidth(0.2);
        inList = false;
        continue;
      }

      // Unordered list
      const ulMatch = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (ulMatch) {
        applyFont(BODY_SIZE, { bold: false, italic: false, code: false });
        ensureRoom(BODY_LH);
        doc.text('•', marginX + 4, y);
        drawRuns(parseInline(ulMatch[1]), {
          size: BODY_SIZE,
          lineHeight: BODY_LH,
          x0: marginX + LIST_INDENT,
          width: maxWidth - LIST_INDENT,
        });
        inList = true;
        continue;
      }

      // Ordered list
      const olMatch = /^\s*(\d+)\.\s+(.*)$/.exec(line);
      if (olMatch) {
        applyFont(BODY_SIZE, { bold: false, italic: false, code: false });
        ensureRoom(BODY_LH);
        const marker = `${olMatch[1]}.`;
        doc.text(marker, marginX + 2, y);
        drawRuns(parseInline(olMatch[2]), {
          size: BODY_SIZE,
          lineHeight: BODY_LH,
          x0: marginX + LIST_INDENT + 4,
          width: maxWidth - LIST_INDENT - 4,
        });
        inList = true;
        continue;
      }

      // Default paragraph line
      drawRuns(parseInline(line), {
        size: BODY_SIZE,
        lineHeight: BODY_LH,
        x0: marginX,
        width: maxWidth,
      });
      inList = false;
    }
  };

  // Split content on {{page_break}} so each chunk becomes a fresh PDF page.
  const chunks = content.split(/\{\{\s*page_break\s*\}\}/);

  for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
    if (chunkIdx > 0) {
      doc.addPage();
      y = marginTop;
    }
    const chunkContent = chunks[chunkIdx];

    // Walk template chunk, replacing tokens
    const segments: Array<{ kind: 'text' | 'token'; value: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    TOKEN_REGEX.lastIndex = 0;
    while ((match = TOKEN_REGEX.exec(chunkContent)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ kind: 'text', value: chunkContent.slice(lastIndex, match.index) });
      }
      segments.push({ kind: 'token', value: match[1] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < chunkContent.length) {
      segments.push({ kind: 'text', value: chunkContent.slice(lastIndex) });
    }

    let buffer = '';
    const flush = () => {
      if (buffer) {
        renderMarkdown(buffer);
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
        case 'cdl_number':
          buffer += cdlNumber || '________________________';
          break;
        case 'contractor_state':
          buffer += extractStateFromAddress(driverAddress) || '____';
          break;
        case 'owner_signature':
          buffer += '[Owner Signature Pending]';
          break;
        case 'driver_signature': {
          flush();
          y += 8;
          ensureRoom(120);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(BODY_SIZE);
          if (signature) {
            try {
              doc.addImage(signature, 'PNG', marginX, y, 200, 70);
            } catch {
              doc.text('[signature]', marginX, y + 20);
            }
            y += 74;
          } else {
            doc.text('________________________', marginX, y + 20);
            y += 26;
          }
          // Printed Name / Title / Date Signed — mirrors owner signature block.
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.text(`Printed Name: ${driverName || '________________________'}`, marginX, y);
          y += 12;
          doc.text('Title: Employee / Driver', marginX, y);
          y += 12;
          doc.text(`Date Signed: ${todayFormatted}`, marginX, y);
          y += 14;
          break;
        }
        case 'license_number':
          buffer += licenseNumber || '________________________';
          break;
        case 'license_expiry':
          buffer += formatDateToken(licenseExpiry) || '________________________';
          break;
        case 'dot_medical_expiry':
          buffer += formatDateToken(medicalCardExpiry) || '________________________';
          break;
        case 'endorsements_list':
          buffer += endorsements && endorsements.length > 0 ? endorsements.join(', ') : 'None';
          break;
        case 'twic_status': {
          if (hasTwic == null) {
            buffer += '________________________';
          } else if (!hasTwic) {
            buffer += 'No';
          } else {
            const t = formatDateToken(twicExpiry);
            buffer += t ? `Yes — expires ${t}` : 'Yes';
          }
          break;
        }
        case 'pay_type':
          buffer += payType ? payTypeLabel(payType) : '[TERMS NOT SET - CONTACT HIRING MANAGER]';
          break;
        case 'pay_rate':
          buffer += payType && payRate != null
            ? formatPayRate(payType, payRate)
            : '[TERMS NOT SET - CONTACT HIRING MANAGER]';
          break;
        case 'ssn': {
          const digits = (ssn || '').replace(/\D/g, '');
          if (!redact && digits.length === 9) {
            buffer += `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
          } else if (digits.length >= 4) {
            buffer += `***-**-${digits.slice(-4)}`;
          } else {
            buffer += '________________________';
          }
          break;
        }
        case 'email':
          buffer += email || '________________________';
          break;
        case 'bank_name':
          buffer += bankName || '________________________';
          break;
        case 'bank_account_type':
          buffer += bankAccountType
            ? bankAccountType.charAt(0).toUpperCase() + bankAccountType.slice(1)
            : '________________________';
          break;
        case 'routing_number':
          buffer += routingNumber || '________________________';
          break;
        case 'account_number': {
          const digits = (accountNumber || '').replace(/\D/g, '');
          if (!redact && digits.length > 0) {
            buffer += digits;
          } else if (digits.length >= 4) {
            buffer += `****${digits.slice(-4)}`;
          } else {
            buffer += '________________________';
          }
          break;
        }
      }
    }
    flush();
  }

  // Footer
  y += 24;
  ensureRoom(40);
  doc.setDrawColor(200);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Signed by: ${driverName}`, marginX, y);
  doc.text(signedAt, pageWidth - marginX, y, { align: 'right' });

  return doc.output('blob');
}
