import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, CheckCircle2, FileText, Download } from 'lucide-react';
import { SignaturePad } from '@/components/driver/SignaturePad';
import { hydrateTokens, extractUnresolvedTokens, extractConsentKeys } from '@/lib/documents/hydrateTokens';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { composeCompletedPdf } from '@/lib/documents/composeCompletedPdf';

export default function DocumentSigningWorkspace() {
  const { instanceId } = useParams<{ instanceId: string }>();
  // Auto-navigation after signing removed so the completed PDF can render.
  const { user, orgId, roles } = useAuth();
  const queryClient = useQueryClient();

  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [printedName, setPrintedName] = useState('');
  const [signerTitle, setSignerTitle] = useState('');
  const [dateSigned, setDateSigned] = useState(() => new Date().toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ['document-instance', instanceId],
    enabled: !!instanceId && !!orgId,
    queryFn: async () => {
      const [inst, sigs] = await Promise.all([
        supabase.from('document_instances').select('*').eq('id', instanceId!).maybeSingle(),
        supabase.from('document_signatures').select('*').eq('instance_id', instanceId!).order('step_index'),
      ]);
      if (inst.error) throw inst.error;
      if (!inst.data) throw new Error('Not found');
      if (sigs.error) throw sigs.error;

      let template: {
        content: string;
        name: string | null;
        document_type: string;
      } | null = null;
      if (inst.data.template_id) {
        const { data: t, error } = await supabase
          .from('document_templates')
          .select('content, name, document_type')
          .eq('id', inst.data.template_id)
          .maybeSingle();
        if (error) throw error;
        template = t;
      }

      let driver: Record<string, unknown> | null = null;
      if (inst.data.driver_id) {
        const { data: d } = await supabase
          .from('drivers')
          .select('id, first_name, last_name, email, phone, license_number, license_state, license_expiry, medical_card_expiry, endorsements, has_twic, twic_expiry, pay_type, pay_rate')
          .eq('id', inst.data.driver_id)
          .maybeSingle();
        driver = d ?? null;
      }

      let signerProfile: { first_name: string | null; last_name: string | null; email: string | null; default_signing_title: string | null } | null = null;
      if (user?.id) {
        const { data: p } = await supabase
          .from('profiles')
          .select('first_name, last_name, email, default_signing_title')
          .eq('user_id', user.id)
          .maybeSingle();
        signerProfile = p ?? null;
      }

      let company: { name: string | null } | null = null;
      if (orgId) {
        const { data: o } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', orgId)
          .maybeSingle();
        company = o ?? null;
      }

      return {
        instance: inst.data,
        signatures: sigs.data ?? [],
        template,
        driver,
        signerProfile,
        company,
      };
    },
  });

  const instance = data?.instance;
  const templateContent = data?.template?.content ?? '';
  const stepRole = instance?.signatory_roles?.[instance.current_step] ?? '';

  const alreadySignedThisStep = useMemo(
    () => (data?.signatures ?? []).some(
      (s) => s.step_index === instance?.current_step && s.signer_id === user?.id,
    ),
    [data?.signatures, instance, user?.id],
  );

  const canSignNow = useMemo(() => {
    if (!instance || instance.status !== 'pending_signatures') return false;
    if (alreadySignedThisStep) return false;
    if (instance.assigned_to_user) return instance.assigned_to_user === user?.id;
    return roles.includes(stepRole as (typeof roles)[number]);
  }, [instance, alreadySignedThisStep, stepRole, roles, user?.id]);

  const signerName = [data?.signerProfile?.first_name, data?.signerProfile?.last_name].filter(Boolean).join(' ');
  const ctx = useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      driver: (data?.driver ?? null) as any,
      signer: { name: signerName, role: stepRole, email: data?.signerProfile?.email ?? '' },
      company: { name: data?.company?.name ?? null, address: null },
      instance: {
        id: instance?.id,
        title: instance?.title,
        metadata: { ...(instance?.metadata as Record<string, string> | null ?? {}), ...fieldValues },
      },
    }),
    [data, signerName, stepRole, instance, fieldValues],
  );

  const rendered = useMemo(() => hydrateTokens(templateContent, ctx), [templateContent, ctx]);
  const missingTokens = useMemo(() => extractUnresolvedTokens(templateContent, ctx), [templateContent, ctx]);

  useEffect(() => {
    // Prime field values from instance metadata so previously entered values persist.
    if (instance?.metadata && Object.keys(fieldValues).length === 0) {
      const m = instance.metadata as Record<string, string>;
      const seeded: Record<string, string> = {};
      for (const t of missingTokens) {
        if (m[t]) seeded[t] = m[t];
      }
      if (Object.keys(seeded).length > 0) setFieldValues(seeded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.id]);

  // Pre-fill Printed Name / Title / Date once profile + step role are known.
  useEffect(() => {
    if (!data) return;
    const meta = (instance?.metadata ?? {}) as Record<string, string>;
    const roleKey = stepRole || '';
    const existingName = meta[`${roleKey}_printed_name`];
    const existingTitle = meta[`${roleKey}_title`];
    const existingDate = meta[`${roleKey}_date_signed`];
    if (!printedName) setPrintedName(existingName || signerName || '');
    if (!signerTitle) setSignerTitle(existingTitle || data.signerProfile?.default_signing_title || '');
    if (existingDate) setDateSigned(existingDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.signerProfile?.email ?? null, signerName, stepRole]);


  // When an instance becomes completed but has no final PDF yet, build it once.
  const [composing, setComposing] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  const runCompose = () => {
    if (!instance) return;
    setComposeError(null);
    setComposing(true);
    composeCompletedPdf(instance.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['document-instance', instanceId] });
      })
      .catch((e: Error) => {
        const msg = e.message || 'Could not build completed PDF';
        setComposeError(msg);
        toast.error(msg);
      })
      .finally(() => setComposing(false));
  };

  useEffect(() => {
    if (!instance) return;
    if (instance.status !== 'completed') return;
    if (instance.pdf_storage_path) return;
    if (composing || composeError) return;
    runCompose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.id, instance?.status, instance?.pdf_storage_path]);

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!instance || !user || !orgId) throw new Error('Not ready');
      if (!signatureDataUrl) throw new Error('Capture a signature first');
      if (!printedName.trim()) throw new Error('Please enter your printed name');
      if (!signerTitle.trim()) throw new Error('Please enter your title');
      if (!dateSigned) throw new Error('Please choose a signing date');
      // Ensure all required tokens are filled.
      const unfilled = missingTokens.filter((t) => !fieldValues[t] || !fieldValues[t].trim());
      if (unfilled.length > 0) throw new Error(`Please fill: ${unfilled.join(', ')}`);

      // Merge new metadata onto the instance, including role-scoped signer info.
      const roleKey = stepRole || 'signer';
      const dateSignedFormatted = new Date(`${dateSigned}T00:00:00`).toLocaleDateString();
      const nextMeta = {
        ...(instance.metadata as Record<string, string> | null ?? {}),
        ...fieldValues,
        [`${roleKey}_printed_name`]: printedName.trim(),
        [`${roleKey}_title`]: signerTitle.trim(),
        [`${roleKey}_date_signed`]: dateSignedFormatted,
      };
      const { error: metaErr } = await supabase
        .from('document_instances')
        .update({ metadata: nextMeta })
        .eq('id', instance.id);
      if (metaErr) throw metaErr;

      // Remember the entered title on the profile for next time.
      await supabase
        .from('profiles')
        .update({ default_signing_title: signerTitle.trim() })
        .eq('user_id', user.id);

      const { error: sigErr } = await supabase.from('document_signatures').insert({
        org_id: orgId,
        instance_id: instance.id,
        signer_id: user.id,
        role_label: stepRole,
        step_index: instance.current_step,
        signature_data_url: signatureDataUrl,
      });
      if (sigErr) throw sigErr;
    },
    onSuccess: () => {
      toast.success('Signature captured');
      queryClient.invalidateQueries({ queryKey: ['document-instance', instanceId] });
      queryClient.invalidateQueries({ queryKey: ['document_instances', orgId] });
      queryClient.invalidateQueries({ queryKey: ['document_signatures_mine', user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!instance) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Document not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/documents/signing"><ArrowLeft className="h-4 w-4 mr-2" />Back</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={instance.title}
        description={`Step ${Math.min(instance.current_step + 1, instance.signatory_roles.length)} of ${instance.signatory_roles.length} · Currently: ${stepRole || '—'}`}
      >
        <Button variant="outline" asChild>
          <Link to="/documents/signing"><ArrowLeft className="h-4 w-4 mr-2" />Dashboard</Link>
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 card-elevated">
          <CardHeader>
            <CardTitle className="text-base">Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const meta = (instance.metadata ?? {}) as Record<string, string>;
              const legacyPath = meta.legacy_file_path;
              if (!legacyPath) return null;
              return (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <p className="font-medium">Backfilled from a previously signed document</p>
                    <p className="text-xs text-muted-foreground">
                      The driver already signed this document. Review the original PDF, then countersign below.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const { data: signed, error } = await supabase.storage
                        .from('signed-documents')
                        .createSignedUrl(legacyPath, 300);
                      if (error || !signed?.signedUrl) {
                        toast.error(error?.message ?? 'Could not open original document');
                        return;
                      }
                      window.open(signed.signedUrl, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <FileText className="h-4 w-4 mr-1.5" />
                    View driver's signed PDF
                  </Button>
                </div>
              );
            })()}
            <article className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap break-words">
              <ReactMarkdown>{rendered || '_This template has no content yet._'}</ReactMarkdown>
            </article>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle className="text-base">Signing progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {instance.signatory_roles.map((role, idx) => {
                const sig = (data?.signatures ?? []).find((s) => s.step_index === idx);
                const done = !!sig;
                const isCurrent = idx === instance.current_step && instance.status === 'pending_signatures';
                return (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border" />
                      )}
                      Step {idx + 1}: <strong>{role}</strong>
                    </span>
                    {isCurrent ? (
                      <Badge>Current</Badge>
                    ) : done ? (
                      <span className="text-xs text-muted-foreground">
                        {new Date(sig!.signed_at).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Waiting</span>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {canSignNow && (
            <Card className="card-elevated border-primary/40">
              <CardHeader>
                <CardTitle className="text-base">Your signature</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {missingTokens.length > 0 && (
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Fill in
                    </Label>
                    {missingTokens.map((token) => (
                      <div key={token} className="space-y-1">
                        <Label htmlFor={`f-${token}`} className="text-xs">
                          {token.replace(/_/g, ' ')}
                        </Label>
                        <Input
                          id={`f-${token}`}
                          className="h-11 pl-4 sm:pl-3"
                          value={fieldValues[token] ?? ''}
                          onChange={(e) =>
                            setFieldValues((prev) => ({ ...prev, [token]: e.target.value }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Signer details
                  </Label>
                  <div className="space-y-1">
                    <Label htmlFor="signer-printed-name" className="text-xs">Printed name</Label>
                    <Input
                      id="signer-printed-name"
                      className="h-11 pl-4 sm:pl-3"
                      value={printedName}
                      onChange={(e) => setPrintedName(e.target.value)}
                      placeholder="Full legal name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="signer-title" className="text-xs">Title</Label>
                    <Input
                      id="signer-title"
                      className="h-11 pl-4 sm:pl-3"
                      value={signerTitle}
                      onChange={(e) => setSignerTitle(e.target.value)}
                      placeholder="e.g. Founder & Managing Member"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="signer-date" className="text-xs">Date signed</Label>
                    <Input
                      id="signer-date"
                      type="date"
                      className="h-11 pl-4 sm:pl-3"
                      value={dateSigned}
                      onChange={(e) => setDateSigned(e.target.value)}
                    />
                  </div>
                </div>

                <SignaturePad onSignatureCapture={setSignatureDataUrl} />

                {signatureDataUrl && (
                  <div className="rounded border bg-muted/30 p-2">
                    <p className="text-xs text-muted-foreground mb-1">Preview</p>
                    <img src={signatureDataUrl} alt="Signature" className="max-h-16 bg-white rounded" />
                  </div>
                )}

                <Button
                  onClick={() => signMutation.mutate()}
                  disabled={signMutation.isPending || !signatureDataUrl}
                  className="w-full gradient-gold text-primary-foreground h-12"
                >
                  {signMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Sign and submit
                </Button>
              </CardContent>
            </Card>
          )}

          {!canSignNow && instance.status === 'pending_signatures' && (
            <Card className="card-elevated">
              <CardContent className="p-4 text-sm text-muted-foreground">
                {alreadySignedThisStep
                  ? 'You already signed this step. Waiting for the next signer.'
                  : `This document is waiting on a ${stepRole || 'signer'}.`}
              </CardContent>
            </Card>
          )}

          {instance.status === 'completed' && (
            <Card className="card-elevated border-green-500/40">
              <CardContent className="p-4 text-sm space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Fully signed on {instance.completed_at ? new Date(instance.completed_at).toLocaleString() : '—'}.
                </div>
                {instance.pdf_storage_path ? (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={async () => {
                      const { data: signed, error } = await supabase.storage
                        .from('signed-documents')
                        .createSignedUrl(instance.pdf_storage_path!, 300, {
                          download: `${instance.title}.pdf`,
                        });
                      if (error || !signed?.signedUrl) {
                        toast.error(error?.message ?? 'Could not open completed PDF');
                        return;
                      }
                      window.open(signed.signedUrl, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download completed PDF
                  </Button>
                ) : composeError ? (
                  <div className="space-y-2">
                    <p className="text-xs text-destructive">
                      Could not assemble the final PDF: {composeError}
                    </p>
                    <Button size="sm" variant="outline" className="w-full" onClick={runCompose} disabled={composing}>
                      {composing && <Loader2 className="h-3 w-3 mr-2 animate-spin" />}
                      Retry
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Assembling the final PDF with all signatures…
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
