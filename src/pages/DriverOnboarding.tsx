import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useQuery } from '@tanstack/react-query';
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
import { formatPayRate, payTypeLabel } from '@/lib/pay-format';


const DOCUMENT_ORDER = ['driver_agreement', 'direct_deposit'] as const;
type DocumentTypeKey = (typeof DOCUMENT_ORDER)[number];

const DOCUMENT_LABELS: Record<DocumentTypeKey, string> = {
  driver_agreement: 'Driver Agreement',
  direct_deposit: 'Direct Deposit Authorization',
};

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
  const [searchParams] = useSearchParams();
  const revisionMode = searchParams.get('revision') === '1';
  const { user, orgId, refreshOrgData } = useAuth();

  const [stepIndex, setStepIndex] = useState(0);
  const [employmentType, setEmploymentType] = useState<'1099' | 'W-2' | null>(null);
  const [deepLinked, setDeepLinked] = useState(false);
  const [state, setState] = useState<Record<string, TemplateState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [signedResults, setSignedResults] = useState<SignedResult[] | null>(null);
  const [currentSubPageIndex, setCurrentSubPageIndex] = useState(0);
  const credentialsRef = useRef<DriverCredentialsStepHandle>(null);
  const [credentialsValid, setCredentialsValid] = useState(false);

  useEffect(() => {
    setCurrentSubPageIndex(0);
  }, [stepIndex]);




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
    queryKey: ['driver_onboarding_templates', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .eq('org_id', orgId!)
        .eq('is_active', true)
        .in('document_type', DOCUMENT_ORDER as unknown as string[]);
      if (error) throw error;
      return [...(data ?? [])].sort(
        (a, b) =>
          DOCUMENT_ORDER.indexOf(a.document_type as DocumentTypeKey) -
          DOCUMENT_ORDER.indexOf(b.document_type as DocumentTypeKey),
      );
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

  // Deep-link: when ?revision=1, jump to first step that needs revision.
  useEffect(() => {
    if (deepLinked || !revisionMode || !driverRow || templates.length === 0) return;
    if (driverRow.credentials_review_status === 'revision_requested') {
      setStepIndex(1);
      setDeepLinked(true);
      return;
    }
    const idx = templates.findIndex((t) => docRevisions[t.document_type]?.status === 'revision_requested');
    if (idx >= 0) {
      setStepIndex(idx + 2);
      setDeepLinked(true);
    } else {
      setDeepLinked(true);
    }
  }, [revisionMode, driverRow, templates, docRevisions, deepLinked]);


  // Step 0 = employment type, Step 1 = credentials, Steps 2..N = templates
  const EMPLOYMENT_STEP = 0;
  const CREDENTIALS_STEP = 1;
  const isEmploymentStep = stepIndex === EMPLOYMENT_STEP;
  const isCredentialsStep = stepIndex === CREDENTIALS_STEP;
  const totalSteps = templates.length + 2;
  const templateIndex = stepIndex - 2;
  const currentTemplate = templateIndex >= 0 ? templates[templateIndex] : undefined;
  const currentState: TemplateState = currentTemplate
    ? state[currentTemplate.id] ?? EMPTY_TEMPLATE_STATE
    : EMPTY_TEMPLATE_STATE;

  const chunks = useMemo(() => {
    if (!currentTemplate) return [] as string[];
    return currentTemplate.content.split(/\{\{\s*page_break\s*\}\}/);
  }, [currentTemplate]);
  const chunkCount = Math.max(chunks.length, 1);
  const safeSubPageIndex = Math.min(currentSubPageIndex, chunkCount - 1);
  const currentChunk = chunks[safeSubPageIndex] ?? '';
  const isLastSubPage = safeSubPageIndex >= chunkCount - 1;
  const isLastTemplateStep = stepIndex === totalSteps - 1;


  const needsDriverAddress = useMemo(
    () => !!currentTemplate && /\{\{\s*driver_address\s*\}\}/.test(currentTemplate.content),
    [currentTemplate],
  );
  const needsCdlNumber = useMemo(
    () => !!currentTemplate && /\{\{\s*cdl_number\s*\}\}/.test(currentTemplate.content),
    [currentTemplate],
  );
  const needsDriverSignature = useMemo(
    () => !!currentTemplate && /\{\{\s*driver_signature\s*\}\}/.test(currentTemplate.content),
    [currentTemplate],
  );
  const needsFileUpload = useMemo(
    () => !!currentTemplate && /\{\{\s*file_upload\s*\}\}/.test(currentTemplate.content),
    [currentTemplate],
  );
  const needsSsn = useMemo(
    () => !!currentTemplate && /\{\{\s*ssn\s*\}\}/.test(currentTemplate.content),
    [currentTemplate],
  );
  const needsEmail = useMemo(
    () => !!currentTemplate && /\{\{\s*email\s*\}\}/.test(currentTemplate.content),
    [currentTemplate],
  );
  const needsBankName = useMemo(
    () => !!currentTemplate && /\{\{\s*bank_name\s*\}\}/.test(currentTemplate.content),
    [currentTemplate],
  );
  const needsBankAccountType = useMemo(
    () => !!currentTemplate && /\{\{\s*bank_account_type\s*\}\}/.test(currentTemplate.content),
    [currentTemplate],
  );
  const needsRoutingNumber = useMemo(
    () => !!currentTemplate && /\{\{\s*routing_number\s*\}\}/.test(currentTemplate.content),
    [currentTemplate],
  );
  const needsAccountNumber = useMemo(
    () => !!currentTemplate && /\{\{\s*account_number\s*\}\}/.test(currentTemplate.content),
    [currentTemplate],
  );

  const isValidSignatureDataUrl = (s: string | null): s is string =>
    !!s && s.startsWith('data:image/');

  const ssnDigits = currentState.ssn.replace(/\D/g, '');
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentState.email.trim());

  const canContinue = isEmploymentStep
    ? employmentType !== null
    : isCredentialsStep
    ? credentialsValid
    : (!needsDriverSignature || isValidSignatureDataUrl(currentState.signature)) &&
      (!needsDriverAddress || currentState.driverAddress.trim().length > 0) &&
      (!needsCdlNumber || currentState.cdlNumber.trim().length > 0) &&
      (!needsFileUpload || currentState.attachment != null) &&
      (!needsSsn || ssnDigits.length === 9) &&
      (!needsEmail || emailValid) &&
      (!needsBankName || currentState.bankName.trim().length > 0) &&
      (!needsBankAccountType || currentState.bankAccountType !== '') &&
      (!needsRoutingNumber || currentState.routingNumber.length === 9) &&
      (!needsAccountNumber || currentState.accountNumber.length >= 4);

  const fieldsRemaining = useMemo(() => {
    if (isCredentialsStep || !currentTemplate) return 0;
    const c = currentChunk;
    let n = 0;
    if (/\{\{\s*driver_address\s*\}\}/.test(c) && !currentState.driverAddress.trim()) n++;
    if (/\{\{\s*cdl_number\s*\}\}/.test(c) && !currentState.cdlNumber.trim()) n++;
    if (/\{\{\s*ssn\s*\}\}/.test(c) && ssnDigits.length !== 9) n++;
    if (/\{\{\s*email\s*\}\}/.test(c) && !emailValid) n++;
    if (/\{\{\s*bank_name\s*\}\}/.test(c) && !currentState.bankName.trim()) n++;
    if (/\{\{\s*bank_account_type\s*\}\}/.test(c) && currentState.bankAccountType === '') n++;
    if (/\{\{\s*routing_number\s*\}\}/.test(c) && currentState.routingNumber.length !== 9) n++;
    if (/\{\{\s*account_number\s*\}\}/.test(c) && currentState.accountNumber.length < 4) n++;
    if (/\{\{\s*file_upload\s*\}\}/.test(c) && !currentState.attachment) n++;
    if (/\{\{\s*driver_signature\s*\}\}/.test(c) && !isValidSignatureDataUrl(currentState.signature)) n++;
    return n;
  }, [isCredentialsStep, currentTemplate, currentChunk, currentState, ssnDigits, emailValid]);




  const updateCurrent = (patch: Partial<TemplateState>) => {
    if (!currentTemplate) return;
    setState((prev) => ({
      ...prev,
      [currentTemplate.id]: { ...currentState, ...patch },
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

    for (const tmpl of templates) {
      // In revision mode, skip templates already approved by the admin.
      if (revisionMode && docRevisions[tmpl.document_type]?.status === 'approved') {
        continue;
      }
      const tState: TemplateState =
        state[tmpl.id] ?? EMPTY_TEMPLATE_STATE;


      const title =
        tmpl.name ??
        DOCUMENT_LABELS[tmpl.document_type as DocumentTypeKey] ??
        tmpl.document_type;

      const blob = generateSignedPdf({
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
      });


      const timestamp = Date.now();
      const safeType = tmpl.document_type.replace(/[^a-z0-9_-]/gi, '_');
      const filePath = `${orgId}/${driverRow.id}/${safeType}-${timestamp}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('signed-documents')
        .upload(filePath, blob, {
          contentType: 'application/pdf',
          upsert: false,
        });
      if (uploadError) throw uploadError;

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
        attachment_file_path: attachmentPath,
        driver_address: tState.driverAddress || null,
        signature_data_url: tState.signature,
      });
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


    setSignedResults(results);

    if (!revisionMode) {
      // Mark onboarding complete on the user's profile so guards unlock the dashboard.
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('user_id', user.id);
      if (profileError) {
        console.error('Failed to mark onboarding complete:', profileError);
      } else {
        await refreshOrgData();
      }
    }

    toast.success(revisionMode ? 'Revisions resubmitted. Admin will be notified.' : 'Documents submitted successfully');
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
          // Jump to the first template needing revision
          const idx = templates.findIndex(
            (t) => docRevisions[t.document_type]?.status === 'revision_requested',
          );
          setStepIndex(idx >= 0 ? idx + 2 : 2);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        if (totalSteps > 2) {
          setStepIndex(2);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          // No documents — credentials alone complete the flow
          setSignedResults([]);
          await supabase
            .from('profiles')
            .update({ onboarding_completed: true })
            .eq('user_id', user!.id);
          await refreshOrgData();
          toast.success('Profile saved');
        }
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
                onClick={() => {
                  try { localStorage.setItem('pending_driver_tour', '1'); } catch { /* ignore */ }
                  navigate('/driver-dashboard', { replace: true, state: { startTour: true } });
                }}
              >
                Go to Dashboard
              </Button>
            </div>

          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = ((stepIndex + 1) / totalSteps) * 100;
  const docType = currentTemplate?.document_type as DocumentTypeKey | undefined;
  const title = isEmploymentStep
    ? 'Choose Your Employment Type'
    : isCredentialsStep
    ? 'Driver Profile & Credentials'
    : currentTemplate?.name ??
      (docType ? DOCUMENT_LABELS[docType] : undefined) ??
      currentTemplate?.document_type ??
      '';

  const currentDocRevision = currentTemplate
    ? docRevisions[currentTemplate.document_type]
    : undefined;
  const stepRevisionNotes = isCredentialsStep
    ? credentialsRevisionNotes
    : currentDocRevision?.status === 'revision_requested'
      ? currentDocRevision.notes
      : null;

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
              : 'Please review the document below, fill in the required fields, and sign at the bottom.'}
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
          ) : currentTemplate ? (
            <div className="rounded-sm bg-white text-slate-900 shadow-2xl p-8 md:p-12 lg:px-16 lg:py-14 max-w-4xl mx-auto font-serif leading-relaxed print:shadow-none print:p-0 print:break-after-page">
              <DocumentTemplateRenderer
                content={currentChunk}
                driverAddress={currentState.driverAddress}
                onDriverAddressChange={(v) => updateCurrent({ driverAddress: v })}
                signature={currentState.signature}
                onSignatureCapture={(dataUrl) =>
                  updateCurrent({ signature: dataUrl ? dataUrl : null })
                }
                driverName={`${driverRow?.first_name ?? ''} ${driverRow?.last_name ?? ''}`.trim()}
                cdlNumber={currentState.cdlNumber}
                onCdlNumberChange={(v) => updateCurrent({ cdlNumber: v })}
                attachment={currentState.attachment}
                onAttachmentChange={(file) => updateCurrent({ attachment: file })}
                licenseNumber={driverRow?.license_number}
                licenseExpiry={driverRow?.license_expiry}
                medicalCardExpiry={driverRow?.medical_card_expiry}
                endorsements={driverRow?.endorsements}
                hasTwic={driverRow?.has_twic}
                twicExpiry={driverRow?.twic_expiry}
                phoneNumber={driverRow?.phone}
                payType={driverRow?.pay_type}
                payRate={driverRow?.pay_rate}
                ssn={currentState.ssn}
                onSsnChange={(v) => updateCurrent({ ssn: v })}
                email={currentState.email}
                onEmailChange={(v) => updateCurrent({ email: v })}
                bankName={currentState.bankName}
                onBankNameChange={(v) => updateCurrent({ bankName: v })}
                routingNumber={currentState.routingNumber}
                onRoutingNumberChange={(v) => updateCurrent({ routingNumber: v })}
                accountNumber={currentState.accountNumber}
                onAccountNumberChange={(v) => updateCurrent({ accountNumber: v })}
                bankAccountType={currentState.bankAccountType}
                onBankAccountTypeChange={(v) => updateCurrent({ bankAccountType: v })}
                employmentType={employmentType}
              />

              {chunkCount > 1 && (
                <div className="hidden print:block">
                  {chunks.map((chunk, idx) =>
                    idx === safeSubPageIndex ? null : (
                      <div
                        key={`print-chunk-${idx}`}
                        className="print:break-before-page print:break-after-page"
                      >
                        <DocumentTemplateRenderer
                          content={chunk}
                          driverAddress={currentState.driverAddress}
                          onDriverAddressChange={() => {}}
                          signature={currentState.signature}
                          onSignatureCapture={() => {}}
                          driverName={`${driverRow?.first_name ?? ''} ${driverRow?.last_name ?? ''}`.trim()}
                          cdlNumber={currentState.cdlNumber}
                          onCdlNumberChange={() => {}}
                          attachment={currentState.attachment}
                          licenseNumber={driverRow?.license_number}
                          licenseExpiry={driverRow?.license_expiry}
                          medicalCardExpiry={driverRow?.medical_card_expiry}
                          endorsements={driverRow?.endorsements}
                          hasTwic={driverRow?.has_twic}
                          twicExpiry={driverRow?.twic_expiry}
                          phoneNumber={driverRow?.phone}
                          payType={driverRow?.pay_type}
                          payRate={driverRow?.pay_rate}
                          ssn={currentState.ssn}
                          email={currentState.email}
                          bankName={currentState.bankName}
                          routingNumber={currentState.routingNumber}
                          accountNumber={currentState.accountNumber}
                          bankAccountType={currentState.bankAccountType}
                          employmentType={employmentType}
                        />
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          ) : null}

        </CardContent>
      </Card>
    </div>

    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white dark:bg-background shadow-[0_-2px_8px_-4px_rgba(0,0,0,0.08)]">
      <div className="container max-w-4xl flex items-center justify-between gap-3 py-3 px-4">
        {!isCredentialsStep && safeSubPageIndex > 0 ? (
          <Button
            variant="outline"
            onClick={() => {
              setCurrentSubPageIndex((i) => Math.max(0, i - 1));
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            disabled={submitting}
          >
            Previous Page
          </Button>
        ) : (
          <Button
            variant="outline"
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            disabled={stepIndex === 0 || submitting}
          >
            Back
          </Button>
        )}

        <div className="hidden sm:flex flex-col items-center text-xs leading-tight">
          <span className="text-muted-foreground">
            {isCredentialsStep
              ? `Step ${stepIndex + 1} of ${totalSteps}`
              : chunkCount > 1
                ? `Page ${safeSubPageIndex + 1} of ${chunkCount} · Step ${stepIndex + 1}/${totalSteps}`
                : `Step ${stepIndex + 1} of ${totalSteps}`}
          </span>
          {!isCredentialsStep && !isEmploymentStep && (
            fieldsRemaining > 0 ? (
              <span className="text-orange-600 dark:text-orange-400 font-medium mt-0.5">
                Fields remaining: {fieldsRemaining}
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                Document ready to sign!
              </span>
            )
          )}
        </div>


        {!isCredentialsStep && !isLastSubPage ? (
          <Button
            onClick={() => {
              setCurrentSubPageIndex((i) => i + 1);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            disabled={submitting}
          >
            Next Page
          </Button>
        ) : (
          <Button onClick={handleContinue} disabled={!canContinue || submitting}>
            {submitting
              ? isCredentialsStep
                ? 'Saving…'
                : 'Submitting…'
              : isEmploymentStep
                ? 'Next'
                : isCredentialsStep
                  ? 'Continue'
                  : isLastTemplateStep
                    ? 'Submit Document'
                    : 'Continue'}
          </Button>
        )}
      </div>
    </div>

    </div>
  );
}

