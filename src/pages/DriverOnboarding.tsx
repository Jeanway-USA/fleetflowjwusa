import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { compressImage } from '@/lib/compress-image';
import { AlertCircle, CheckCircle2, Download, Briefcase, Building2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';


import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { DocumentSignatureStep } from '@/components/onboarding/DocumentSignatureStep';
import {
  DriverCredentialsStep,
  buildDefaultValues,
  type DriverCredentialsStepHandle,
} from '@/components/onboarding/DriverCredentialsStep';
import { generateSignedPdf } from '@/lib/onboarding/generateSignedPdf';
import { generateFormPdf, type FormPdfSection } from '@/lib/onboarding/generateFormPdf';
import {
  EMPTY_W2_DOCS_STATE,
  type W2DocsState,
} from '@/components/onboarding/W2Documents';
import {
  EMPTY_CONTRACTOR_DOCS_STATE,
  type ContractorDocsState,
} from '@/components/onboarding/ContractorDocuments';
import {
  EMPTY_STATE_TAX_FORM,
  type StateTaxFormState,
} from '@/components/onboarding/StateTaxForm';
import { stateHasIncomeTax } from '@/lib/us-states';
import { formatPayRate, payTypeLabel } from '@/lib/pay-format';


const DOCUMENT_LABELS: Record<string, string> = {
  driver_agreement: 'Driver Agreement',
  direct_deposit: 'Direct Deposit Authorization',
};

type TemplateAudience = 'shared' | 'w2' | '1099';

interface TemplateState {
  driverAddress: string;
  signature: string | null;
  cdlNumber: string;
  attachment: File | null;
  ssn: string;
  email: string;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  bankAccountType: 'checking' | 'savings' | '';
}

const EMPTY_TEMPLATE_STATE: TemplateState = {
  driverAddress: '',
  signature: null,
  cdlNumber: '',
  attachment: null,
  ssn: '',
  email: '',
  bankName: '',
  routingNumber: '',
  accountNumber: '',
  bankAccountType: '',
};



interface SignedResult {
  title: string;
  documentType: string;
  filePath: string;
  blobUrl: string;
}

export default function DriverOnboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const revisionMode = searchParams.get('revision') === '1';
  const docsOnlyMode = searchParams.get('docs') === '1';
  const { user, orgId, refreshOrgData } = useAuth();

  const [stepIndex, setStepIndex] = useState(0);
  const [employmentType, setEmploymentType] = useState<'1099' | 'W-2' | null>(null);
  const [deepLinked, setDeepLinked] = useState(false);
  const [state, setState] = useState<Record<string, TemplateState>>({});
  const [w2Docs, setW2Docs] = useState<W2DocsState>(EMPTY_W2_DOCS_STATE);
  const [contractorDocs, setContractorDocs] = useState<ContractorDocsState>(EMPTY_CONTRACTOR_DOCS_STATE);
  const [stateTax, setStateTax] = useState<StateTaxFormState>(EMPTY_STATE_TAX_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [signedResults, setSignedResults] = useState<SignedResult[] | null>(null);
  const [completionPendingDashboard, setCompletionPendingDashboard] = useState(false);
  const credentialsRef = useRef<DriverCredentialsStepHandle>(null);
  const [credentialsValid, setCredentialsValid] = useState(false);
  const [documentsValid, setDocumentsValid] = useState(false);





  const { data: driverRow, isLoading: driverLoading, refetch: refetchDriver } = useQuery({
    queryKey: ['driver-self', user?.id, orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select(
          'id, first_name, last_name, phone, license_number, license_expiry, medical_card_expiry, endorsements, hazmat_expiry, has_twic, twic_expiry, pay_type, pay_rate, credentials_review_status, credentials_revision_notes, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, fast_card_passport_expiry, dod_clearance_level, landstar_operator_id, employment_type'
        )

        .eq('user_id', user!.id)
        .eq('org_id', orgId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Hydrate employmentType from persisted drivers.employment_type on first load
  useEffect(() => {
    if (employmentType !== null) return;
    const et = (driverRow as { employment_type?: string | null } | null | undefined)?.employment_type;
    if (!et) return;
    if (et === 'w2_company') setEmploymentType('W-2');
    else setEmploymentType('1099'); // '1099_contractor' or 'lease_purchase'
  }, [driverRow, employmentType]);



  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['driver_onboarding_templates', orgId, employmentType],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .eq('org_id', orgId!)
        .eq('is_active', true)
        .order('document_type', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string;
        document_type: string;
        name: string | null;
        content: string;
        applies_to?: string | null;
      }>;
      // Filter by audience relative to the driver's employment type.
      return rows.filter((r) => {
        const audience = (r.applies_to ?? 'shared') as TemplateAudience;
        if (audience === 'shared') return true;
        if (audience === 'w2') return employmentType === 'W-2';
        if (audience === '1099') return employmentType === '1099';
        return true;
      });
    },
  });

  // Latest review status per document_type for this driver
  const { data: docRevisions = {} } = useQuery({
    queryKey: ['onboarding-revisions-detail', driverRow?.id],
    enabled: !!driverRow?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_signed_documents')
        .select('id, document_type, review_status, revision_notes, signed_at')
        .eq('driver_id', driverRow!.id)
        .order('signed_at', { ascending: false });
      if (error) throw error;
      const map: Record<string, { id: string; status: string; notes: string | null }> = {};
      for (const row of (data ?? []) as Array<{ id: string; document_type: string; review_status: string; revision_notes: string | null }>) {
        if (!map[row.document_type]) {
          map[row.document_type] = { id: row.id, status: row.review_status, notes: row.revision_notes };
        }
      }
      return map;
    },
  });

  const credentialsRevisionNotes = driverRow?.credentials_review_status === 'revision_requested'
    ? (driverRow?.credentials_revision_notes ?? null)
    : null;

  // Existence checks for the employment-specific structured forms so a driver
  // completing only outstanding templates isn't forced to re-enter W-4/I-9/W-9/IOO.
  const { data: structuredFormsPresent = { w4: false, i9: false, w9: false, ioo: false, stateTax: false } } = useQuery({
    queryKey: ['driver-structured-forms-present', driverRow?.id],
    enabled: !!driverRow?.id,
    queryFn: async () => {
      const [w4, i9, w9, ioo, stateTaxRow] = await Promise.all([
        supabase.from('driver_w4_info').select('driver_id').eq('driver_id', driverRow!.id).maybeSingle(),
        supabase.from('driver_i9_info').select('driver_id').eq('driver_id', driverRow!.id).maybeSingle(),
        supabase.from('driver_w9_info').select('driver_id').eq('driver_id', driverRow!.id).maybeSingle(),
        supabase.from('driver_ioo_agreement').select('driver_id').eq('driver_id', driverRow!.id).maybeSingle(),
        supabase.from('driver_state_tax_info' as never).select('driver_id').eq('driver_id', driverRow!.id).maybeSingle(),
      ]);
      return {
        w4: !!w4.data,
        i9: !!i9.data,
        w9: !!w9.data,
        ioo: !!ioo.data,
        stateTax: !!(stateTaxRow as { data?: unknown }).data,
      };
    },
  });

  const skipW2Structured = docsOnlyMode && structuredFormsPresent.w4 && structuredFormsPresent.i9;
  const skip1099Structured = docsOnlyMode && structuredFormsPresent.w9 && structuredFormsPresent.ioo;
  const skipStateTax = docsOnlyMode && structuredFormsPresent.stateTax;

  // Deep-link: when ?revision=1, jump to first step that needs revision.
  useEffect(() => {
    if (deepLinked || !driverRow) return;
    if (docsOnlyMode && employmentType !== null) {
      setStepIndex(2);
      setDeepLinked(true);
      return;
    }
    if (!revisionMode || templates.length === 0) return;
    if (driverRow.credentials_review_status === 'revision_requested') {
      setStepIndex(1);
      setDeepLinked(true);
      return;
    }
    const hasDocRevision = Object.values(docRevisions).some(
      (r) => r.status === 'revision_requested',
    );
    if (hasDocRevision) setStepIndex(2);
    setDeepLinked(true);
  }, [revisionMode, docsOnlyMode, employmentType, driverRow, templates, docRevisions, deepLinked]);


  // 3-step flow: Employment (0) → Credentials (1) → Documents (2)
  const EMPLOYMENT_STEP = 0;
  const CREDENTIALS_STEP = 1;
  const DOCUMENTS_STEP = 2;
  const isEmploymentStep = stepIndex === EMPLOYMENT_STEP;
  const isCredentialsStep = stepIndex === CREDENTIALS_STEP;
  const isDocumentsStep = stepIndex === DOCUMENTS_STEP;
  const totalSteps = 3;

  // Templates the driver still has to sign: excludes anything already submitted
  // (pending review or approved). Revision-requested items stay in the list so
  // they can be re-signed.
  const pendingTemplates = useMemo(() => {
    return templates.filter((t) => {
      const status = docRevisions[t.document_type]?.status;
      return status !== 'approved' && status !== 'pending';
    });
  }, [templates, docRevisions]);

  // Templates already submitted and awaiting admin review.
  const awaitingReviewTemplates = useMemo(() => {
    return templates.filter((t) => docRevisions[t.document_type]?.status === 'pending');
  }, [templates, docRevisions]);

  const canContinue = isEmploymentStep
    ? employmentType !== null
    : isCredentialsStep
    ? credentialsValid
    : documentsValid;

  const updateTemplateState = (templateId: string, patch: Partial<TemplateState>) => {
    setState((prev) => ({
      ...prev,
      [templateId]: { ...(prev[templateId] ?? EMPTY_TEMPLATE_STATE), ...patch },
    }));
  };



  const finalizeSubmission = async () => {
    if (!user || !orgId) {
      toast.error('You must be signed in to submit.');
      return;
    }

    // Resolve driver record
    const { data: driverRow, error: driverError } = await supabase
      .from('drivers')
      .select(
        'id, first_name, last_name, phone, license_number, license_expiry, medical_card_expiry, endorsements, hazmat_expiry, has_twic, twic_expiry, pay_type, pay_rate, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, fast_card_passport_expiry, dod_clearance_level, landstar_operator_id',
      )
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (driverError) throw driverError;
    if (!driverRow) throw new Error('Driver profile not found for your account.');

    const driverName = `${driverRow.first_name ?? ''} ${driverRow.last_name ?? ''}`.trim() || 'Driver';
    const results: SignedResult[] = [];

    for (const tmpl of pendingTemplates) {
      // Skip templates already submitted (revision_requested still needs resubmit).
      const existingStatus = docRevisions[tmpl.document_type]?.status;
      if (existingStatus === 'approved' || existingStatus === 'pending') {
        continue;
      }
      const tState: TemplateState =
        state[tmpl.id] ?? EMPTY_TEMPLATE_STATE;


      const title =
        tmpl.name ??
        DOCUMENT_LABELS[tmpl.document_type] ??
        tmpl.document_type;

      const signedPdfArgs = {
        title,
        content: tmpl.content,
        driverAddress: tState.driverAddress,
        signature: tState.signature,
        driverName,
        cdlNumber: tState.cdlNumber,
        licenseNumber: driverRow.license_number,
        licenseExpiry: driverRow.license_expiry,
        medicalCardExpiry: driverRow.medical_card_expiry,
        endorsements: driverRow.endorsements,
        hasTwic: driverRow.has_twic,
        twicExpiry: driverRow.twic_expiry,
        payType: driverRow.pay_type,
        payRate: driverRow.pay_rate,
        ssn: tState.ssn,
        email: tState.email,
        bankName: tState.bankName,
        routingNumber: tState.routingNumber,
        accountNumber: tState.accountNumber,
        bankAccountType: tState.bankAccountType,
      };

      const blob = generateSignedPdf({ ...signedPdfArgs, redact: true });
      const hasSensitive = !!(tState.ssn || tState.accountNumber);
      const fullBlob = hasSensitive
        ? generateSignedPdf({ ...signedPdfArgs, redact: false })
        : null;


      const timestamp = Date.now();
      const safeType = tmpl.document_type.replace(/[^a-z0-9_-]/gi, '_');
      const filePath = `${orgId}/${driverRow.id}/${safeType}-${timestamp}.pdf`;
      const adminFilePath = fullBlob
        ? `${orgId}/${driverRow.id}/${safeType}-${timestamp}.full.pdf`
        : null;

      const { error: uploadError } = await supabase.storage
        .from('signed-documents')
        .upload(filePath, blob, {
          contentType: 'application/pdf',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      if (fullBlob && adminFilePath) {
        const { error: fullUploadError } = await supabase.storage
          .from('signed-documents')
          .upload(adminFilePath, fullBlob, {
            contentType: 'application/pdf',
            upsert: false,
          });
        if (fullUploadError) {
          // Non-fatal: admin copy is a convenience artifact. Log and continue.
          console.error('[onboarding] Full-data admin PDF upload failed', fullUploadError);
        }
      }

      // Upload supplemental attachment when the template includes a {{file_upload}} token
      const templateHasFileUpload = /\{\{\s*file_upload\s*\}\}/.test(tmpl.content);
      let attachmentPath: string | null = null;
      if (templateHasFileUpload && tState.attachment) {
        const file = await compressImage(tState.attachment);
        const rawExt = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const ext = rawExt || (file.type.startsWith('image/') ? 'jpg' : 'bin');
        attachmentPath = `${orgId}/${driverRow.id}/${safeType}_attachment-${timestamp}.${ext}`;
        const { error: attachErr } = await supabase.storage
          .from('signed-documents')
          .upload(attachmentPath, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
          });
        if (attachErr) {
          throw new Error(
            `Couldn't upload your attachment: ${attachErr.message}. Try a PDF or JPG photo under 10 MB.`
          );
        }
      }

      const { error: insertError } = await supabase.from('driver_signed_documents').insert({
        org_id: orgId,
        driver_id: driverRow.id,
        template_id: tmpl.id,
        document_type: tmpl.document_type,
        file_path: filePath,
        admin_file_path: adminFilePath,
        attachment_file_path: attachmentPath,
        driver_address: tState.driverAddress || null,
        signature_data_url: tState.signature,
      } as never);
      if (insertError) throw insertError;

      // Persist latest direct deposit attachment + banking info on direct_deposit step
      if (tmpl.document_type === 'direct_deposit') {
        if (attachmentPath) {
          const { error: driverUpdateErr } = await supabase
            .from('drivers')
            .update({ direct_deposit_attachment_url: attachmentPath })
            .eq('id', driverRow.id);
          if (driverUpdateErr) {
            console.error('[onboarding] Failed to attach direct deposit form to driver', driverRow.id, driverUpdateErr);
            throw new Error(`Couldn't link your direct deposit attachment: ${driverUpdateErr.message}`);
          }
        }

        if (
          tState.bankName ||
          tState.routingNumber ||
          tState.accountNumber ||
          tState.bankAccountType
        ) {
          const { error: bankingErr } = await supabase.rpc('upsert_driver_banking', {
            _driver_id: driverRow.id,
            _bank_name: tState.bankName || '',
            _account_type: tState.bankAccountType || '',
            _routing_number: tState.routingNumber || '',
            _account_number: tState.accountNumber || '',
          });
          if (bankingErr) {
            console.error('[onboarding] upsert_driver_banking failed for driver', driverRow.id, bankingErr);
            throw new Error(`Couldn't save your banking info securely: ${bankingErr.message}. Please try again or contact your admin.`);
          }
        }
      }

      results.push({
        title,
        documentType: tmpl.document_type,
        filePath,
        blobUrl: URL.createObjectURL(blob),
      });
    }

    // --------------------------------------------------------------------
    // Persist W-2 / 1099 onboarding forms (W-4, I-9, Direct Deposit form,
    // W-9, IOO) — data collected in DocumentSignatureStep that was
    // previously discarded on submit.
    // --------------------------------------------------------------------
    // (driverName already defined above)
    const uploadFormPdf = async (
      docType: string,
      label: string,
      blob: Blob,
      adminBlob?: Blob,
    ) => {
      const ts = Date.now();
      const safe = docType.replace(/[^a-z0-9_-]/gi, '_');
      const filePath = `${orgId}/${driverRow.id}/${safe}-${ts}.pdf`;
      const { error: upErr } = await supabase.storage
        .from('signed-documents')
        .upload(filePath, blob, { contentType: 'application/pdf', upsert: false });
      if (upErr) throw new Error(`Couldn't upload ${label}: ${upErr.message}`);

      let adminFilePath: string | null = null;
      if (adminBlob) {
        adminFilePath = `${orgId}/${driverRow.id}/${safe}-${ts}_admin.pdf`;
        const { error: adminUpErr } = await supabase.storage
          .from('signed-documents')
          .upload(adminFilePath, adminBlob, { contentType: 'application/pdf', upsert: false });
        if (adminUpErr) throw new Error(`Couldn't upload admin copy of ${label}: ${adminUpErr.message}`);
      }

      const { error: insErr } = await supabase.from('driver_signed_documents').insert({
        org_id: orgId,
        driver_id: driverRow.id,
        template_id: null,
        document_type: docType,
        file_path: filePath,
        admin_file_path: adminFilePath,
        attachment_file_path: null,
        driver_address: null,
        signature_data_url: null,
      } as never);
      if (insErr) throw new Error(`Couldn't record ${label}: ${insErr.message}`);
      results.push({
        title: label,
        documentType: docType,
        filePath,
        blobUrl: URL.createObjectURL(blob),
      });
    };

    const maskTail = (v: string) => {
      const digits = v.replace(/\D/g, '');
      return digits.length >= 4 ? `***-**-${digits.slice(-4)}` : '—';
    };

    const fullSsn = (v: string) => {
      const d = (v || '').replace(/\D/g, '');
      return d.length === 9 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : (v || '—');
    };
    const fullTin = (v: string, tinType: string) => {
      const d = (v || '').replace(/\D/g, '');
      if (d.length !== 9) return v || '—';
      return (tinType || '').toLowerCase() === 'ein'
        ? `${d.slice(0, 2)}-${d.slice(2)}`
        : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
    };
    const fullAccount = (v: string) => {
      const d = (v || '').replace(/\D/g, '');
      return d.length > 0 ? d : '—';
    };

    if (employmentType === 'W-2' && !skipW2Structured) {
      // W-4 → driver_w4_info via SECURITY DEFINER RPC
      const { error: w4Err } = await supabase.rpc('upsert_driver_w4' as never, {
        _driver_id: driverRow.id,
        _filing_status: w2Docs.w4_filingStatus,
        _multiple_jobs: !!w2Docs.w4_multipleJobs,
        _dependents_amount: Number(w2Docs.w4_dependentsAmount || 0),
        _other_income: Number(w2Docs.w4_otherIncome || 0),
        _deductions: Number(w2Docs.w4_deductions || 0),
        _extra_withholding: Number(w2Docs.w4_extraWithholding || 0),
        _step_2c_checkbox: !!w2Docs.w4_multipleJobs,
      } as never);
      if (w4Err) throw new Error(`Couldn't save your W-4: ${w4Err.message}`);

      // I-9 → driver_i9_info
      const { error: i9Err } = await supabase.rpc('upsert_driver_i9' as never, {
        _driver_id: driverRow.id,
        _full_name: w2Docs.i9_fullName,
        _other_last_names: w2Docs.i9_otherLastNames,
        _address: w2Docs.i9_address,
        _dob: w2Docs.i9_dob,
        _ssn: w2Docs.i9_ssn,
        _email: w2Docs.i9_email,
        _phone: w2Docs.i9_phone,
        _citizenship: w2Docs.i9_citizenship,
        _alien_number: w2Docs.i9_alienNumber,
        _work_auth_expiry: w2Docs.i9_workAuthExpiry || null,
        _work_auth_doc_number: w2Docs.i9_workAuthDocNumber,
      } as never);
      if (i9Err) throw new Error(`Couldn't save your I-9: ${i9Err.message}`);

      // Direct deposit → banking (reuse existing RPC)
      const { error: ddErr } = await supabase.rpc('upsert_driver_banking', {
        _driver_id: driverRow.id,
        _bank_name: w2Docs.dd_bankName,
        _account_type: w2Docs.dd_accountType || '',
        _routing_number: w2Docs.dd_routingNumber,
        _account_number: w2Docs.dd_accountNumber,
      });
      if (ddErr) throw new Error(`Couldn't save your direct deposit info: ${ddErr.message}`);

      // W-4 PDF
      const w4Sections: FormPdfSection[] = [
        {
          heading: 'Employee Information',
          fields: [
            { label: 'Full legal name', value: w2Docs.w4_fullName },
            { label: 'Social Security Number', value: maskTail(w2Docs.w4_ssn) },
            { label: 'Home address', value: w2Docs.w4_address },
            { label: 'Filing status', value: w2Docs.w4_filingStatus },
          ],
        },
        {
          heading: 'Adjustments',
          fields: [
            { label: 'Step 2(c) multiple jobs', value: w2Docs.w4_multipleJobs ? 'Yes' : 'No' },
            { label: 'Dependents amount', value: `$${w2Docs.w4_dependentsAmount || '0'}` },
            { label: 'Other income', value: `$${w2Docs.w4_otherIncome || '0'}` },
            { label: 'Deductions', value: `$${w2Docs.w4_deductions || '0'}` },
            { label: 'Extra withholding', value: `$${w2Docs.w4_extraWithholding || '0'}` },
          ],
        },
      ];
      const w4AdminSections: FormPdfSection[] = [
        {
          ...w4Sections[0],
          fields: w4Sections[0].fields.map((f) =>
            f.label === 'Social Security Number' ? { ...f, value: fullSsn(w2Docs.w4_ssn) } : f,
          ),
        },
        w4Sections[1],
      ];
      await uploadFormPdf(
        'w4',
        'Federal W-4 Withholding Certificate',
        generateFormPdf({
          title: 'Form W-4 — Employee Withholding Certificate',
          subtitle: 'Signed electronically as part of driver onboarding.',
          driverName,
          sections: w4Sections,
          signatureLabel: 'Employee signature',
          signature: w2Docs.w4_signature,
        }),
        generateFormPdf({
          title: 'Form W-4 — Employee Withholding Certificate (Payroll Copy)',
          subtitle: 'Unmasked copy for payroll and tax filing use only.',
          driverName,
          sections: w4AdminSections,
          signatureLabel: 'Employee signature',
          signature: w2Docs.w4_signature,
        }),
      );

      // I-9 PDF
      const i9Sections: FormPdfSection[] = [
        {
          heading: 'Section 1 — Employee Information',
          fields: [
            { label: 'Full legal name', value: w2Docs.i9_fullName },
            { label: 'Other last names used', value: w2Docs.i9_otherLastNames || '—' },
            { label: 'Address', value: w2Docs.i9_address },
            { label: 'Date of birth', value: w2Docs.i9_dob },
            { label: 'SSN', value: maskTail(w2Docs.i9_ssn) },
            { label: 'Email', value: w2Docs.i9_email },
            { label: 'Phone', value: w2Docs.i9_phone },
            { label: 'Citizenship / status', value: w2Docs.i9_citizenship },
            { label: 'Alien / USCIS number', value: w2Docs.i9_alienNumber || '—' },
            { label: 'Work authorization expiry', value: w2Docs.i9_workAuthExpiry || '—' },
            { label: 'Work authorization doc #', value: w2Docs.i9_workAuthDocNumber || '—' },
          ],
          notes: [
            'The employee attests, under penalty of perjury, that the information provided is true and correct.',
          ],
        },
      ];
      const i9AdminSections: FormPdfSection[] = [
        {
          ...i9Sections[0],
          fields: i9Sections[0].fields.map((f) =>
            f.label === 'SSN' ? { ...f, value: fullSsn(w2Docs.i9_ssn) } : f,
          ),
        },
      ];
      await uploadFormPdf(
        'i9',
        'Form I-9 — Employment Eligibility',
        generateFormPdf({
          title: 'Form I-9 — Employment Eligibility Verification',
          subtitle: 'Section 1 attestation completed by the employee.',
          driverName,
          sections: i9Sections,
          signatureLabel: 'Employee signature',
          signature: w2Docs.i9_signature,
        }),
        generateFormPdf({
          title: 'Form I-9 — Employment Eligibility Verification (Payroll Copy)',
          subtitle: 'Unmasked copy for payroll and tax filing use only.',
          driverName,
          sections: i9AdminSections,
          signatureLabel: 'Employee signature',
          signature: w2Docs.i9_signature,
        }),
      );

      // Direct Deposit form PDF (structured artifact separate from the DB template)
      const ddSections: FormPdfSection[] = [
        {
          heading: 'Banking Details',
          fields: [
            { label: 'Bank name', value: w2Docs.dd_bankName },
            { label: 'Account type', value: w2Docs.dd_accountType },
            { label: 'Routing number', value: w2Docs.dd_routingNumber },
            {
              label: 'Account number',
              value: (() => {
                const d = w2Docs.dd_accountNumber.replace(/\D/g, '');
                return d.length >= 4 ? `****${d.slice(-4)}` : '—';
              })(),
            },
          ],
          notes: [
            'Employee authorizes the employer to initiate direct deposits into the account listed above.',
          ],
        },
      ];
      const ddAdminSections: FormPdfSection[] = [
        {
          ...ddSections[0],
          fields: ddSections[0].fields.map((f) =>
            f.label === 'Account number' ? { ...f, value: fullAccount(w2Docs.dd_accountNumber) } : f,
          ),
        },
      ];
      await uploadFormPdf(
        'direct_deposit_form',
        'Direct Deposit Authorization',
        generateFormPdf({
          title: 'Direct Deposit Authorization',
          driverName,
          sections: ddSections,
          signatureLabel: 'Employee signature',
          signature: w2Docs.dd_signature,
        }),
        generateFormPdf({
          title: 'Direct Deposit Authorization (Payroll Copy)',
          subtitle: 'Unmasked copy for payroll and ACH setup use only.',
          driverName,
          sections: ddAdminSections,
          signatureLabel: 'Employee signature',
          signature: w2Docs.dd_signature,
        }),
      );
    }

    if (employmentType === '1099' && !skip1099Structured) {
      const { error: w9Err } = await supabase.rpc('upsert_driver_w9' as never, {
        _driver_id: driverRow.id,
        _legal_name: contractorDocs.w9_legalName,
        _business_name: contractorDocs.w9_businessName,
        _tax_class: contractorDocs.w9_taxClass,
        _address: contractorDocs.w9_address,
        _tin_type: contractorDocs.w9_tinType,
        _tin: contractorDocs.w9_tin,
        _certify_accurate: contractorDocs.w9_certifyAccurate,
        _certify_backup_withholding: contractorDocs.w9_certifyBackupWithholding,
      } as never);
      if (w9Err) throw new Error(`Couldn't save your W-9: ${w9Err.message}`);

      const { error: iooErr } = await supabase.rpc('upsert_driver_ioo' as never, {
        _driver_id: driverRow.id,
        _legal_name: contractorDocs.ioo_legalName,
        _business_name: contractorDocs.ioo_businessName,
        _mc_number: contractorDocs.ioo_mcNumber,
        _dot_number: contractorDocs.ioo_dotNumber,
        _effective_date: contractorDocs.ioo_effectiveDate,
        _agree_terms: contractorDocs.ioo_agreeTerms,
        _ack_ic_status: contractorDocs.ioo_ackIcStatus,
      } as never);
      if (iooErr) throw new Error(`Couldn't save your Owner-Operator agreement: ${iooErr.message}`);

      // W-9 PDF
      const w9BaseFields = [
        { label: 'Legal name', value: contractorDocs.w9_legalName },
        { label: 'Business name', value: contractorDocs.w9_businessName || '—' },
        { label: 'Tax classification', value: contractorDocs.w9_taxClass },
        { label: 'Address', value: contractorDocs.w9_address },
        { label: 'TIN type', value: contractorDocs.w9_tinType.toUpperCase() },
      ];
      const w9Notes = [
        'The contractor certifies, under penalty of perjury, that the TIN provided is correct and that they are not subject to backup withholding.',
      ];
      await uploadFormPdf(
        'w9',
        'Form W-9 — Taxpayer Identification',
        generateFormPdf({
          title: 'Form W-9 — Request for Taxpayer Identification',
          subtitle: 'Signed electronically as part of contractor onboarding.',
          driverName,
          sections: [
            {
              heading: 'Contractor Information',
              fields: [...w9BaseFields, { label: 'TIN', value: maskTail(contractorDocs.w9_tin) }],
              notes: w9Notes,
            },
          ],
          signatureLabel: 'Contractor signature',
          signature: contractorDocs.w9_signature,
        }),
        generateFormPdf({
          title: 'Form W-9 — Request for Taxpayer Identification (Payroll Copy)',
          subtitle: 'Unmasked copy for 1099 filing and tax reporting use only.',
          driverName,
          sections: [
            {
              heading: 'Contractor Information',
              fields: [
                ...w9BaseFields,
                { label: 'TIN', value: fullTin(contractorDocs.w9_tin, contractorDocs.w9_tinType) },
              ],
              notes: w9Notes,
            },
          ],
          signatureLabel: 'Contractor signature',
          signature: contractorDocs.w9_signature,
        }),
      );

      // IOO PDF
      await uploadFormPdf(
        'ioo_agreement',
        'Independent Owner-Operator Agreement',
        generateFormPdf({
          title: 'Independent Owner-Operator Agreement',
          driverName,
          sections: [
            {
              heading: 'Contractor & Authority',
              fields: [
                { label: 'Legal name', value: contractorDocs.ioo_legalName },
                { label: 'Business name', value: contractorDocs.ioo_businessName || '—' },
                { label: 'MC number', value: contractorDocs.ioo_mcNumber },
                { label: 'DOT number', value: contractorDocs.ioo_dotNumber },
                { label: 'Effective date', value: contractorDocs.ioo_effectiveDate },
              ],
              notes: [
                'Contractor agrees to the terms of the Independent Owner-Operator Agreement and acknowledges independent contractor status.',
              ],
            },
          ],
          signatureLabel: 'Contractor signature',
          signature: contractorDocs.ioo_signature,
        }),
      );
    }

    // ------------------------------------------------------------------
    // State Tax Withholding (applies to both W-2 and 1099 drivers).
    // Also mirrors work_state onto drivers.tax_state via the RPC so the
    // State Filing Registry surfaces only the states we actually owe.
    // ------------------------------------------------------------------
    if (!skipStateTax) {
      const residenceHasSit = stateHasIncomeTax(stateTax.residenceState);
      const { error: stErr } = await supabase.rpc('upsert_driver_state_tax' as never, {
        _driver_id: driverRow.id,
        _work_state: stateTax.workState,
        _residence_state: stateTax.residenceState,
        _filing_status: residenceHasSit ? (stateTax.filingStatus || 'single') : 'single',
        _allowances: Number(stateTax.allowances || 0),
        _additional_withholding: Number(stateTax.additionalWithholding || 0),
        _exempt: !!stateTax.exempt,
      } as never);
      if (stErr) throw new Error(`Couldn't save your state tax form: ${stErr.message}`);

      const stSections: FormPdfSection[] = [
        {
          heading: 'Jurisdictions',
          fields: [
            { label: 'Work state (SUTA)', value: stateTax.workState },
            { label: 'State of residence', value: stateTax.residenceState },
          ],
        },
      ];
      if (employmentType === 'W-2' && residenceHasSit) {
        stSections.push({
          heading: 'State Income Tax Withholding',
          fields: [
            { label: 'Claiming exempt', value: stateTax.exempt ? 'Yes' : 'No' },
            { label: 'Filing status', value: stateTax.exempt ? '—' : (stateTax.filingStatus || '—') },
            { label: 'Allowances', value: stateTax.exempt ? '—' : (stateTax.allowances || '0') },
            {
              label: 'Additional withholding per pay period',
              value: stateTax.exempt ? '—' : `$${stateTax.additionalWithholding || '0'}`,
            },
          ],
          notes: [
            'Employee certifies, under penalty of perjury, that the information provided is accurate and will notify the employer of any change.',
          ],
        });
      } else if (employmentType === 'W-2' && !residenceHasSit) {
        stSections.push({
          heading: 'State Income Tax Withholding',
          fields: [
            { label: 'State income tax', value: `${stateTax.residenceState.toUpperCase()} has no state income tax — no withholding elections required.` },
          ],
        });
      } else {
        stSections.push({
          heading: '1099 Contractor Note',
          fields: [
            { label: 'Withholding', value: 'Not applicable — 1099 contractors are not subject to state tax withholding by the payer.' },
          ],
        });
      }

      await uploadFormPdf(
        'state_tax',
        'State Tax Withholding',
        generateFormPdf({
          title: 'State Tax Withholding Election',
          subtitle: 'Signed electronically as part of driver onboarding.',
          driverName,
          sections: stSections,
          signatureLabel: employmentType === 'W-2' ? 'Employee signature' : 'Contractor signature',
          signature: stateTax.signature,
        }),
      );
    }

    const profileCompleted = !revisionMode;
    const shouldReturnToDashboard = docsOnlyMode || results.length === 0;

    if (profileCompleted) {
      // Mark onboarding complete on the user's profile so guards unlock the dashboard.
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true, requires_onboarding: false })
        .eq('user_id', user.id);
      if (profileError) {
        console.error('Failed to mark onboarding complete:', profileError);
        throw new Error(`Documents saved, but onboarding couldn't be marked complete: ${profileError.message}`);
      }
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['onboarding-revisions-detail', driverRow.id] }),
      queryClient.invalidateQueries({ queryKey: ['onboarding-revisions', driverRow.id] }),
      queryClient.invalidateQueries({ queryKey: ['onboarding-outstanding', driverRow.id] }),
      queryClient.invalidateQueries({ queryKey: ['driver_signed_documents', driverRow.id] }),
      queryClient.invalidateQueries({ queryKey: ['driver-signed-doc-counts', orgId] }),
      queryClient.invalidateQueries({ queryKey: ['driver-home/driver', user.id] }),
    ]);

    toast.success(revisionMode ? 'Revisions resubmitted. Admin will be notified.' : 'Documents submitted successfully');

    if (shouldReturnToDashboard) {
      setCompletionPendingDashboard(true);
      if (profileCompleted) {
        await refreshOrgData();
      }
      navigate('/driver-dashboard', { replace: true });
    } else {
      setSignedResults(results);
    }
  };


  const handleContinue = async () => {
    // Step 0: validate + save driver credentials, then advance
    if (isCredentialsStep) {
      if (!driverRow || !orgId) {
        toast.error('Driver profile not found.');
        return;
      }
      const payload = await credentialsRef.current?.submit();
      if (!payload) return;
      // Merge employment_type from the initial step so downstream systems
      // (payroll, settlements, DriverDetailSheet) stay in sync.
      const mappedEmploymentType =
        employmentType === 'W-2' ? 'w2_company'
        : employmentType === '1099' ? '1099_contractor'
        : null;
      const fullPayload = mappedEmploymentType
        ? { ...payload, employment_type: mappedEmploymentType }
        : payload;
      setSubmitting(true);
      try {
        const { data: updated, error } = await supabase
          .from('drivers')
          .update(fullPayload as never)
          .eq('id', driverRow.id)
          .eq('org_id', orgId)
          .select('id');
        if (error) throw error;
        if (!updated || updated.length === 0) {
          throw new Error(
            'Could not save your credentials. Please contact your administrator.',
          );
        }
        // Explicitly clear any pending revision request for credentials.
        if (driverRow.credentials_review_status === 'revision_requested') {
          await supabase
            .from('drivers')
            .update({
              credentials_review_status: 'pending',
              credentials_revision_notes: null,
            } as never)
            .eq('id', driverRow.id);
        }
        await refetchDriver();

        // In revision mode: if no further doc revisions, we're done.
        if (revisionMode) {
          const hasMoreDocRevisions = Object.values(docRevisions).some(
            (r) => r.status === 'revision_requested',
          );
          if (!hasMoreDocRevisions) {
            toast.success('Revisions resubmitted. Admin will be notified.');
            navigate('/driver-dashboard', { replace: true });
            return;
          }
          setStepIndex(2);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        setStepIndex(2);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : 'Failed to save credentials');
      } finally {
        setSubmitting(false);
      }

      return;
    }

    if (stepIndex < totalSteps - 1) {
      setStepIndex((i) => i + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitting(true);
    try {
      await finalizeSubmission();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Failed to submit documents');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = (result: SignedResult) => {
    const a = document.createElement('a');
    a.href = result.blobUrl;
    a.download = `${result.documentType}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (isLoading || driverLoading) {
    return (
      <div className="container max-w-4xl py-10">
        <Skeleton className="h-8 w-1/3 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!driverRow) {
    return (
      <div className="container max-w-4xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>Driver profile not linked</CardTitle>
            <CardDescription>
              Your account isn't linked to a driver record yet. Please contact your administrator
              to finish setting up your profile before completing onboarding.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }


  // Success screen — shown only here, not on the regular dashboard
  if (signedResults) {
    return (
      <div className="container max-w-4xl py-10">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </div>
            <CardTitle>All documents signed</CardTitle>
            <CardDescription>
              Your signed copies are ready. Download them now — they won't be available from your
              dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {signedResults.map((r) => (
              <div
                key={r.filePath}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <span className="font-medium">{r.title}</span>
                <Button size="sm" onClick={() => handleDownload(r)}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Signed PDF
                </Button>
              </div>
            ))}
            <div className="pt-4 flex justify-end">
              <Button
                variant="outline"
                disabled={completionPendingDashboard}
                onClick={async () => {
                  setCompletionPendingDashboard(true);
                  await refreshOrgData();
                  try { localStorage.setItem('pending_driver_tour', '1'); } catch { /* ignore */ }
                  navigate('/driver-dashboard', { replace: true, state: { startTour: true } });
                }}
              >
                {completionPendingDashboard ? 'Opening Dashboard…' : 'Go to Dashboard'}
              </Button>
            </div>

          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = ((stepIndex + 1) / totalSteps) * 100;
  const title = isEmploymentStep
    ? 'Choose Your Employment Type'
    : isCredentialsStep
    ? 'Driver Profile & Credentials'
    : 'Sign Your Onboarding Documents';

  const stepRevisionNotes = isCredentialsStep ? credentialsRevisionNotes : null;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-background">
    <div className="container max-w-4xl py-10 pb-32">


      <div className="mb-6">
        <p className="text-sm text-muted-foreground mb-2">
          Step {stepIndex + 1} of {totalSteps}
        </p>
        <Progress value={progress} />
      </div>

      {stepRevisionNotes && (
        <Alert variant="destructive" className="mb-4 border-2">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Revisions requested by your administrator</AlertTitle>
          <AlertDescription className="mt-1 whitespace-pre-wrap">{stepRevisionNotes}</AlertDescription>
        </Alert>
      )}


      {driverRow?.pay_type && !isEmploymentStep && (
        <div className="mb-4 rounded-md border bg-muted/30 p-3 flex items-center justify-between text-sm">
          <div>
            <span className="text-muted-foreground">Contract Terms: </span>
            <span className="font-medium">{payTypeLabel(driverRow.pay_type)}</span>
          </div>
          <div className="font-semibold">{formatPayRate(driverRow.pay_type, driverRow.pay_rate)}</div>
        </div>
      )}



      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {isEmploymentStep
              ? 'How will you be working with us? This determines how your pay and taxes are handled.'
              : isCredentialsStep
              ? 'Confirm your CDL, medical card, and TWIC details before reviewing onboarding documents.'
              : 'Review and sign the shared documents, plus the ones specific to your employment type.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isEmploymentStep ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {([
                {
                  value: '1099' as const,
                  label: 'Independent Contractor',
                  tag: '1099',
                  description: 'You operate under your own authority or as an owner-operator. You receive a 1099 at year-end and handle your own taxes.',
                  Icon: Briefcase,
                },
                {
                  value: 'W-2' as const,
                  label: 'Company Driver',
                  tag: 'W-2',
                  description: 'You are an employee of the company. Taxes are withheld from each paycheck and you receive a W-2 at year-end.',
                  Icon: Building2,
                },
              ]).map(({ value, label, tag, description, Icon }) => {
                const selected = employmentType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEmploymentType(value)}
                    aria-pressed={selected}
                    className={
                      'group relative flex flex-col items-start gap-3 rounded-lg border-2 p-6 text-left transition-all ' +
                      (selected
                        ? 'border-primary bg-primary/5 ring-2 ring-primary shadow-md'
                        : 'border-border bg-card hover:border-primary/50 hover:bg-accent/40')
                    }
                  >
                    <div
                      className={
                        'flex h-12 w-12 items-center justify-center rounded-full ' +
                        (selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')
                      }
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold">{label}</span>
                      <span
                        className={
                          'rounded-full px-2 py-0.5 text-xs font-semibold ' +
                          (selected
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground')
                        }
                      >
                        {tag}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{description}</p>
                    {selected && (
                      <div className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : isCredentialsStep ? (
            <DriverCredentialsStep
              ref={credentialsRef}
              defaultValues={buildDefaultValues(driverRow)}
              onValidityChange={setCredentialsValid}
            />
          ) : (
            <div className="space-y-4">
              {awaitingReviewTemplates.length > 0 && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Already submitted — waiting on review</AlertTitle>
                  <AlertDescription>
                    {awaitingReviewTemplates
                      .map((t) => t.name ?? DOCUMENT_LABELS[t.document_type] ?? t.document_type)
                      .join(', ')}
                  </AlertDescription>
                </Alert>
              )}
              <DocumentSignatureStep
                employmentType={employmentType}
                templates={pendingTemplates as never}
                state={state}
                onUpdateTemplateState={updateTemplateState}
                driverRow={driverRow}
                docRevisions={docRevisions}
                revisionMode={revisionMode}
                onValidityChange={setDocumentsValid}
                w2Docs={w2Docs}
                onW2DocsChange={(patch) => setW2Docs((prev) => ({ ...prev, ...patch }))}
                contractorDocs={contractorDocs}
                onContractorDocsChange={(patch) => setContractorDocs((prev) => ({ ...prev, ...patch }))}
                stateTax={stateTax}
                onStateTaxChange={(patch) => setStateTax((prev) => ({ ...prev, ...patch }))}
                skipW2Structured={skipW2Structured}
                skip1099Structured={skip1099Structured}
                skipStateTax={skipStateTax}
              />
              {docsOnlyMode && pendingTemplates.length === 0 && (skipW2Structured || skip1099Structured || (structuredFormsPresent.w4 && structuredFormsPresent.i9 && structuredFormsPresent.w9 && structuredFormsPresent.ioo)) && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>You're all caught up</AlertTitle>
                  <AlertDescription>
                    Every required document has already been signed. You can return to your dashboard.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

        </CardContent>
      </Card>
    </div>

    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white dark:bg-background shadow-[0_-2px_8px_-4px_rgba(0,0,0,0.08)]">
      <div className="container max-w-4xl flex items-center justify-between gap-3 py-3 px-4">
        <Button
          variant="outline"
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          disabled={stepIndex === 0 || submitting}
        >
          Back
        </Button>

        <div className="hidden sm:flex flex-col items-center text-xs leading-tight">
          <span className="text-muted-foreground">
            Step {stepIndex + 1} of {totalSteps}
          </span>
          {isDocumentsStep && (
            documentsValid ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                Ready to submit!
              </span>
            ) : (
              <span className="text-orange-600 dark:text-orange-400 font-medium mt-0.5">
                Complete all documents to continue
              </span>
            )
          )}
        </div>

        <Button type="button" onClick={handleContinue} disabled={!canContinue || submitting || completionPendingDashboard}>
          {submitting
            ? isCredentialsStep
              ? 'Saving…'
              : 'Submitting…'
            : completionPendingDashboard
              ? 'Finishing…'
            : isEmploymentStep
              ? 'Next'
              : isCredentialsStep
                ? 'Continue'
                : 'Submit Documents'}
        </Button>
      </div>
    </div>

    </div>
  );
}

