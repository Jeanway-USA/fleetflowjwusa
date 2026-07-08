import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

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
  r
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Renders a single-page PDF summarizing all captured signatures.
 * Used both as a countersignature page appended to a legacy PDF and
 * (when there is no template PDF to append to) as a stand-alone
 * signatures certificate.
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

    // Embed signature PNG when available.
    if (s.signature_data_url && s.signature_data_url.startsWith('data:image')) {
      try {
        doc.addImage(s.signature_data_url, 'PNG', marginX, y, 220, 70);
        y += 74;
      } catch {
        doc.text('[signature image could not be rendered]', marginX, y + 20);
        y += 30;
      }
    } else {
      // Legacy placeholder — signature lives inside the original PDF.
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(
        s.signature_data_url?.startsWith('legacy:')
          ? '(Original signature is preserved in the attached document.)'
          : '(No signature captured.)',
        marginX,
        y + 14,
      );
      doc.setTextColor(0);
      y += 24;
    }

    y += 18;
    doc.setDrawColor(230);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 24;
  }

  // Serialize
  const blob = doc.output('arraybuffer');
  return new Uint8Array(blob);
}

/**
 * Build a "completed" PDF for a signed document instance and upload it
 * to storage. Idempotent-ish: caller should check `pdf_storage_path` first.
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

  // Resolve signer display names via profiles.
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
    // Backfilled instance: keep the original driver-signed PDF and append
    // a countersignature page for every non-driver signer.
    const { data: legacyBlob, error: dErr } = await supabase.storage
      .from('signed-documents')
      .download(legacyPath);
    if (dErr) throw dErr;
    const legacyBytes = new Uint8Array(await legacyBlob.arrayBuffer());

    const countersigners = sigsWithName.filter((s) => s.step_index > 0);
    const overlayBytes = renderSignaturesPage({
      title: inst.title,
      headline: 'Countersignatures',
      signatures: countersigners,
    });

    const merged = await PDFDocument.create();
    const original = await PDFDocument.load(legacyBytes);
    const overlay = await PDFDocument.load(overlayBytes);
    const originalPages = await merged.copyPages(original, original.getPageIndices());
    for (const p of originalPages) merged.addPage(p);
    const overlayPages = await merged.copyPages(overlay, overlay.getPageIndices());
    for (const p of overlayPages) merged.addPage(p);
    finalBytes = await merged.save();
  } else {
    // Native new-flow instance: no source PDF exists. Build a stand-alone
    // signatures certificate that embeds every signer's captured image.
    finalBytes = renderSignaturesPage({
      title: inst.title,
      headline: 'Signed Document',
      signatures: sigsWithName,
    });
  }

  // Base64-encode without exceeding call-stack limits for larger PDFs.
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

