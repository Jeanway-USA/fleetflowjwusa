import { useMemo, useState } from 'react';
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
}

interface SignedResult {
  title: string;
  documentType: string;
  filePath: string;
  blobUrl: string;
}

export default function DriverOnboarding() {
  const navigate = useNavigate();
  const { user, orgId } = useAuth();

  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<Record<string, TemplateState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [signedResults, setSignedResults] = useState<SignedResult[] | null>(null);

  const { data: driverRow, isLoading: driverLoading } = useQuery({
    queryKey: ['driver-self', user?.id, orgId],
    enabled: !!user && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name')
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

  const totalSteps = templates.length;
  const currentTemplate = templates[stepIndex];
  const currentState: TemplateState = currentTemplate
    ? state[currentTemplate.id] ?? { driverAddress: '', signature: null, cdlNumber: '' }
    : { driverAddress: '', signature: null, cdlNumber: '' };

  const needsDriverAddress = useMemo(
    () => !!currentTemplate && /\{\{\s*driver_address\s*\}\}/.test(currentTemplate.content),
    [currentTemplate],
  );
  const needsCdlNumber = useMemo(
    () => !!currentTemplate && /\{\{\s*cdl_number\s*\}\}/.test(currentTemplate.content),
    [currentTemplate],
  );

  const canContinue =
    !!currentState.signature &&
    (!needsDriverAddress || currentState.driverAddress.trim().length > 0) &&
    (!needsCdlNumber || currentState.cdlNumber.trim().length > 0);

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
      .select('id, first_name, last_name')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (driverError) throw driverError;
    if (!driverRow) throw new Error('Driver profile not found for your account.');

    const driverName = `${driverRow.first_name ?? ''} ${driverRow.last_name ?? ''}`.trim() || 'Driver';
    const results: SignedResult[] = [];

    for (const tmpl of templates) {
      const tState = state[tmpl.id] ?? { driverAddress: '', signature: null };
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

      const { error: insertError } = await supabase.from('driver_signed_documents').insert({
        org_id: orgId,
        driver_id: driverRow.id,
        template_id: tmpl.id,
        document_type: tmpl.document_type,
        file_path: filePath,
        driver_address: tState.driverAddress || null,
        signature_data_url: tState.signature,
      });
      if (insertError) throw insertError;

      results.push({
        title,
        documentType: tmpl.document_type,
        filePath,
        blobUrl: URL.createObjectURL(blob),
      });
    }

    setSignedResults(results);
    toast.success('Documents submitted successfully');
  };

  const handleContinue = async () => {
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
      <div className="container max-w-3xl py-10">
        <Skeleton className="h-8 w-1/3 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!driverRow) {
    return (
      <div className="container max-w-3xl py-10">
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
      <div className="container max-w-3xl py-10">
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
              <Button variant="outline" onClick={() => navigate('/driver')}>
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (totalSteps === 0) {
    return (
      <div className="container max-w-3xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>No documents to sign</CardTitle>
            <CardDescription>
              There are no active onboarding documents for your organization yet. Please contact
              your dispatcher.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate('/driver')}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const progress = ((stepIndex + 1) / totalSteps) * 100;
  const docType = currentTemplate.document_type as DocumentTypeKey;
  const title =
    currentTemplate.name ?? DOCUMENT_LABELS[docType] ?? currentTemplate.document_type;

  return (
    <div className="container max-w-3xl py-10">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground mb-2">
          Step {stepIndex + 1} of {totalSteps}
        </p>
        <Progress value={progress} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            Please review the document below, fill in the required fields, and sign at the bottom.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-card p-6">
            <DocumentTemplateRenderer
              content={currentTemplate.content}
              driverAddress={currentState.driverAddress}
              onDriverAddressChange={(v) => updateCurrent({ driverAddress: v })}
              signature={currentState.signature}
              onSignatureCapture={(dataUrl) =>
                updateCurrent({ signature: dataUrl ? dataUrl : null })
              }
              driverName={`${driverRow?.first_name ?? ''} ${driverRow?.last_name ?? ''}`.trim()}
            />
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0 || submitting}
            >
              Back
            </Button>
            <Button onClick={handleContinue} disabled={!canContinue || submitting}>
              {submitting
                ? 'Submitting…'
                : stepIndex === totalSteps - 1
                  ? 'Submit'
                  : 'Continue'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
