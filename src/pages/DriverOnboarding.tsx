import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { DocumentTemplateRenderer } from '@/components/onboarding/DocumentTemplateRenderer';

const DOCUMENT_ORDER = ['driver_agreement', 'direct_deposit'] as const;
type DocumentTypeKey = (typeof DOCUMENT_ORDER)[number];

const DOCUMENT_LABELS: Record<DocumentTypeKey, string> = {
  driver_agreement: 'Driver Agreement',
  direct_deposit: 'Direct Deposit Authorization',
};

interface TemplateState {
  driverAddress: string;
  signature: string | null;
}

export default function DriverOnboarding() {
  const navigate = useNavigate();
  const { orgId } = useAuth();

  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<Record<string, TemplateState>>({});
  const [submitting, setSubmitting] = useState(false);

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
    ? state[currentTemplate.id] ?? { driverAddress: '', signature: null }
    : { driverAddress: '', signature: null };

  const needsDriverAddress = useMemo(
    () => !!currentTemplate && /\{\{\s*driver_address\s*\}\}/.test(currentTemplate.content),
    [currentTemplate],
  );

  const canContinue =
    !!currentState.signature && (!needsDriverAddress || currentState.driverAddress.trim().length > 0);

  const updateCurrent = (patch: Partial<TemplateState>) => {
    if (!currentTemplate) return;
    setState((prev) => ({
      ...prev,
      [currentTemplate.id]: { ...currentState, ...patch },
    }));
  };

  const handleContinue = async () => {
    if (stepIndex < totalSteps - 1) {
      setStepIndex((i) => i + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Final step — submit
    setSubmitting(true);
    try {
      // TODO: persist signed documents to a future `driver_document_signatures` table.
      toast.success('Documents submitted successfully');
      navigate('/driver');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-3xl py-10">
        <Skeleton className="h-8 w-1/3 mb-4" />
        <Skeleton className="h-64 w-full" />
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
              {stepIndex === totalSteps - 1 ? 'Submit' : 'Continue'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
