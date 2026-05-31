import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Download } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { DocumentTemplateRenderer } from '@/components/onboarding/DocumentTemplateRenderer';
import {
  DriverCredentialsStep,
  buildDefaultValues,
  type DriverCredentialsStepHandle,
} from '@/components/onboarding/DriverCredentialsStep';
import { generateSignedPdf } from '@/lib/onboarding/generateSignedPdf';

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
  const { user, orgId, refreshOrgData } = useAuth();

  const [stepIndex, setStepIndex] = useState(0);
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
          'id, first_name, last_name, phone, license_number, license_expiry, medical_card_expiry, endorsements, has_twic, twic_expiry, pay_type, pay_rate',

        )
        .eq('user_id', user!.id)
        .eq('org_id', orgId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

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

  // Step 0 = credentials, Steps 1..N = templates
  const CREDENTIALS_STEP = 0;
  const isCredentialsStep = stepIndex === CREDENTIALS_STEP;
  const totalSteps = templates.length + 1;
  const templateIndex = stepIndex - 1;
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

  const canContinue = isCredentialsStep
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
        'id, first_name, last_name, phone, license_number, license_expiry, medical_card_expiry, endorsements, has_twic, twic_expiry',
      )
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (driverError) throw driverError;
    if (!driverRow) throw new Error('Driver profile not found for your account.');

    const driverName = `${driverRow.first_name ?? ''} ${driverRow.last_name ?? ''}`.trim() || 'Driver';
    const results: SignedResult[] = [];

    for (const tmpl of templates) {
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
        const file = tState.attachment;
        const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
        attachmentPath = `${orgId}/${driverRow.id}/${safeType}_attachment-${timestamp}.${ext}`;
        const { error: attachErr } = await supabase.storage
          .from('signed-documents')
          .upload(attachmentPath, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
          });
        if (attachErr) throw attachErr;
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

      // Persist latest direct deposit attachment path on the driver record
      if (attachmentPath && tmpl.document_type === 'direct_deposit') {
        const { error: driverUpdateErr } = await supabase
          .from('drivers')
          .update({ direct_deposit_attachment_url: attachmentPath })
          .eq('id', driverRow.id);
        if (driverUpdateErr) throw driverUpdateErr;
      }

      results.push({
        title,
        documentType: tmpl.document_type,
        filePath,
        blobUrl: URL.createObjectURL(blob),
      });
    }


    setSignedResults(results);

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

    toast.success('Documents submitted successfully');
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
      setSubmitting(true);
      try {
        const { data: updated, error } = await supabase
          .from('drivers')
          .update(payload)
          .eq('id', driverRow.id)
          .eq('org_id', orgId)
          .select('id');
        if (error) throw error;
        if (!updated || updated.length === 0) {
          throw new Error(
            'Could not save your credentials. Please contact your administrator.',
          );
        }
        await refetchDriver();
        if (totalSteps > 1) {
          setStepIndex(1);
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
                onClick={() =>
                  navigate('/driver-dashboard', { replace: true, state: { startTour: true } })
                }
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
  const title = isCredentialsStep
    ? 'Driver Profile & Credentials'
    : currentTemplate?.name ??
      (docType ? DOCUMENT_LABELS[docType] : undefined) ??
      currentTemplate?.document_type ??
      '';

  return (
    <div className="container max-w-4xl py-10">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground mb-2">
          Step {stepIndex + 1} of {totalSteps}
        </p>
        <Progress value={progress} />
      </div>

      {driverRow?.pay_type && (
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
            {isCredentialsStep
              ? 'Confirm your CDL, medical card, and TWIC details before reviewing onboarding documents.'
              : 'Please review the document below, fill in the required fields, and sign at the bottom.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isCredentialsStep ? (
            <DriverCredentialsStep
              ref={credentialsRef}
              defaultValues={buildDefaultValues(driverRow)}
              onValidityChange={setCredentialsValid}
            />
          ) : currentTemplate ? (
            <div className="rounded-md border bg-card p-6 print:break-after-page">
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
                          ssn={currentState.ssn}
                          email={currentState.email}
                          bankName={currentState.bankName}
                          routingNumber={currentState.routingNumber}
                          accountNumber={currentState.accountNumber}
                          bankAccountType={currentState.bankAccountType}
                        />
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
          ) : null}

          {!isCredentialsStep && chunkCount > 1 && (
            <p className="mt-4 text-xs text-muted-foreground text-right">
              Page {safeSubPageIndex + 1} of {chunkCount}
            </p>
          )}

          <div className="mt-6 flex items-center justify-between gap-2">
            {!isCredentialsStep && safeSubPageIndex > 0 ? (
              <Button
                variant="ghost"
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
                variant="ghost"
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                disabled={stepIndex === 0 || submitting}
              >
                Back
              </Button>
            )}

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
                  : isCredentialsStep
                    ? 'Continue'
                    : isLastTemplateStep
                      ? 'Sign & Submit Document'
                      : 'Continue'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
