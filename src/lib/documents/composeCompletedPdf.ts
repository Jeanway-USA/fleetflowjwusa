import { jsPDF } from 'jspdf';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

// pdfjs — use legacy build with the bundled worker resolved by Vite as a URL.
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

(pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = pdfjsWorker;

const OWNER_PLACEHOLDER = '[Owner Signature Pending]';

interface SignatureRow {
  id: string;
  signer_id: string;
  role_label: string;
  step_index: number;
  signature_data_url: string;
  signed_at: string;
}

interface SignerInfo {
  user_id: string;
  name: string;
  email: string | null;
}

const roleLabel = (r: string) =>
  r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Stand-alone signatures certificate for native (non-legacy) instances that
 * don't have a source PDF to overlay onto.
 */
function renderSignaturesPage(args: {
  title: string;
  signatures: Array<SignatureRow & { name: string }>;
  headline: string;
}): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 54;
  let y = 70;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(args.headline, marginX, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(110);
  doc.text(args.title, marginX, y);
  y += 26;
  doc.setTextColor(0);

  doc.setDrawColor(200);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 24;

  for (const s of args.signatures) {
    if (y > 680) {
      doc.addPage();
      y = 70;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(roleLabel(s.role_label), marginX, y);
    y += 14;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(`Signed by ${s.name}`, marginX, y);
    y += 12;
    doc.text(
      `On ${format(new Date(s.signed_at), "MMMM d, yyyy 'at' h:mm a")}`,
      marginX,
      y,
    );
    y += 6;
    doc.setTextColor(0);

    if (s.signature_data_url && s.signature_data_url.startsWith('data:image')) {
      try {
        doc.addImage(s.signature_data_url, 'PNG', marginX, y, 220, 70);
        y += 74;
      } catch {
        doc.text('[signature image could not be rendered]', marginX, y + 20);
        y += 30;
      }
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text('(No signature captured.)', marginX, y + 14);
      doc.setTextColor(0);
      y += 24;
    }

    y += 18;
    doc.setDrawColor(230);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 24;
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

interface PlaceholderHit {
  pageIndex: number; // 0-based
  x: number;
  y: number; // baseline in PDF user-space (bottom-left origin)
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

/**
 * Locate every occurrence of `[Owner Signature Pending]` in the PDF and
 * return their positions in PDF user-space coordinates.
 */
async function findOwnerPlaceholders(pdfBytes: Uint8Array): Promise<PlaceholderHit[]> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes } as never);
  const pdf = await loadingTask.promise;
  const hits: PlaceholderHit[] = [];

  for (let p = 0; p < pdf.numPages; p += 1) {
    const page = await pdf.getPage(p + 1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent({ includeMarkedContent: false });

    for (const item of content.items as Array<{
      str: string;
      transform: number[];
      width: number;
      height: number;
    }>) {
      if (!item.str || !item.str.includes(OWNER_PLACEHOLDER)) continue;
      const [a, , , d, e, f] = item.transform;
      hits.push({
        pageIndex: p,
        x: e,
        y: f,
        width: item.width || Math.abs(a) * item.str.length * 0.5,
        height: item.height || Math.abs(d) || 12,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
      });
    }
  }

  return hits;
}

function dataUrlToPngBytes(dataUrl: string): Uint8Array | null {
  const m = /^data:image\/png;base64,(.+)$/i.exec(dataUrl);
  if (!m) return null;
  const bin = atob(m[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Build a "completed" PDF for a signed document instance and upload it.
 */
export async function composeCompletedPdf(instanceId: string): Promise<string | null> {
  const { data: inst, error: iErr } = await supabase
    .from('document_instances')
    .select('id, org_id, title, metadata, pdf_storage_path, status')
    .eq('id', instanceId)
    .maybeSingle();
  if (iErr) throw iErr;
  if (!inst) return null;
  if (inst.status !== 'completed') return null;
  if (inst.pdf_storage_path) return inst.pdf_storage_path;

  const { data: sigs, error: sErr } = await supabase
    .from('document_signatures')
    .select('id, signer_id, role_label, step_index, signature_data_url, signed_at')
    .eq('instance_id', instanceId)
    .order('step_index');
  if (sErr) throw sErr;

  const signerIds = Array.from(new Set((sigs ?? []).map((s) => s.signer_id)));
  let signersById: Record<string, SignerInfo> = {};
  if (signerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name, email')
      .in('user_id', signerIds);
    signersById = Object.fromEntries(
      (profiles ?? []).map((p) => [
        p.user_id,
        {
          user_id: p.user_id,
          name:
            [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
            (p.email ?? 'Unknown signer'),
          email: p.email ?? null,
        },
      ]),
    );
  }

  const sigsWithName = (sigs ?? []).map((s) => ({
    ...s,
    name: signersById[s.signer_id]?.name ?? 'Unknown signer',
  }));

  const meta = (inst.metadata ?? {}) as Record<string, string>;
  const legacyPath = meta.legacy_file_path;

  let finalBytes: Uint8Array;

  if (legacyPath) {
    // Backfilled: overlay the owner signature image directly onto the
    // `[Owner Signature Pending]` text in the original driver-signed PDF.
    const { data: legacyBlob, error: dErr } = await supabase.storage
      .from('signed-documents')
      .download(legacyPath);
    if (dErr) throw dErr;
    const legacyBytes = new Uint8Array(await legacyBlob.arrayBuffer());

    const pdfDoc = await PDFDocument.load(legacyBytes);

    const ownerSig = sigsWithName.find(
      (s) => s.role_label === 'owner' && s.signature_data_url?.startsWith('data:image/png'),
    );

    if (ownerSig) {
      const sigBytes = dataUrlToPngBytes(ownerSig.signature_data_url);
      if (sigBytes) {
        const pngImage = await pdfDoc.embedPng(sigBytes);
        const hits = await findOwnerPlaceholders(legacyBytes);

        const targets = hits.length > 0
          ? hits
          : (() => {
              console.warn(
                '[composeCompletedPdf] No [Owner Signature Pending] found; drawing owner signature at bottom margin.',
              );
              const lastPage = pdfDoc.getPage(pdfDoc.getPageCount() - 1);
              const { width, height } = lastPage.getSize();
              return [{
                pageIndex: pdfDoc.getPageCount() - 1,
                x: 54,
                y: 60,
                width: 220,
                height: 12,
                pageWidth: width,
                pageHeight: height,
              }];
            })();

        for (const hit of targets) {
          const page = pdfDoc.getPage(hit.pageIndex);
          const targetHeight = 28;
          const aspect = pngImage.width / pngImage.height;
          const maxWidth = page.getWidth() - hit.x - 36;
          const targetWidth = Math.min(aspect * targetHeight, maxWidth);

          // Cover the placeholder text with a white rectangle (add a little
          // padding above/below so descenders/ascenders don't peek out).
          page.drawRectangle({
            x: hit.x - 1,
            y: hit.y - 3,
            width: hit.width + 2,
            height: hit.height + 6,
            color: rgb(1, 1, 1),
          });

          // Draw signature anchored to the placeholder baseline.
          page.drawImage(pngImage, {
            x: hit.x,
            y: hit.y - 4,
            width: targetWidth,
            height: targetHeight,
          });
        }
      }
    }

    finalBytes = await pdfDoc.save();
  } else {
    // Native new-flow instance: no source PDF exists.
    finalBytes = renderSignaturesPage({
      title: inst.title,
      headline: 'Signed Document',
      signatures: sigsWithName,
    });
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < finalBytes.length; i += chunkSize) {
    binary += String.fromCharCode(
      ...finalBytes.subarray(i, Math.min(i + chunkSize, finalBytes.length)),
    );
  }
  const pdf_base64 = btoa(binary);

  const { data, error } = await supabase.functions.invoke('finalize-document-instance', {
    body: { instance_id: inst.id, pdf_base64 },
  });
  if (error) throw error;
  return (data as { path?: string })?.path ?? null;
}
