import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, PenLine, Clock, CheckCircle2, FileSignature, ArrowRight, Send, RotateCcw } from 'lucide-react';
import { SendDocumentDialog } from '@/components/documents/SendDocumentDialog';
import { ReopenDocumentDialog } from '@/components/documents/ReopenDocumentDialog';

type InstanceStatus = 'draft' | 'pending_signatures' | 'completed' | 'voided';

interface DocumentInstance {
  id: string;
  template_id: string | null;
  title: string;
  status: InstanceStatus;
  signatory_roles: string[];
  current_step: number;
  assigned_to_user: string | null;
  driver_id: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
}

export default function DocumentsSigning() {
  const { orgId, user, roles, canSimulateRoles } = useAuth();
  const [sendOpen, setSendOpen] = useState(false);

  const { data: instances = [], isLoading, refetch } = useQuery({
    queryKey: ['document_instances', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_instances')
        .select('*')
        .eq('org_id', orgId!)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DocumentInstance[];
    },
  });

  const { data: mySignatures = [] } = useQuery({
    queryKey: ['document_signatures_mine', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_signatures')
        .select('instance_id, step_index')
        .eq('signer_id', user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const mySignedSet = useMemo(
    () => new Set(mySignatures.map((s) => `${s.instance_id}:${s.step_index}`)),
    [mySignatures],
  );

  const roleMatchesCurrentStep = (inst: DocumentInstance): boolean => {
    if (inst.status !== 'pending_signatures') return false;
    const stepRole = inst.signatory_roles[inst.current_step];
    if (!stepRole) return false;
    // Assigned user takes priority when set.
    if (inst.assigned_to_user) return inst.assigned_to_user === user?.id;
    return roles.includes(stepRole as (typeof roles)[number]);
  };

  const actionRequired = instances.filter(
    (i) => roleMatchesCurrentStep(i) && !mySignedSet.has(`${i.id}:${i.current_step}`),
  );
  const pendingOthers = instances.filter(
    (i) => i.status === 'pending_signatures' && !actionRequired.includes(i),
  );
  const completed = instances.filter((i) => i.status === 'completed');

  return (
    <>
      <PageHeader
        title="Document Signing"
        description="Sign, route, and track documents across your organization."
      >
        {canSimulateRoles && (
          <Button onClick={() => setSendOpen(true)} className="h-11 gradient-gold text-primary-foreground">
            <Send className="h-4 w-4 mr-2" />
            Send document
          </Button>
        )}
      </PageHeader>

      <Tabs defaultValue="action">
        <TabsList>
          <TabsTrigger value="action" className="gap-2">
            <PenLine className="h-4 w-4" />
            Action Required
            {actionRequired.length > 0 && (
              <Badge variant="destructive" className="ml-1">{actionRequired.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pending Others
            <Badge variant="secondary" className="ml-1">{pendingOthers.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Completed
            <Badge variant="secondary" className="ml-1">{completed.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <TabsContent value="action" className="space-y-3">
                <InstanceList rows={actionRequired} emptyMessage="You're all caught up." highlight />
              </TabsContent>
              <TabsContent value="pending" className="space-y-3">
                <InstanceList rows={pendingOthers} emptyMessage="Nothing waiting on others." />
              </TabsContent>
              <TabsContent value="completed" className="space-y-3">
                <InstanceList rows={completed} emptyMessage="No completed documents yet." />
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>

      <SendDocumentDialog
        open={sendOpen}
        onOpenChange={setSendOpen}
        onSent={() => {
          setSendOpen(false);
          refetch();
        }}
      />
    </>
  );
}

function InstanceList({
  rows,
  emptyMessage,
  highlight = false,
}: {
  rows: DocumentInstance[];
  emptyMessage: string;
  highlight?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <Card className="card-elevated">
        <CardContent className="flex flex-col items-center justify-center py-14 text-center">
          <FileSignature className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      {rows.map((r) => (
        <Card key={r.id} className={`card-elevated ${highlight ? 'border-primary/50' : ''}`}>
          <CardContent className="p-4 flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[220px]">
              <div className="font-medium">{r.title}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Step {Math.min(r.current_step + 1, r.signatory_roles.length)} of{' '}
                {r.signatory_roles.length} · {r.signatory_roles.join(' → ')}
              </div>
            </div>
            <StatusBadge status={r.status} />
            <div className="text-xs text-muted-foreground w-28 text-right">
              {new Date(r.updated_at).toLocaleDateString()}
            </div>
            <Button asChild size="sm" variant={highlight ? 'default' : 'outline'}>
              <Link to={`/documents/signing/${r.id}`}>
                Open
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function StatusBadge({ status }: { status: InstanceStatus }) {
  const map: Record<InstanceStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    draft: { label: 'Draft', variant: 'outline' },
    pending_signatures: { label: 'Awaiting signatures', variant: 'secondary' },
    completed: { label: 'Completed', variant: 'default' },
    voided: { label: 'Voided', variant: 'destructive' },
  };
  const cfg = map[status];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
