import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Archive, CheckCircle2, Eye, FileSignature, Loader2, RotateCcw, Search, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatStrip } from '@/components/shared/StatStrip';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { RequestRevisionDialog } from '@/components/drivers/RequestRevisionDialog';
import { DOCUMENT_LABELS } from '@/components/drivers/SignedOnboardingDocuments';
import { fetchSignedDocs, type ReviewStatus, type SignedDocRow } from '@/lib/onboarding/reviewQueue';
import { cn } from '@/lib/utils';

type Tab = 'pending' | 'revision_requested' | 'approved' | 'archived';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'pending', label: 'Waiting for review' },
  { key: 'revision_requested', label: 'Changes requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'archived', label: 'Archived' },
];

const humanize = (type: string) => type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const driverName = (d: SignedDocRow) => `${d.drivers?.first_name ?? ''} ${d.drivers?.last_name ?? ''}`.trim() || 'Unknown driver';

/** Everything signed and waiting for a look, driver by driver, with the paperwork one tap away. */
export default function DocumentReview() {
  const { user, isOwner, hasRole } = useAuth();
  const canSeeFull = isOwner || hasRole('payroll_admin');
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState<{ id: string; label: string } | null>(null);
  const [approveAll, setApproveAll] = useState<{ name: string; ids: string[] } | null>(null);
  const [clearOrphans, setClearOrphans] = useState(false);

  const { data: docs = [], isLoading, error } = useQuery({ queryKey: ['document-review-queue'], queryFn: fetchSignedDocs });

  // Names for custom document templates.
  const { data: templateNames = {} } = useQuery({
    queryKey: ['document-review-template-names'],
    queryFn: async () => {
      const { data } = await supabase.from('document_templates').select('document_type, name' as never);
      const map: Record<string, string> = {};
      for (const t of (data ?? []) as unknown as Array<{ document_type: string; name: string | null }>) if (t.name) map[t.document_type] = t.name;
      return map;
    },
  });
  const labelFor = (type: string) => DOCUMENT_LABELS[type] ?? templateNames[type] ?? humanize(type);

  const review = useMutation({
    mutationFn: async (args: { ids: string[]; status: ReviewStatus; notes: string | null }) => {
      const { error } = await supabase
        .from('driver_signed_documents')
        .update({ review_status: args.status, revision_notes: args.notes, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() } as never)
        .in('id', args.ids);
      if (error) throw error;
    },
    onSuccess: () => {
      for (const key of [['document-review-queue'], ['driver_signed_documents'], ['onboarding-revisions'], ['morning-briefing']]) qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save the review'),
  });

  // Archiving hides documents without deleting them. Undo (and the Archived tab) brings them back.
  const archive = useMutation({
    mutationFn: async (args: { ids: string[]; archived: boolean }) => {
      const { error } = await supabase
        .from('driver_signed_documents')
        .update({ archived_at: args.archived ? new Date().toISOString() : null, archived_by: args.archived ? user?.id ?? null : null } as never)
        .in('id', args.ids);
      if (error) throw error;
    },
    onSuccess: () => {
      for (const key of [['document-review-queue'], ['driver_signed_documents'], ['morning-briefing']]) qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not archive'),
  });

  const live = useMemo(() => docs.filter((d) => !d.archived_at), [docs]);
  // Waiting documents whose driver is no longer on the roster: nobody can act on them.
  const orphans = useMemo(() => live.filter((d) => d.review_status === 'pending' && !d.drivers), [live]);

  const counts = useMemo(() => ({
    pending: live.filter((d) => d.review_status === 'pending').length,
    revision_requested: live.filter((d) => d.review_status === 'revision_requested').length,
    approved: live.filter((d) => d.review_status === 'approved').length,
    archived: docs.filter((d) => d.archived_at).length,
  }), [docs, live]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, SignedDocRow[]>();
    for (const d of docs) {
      if (tab === 'archived' ? !d.archived_at : d.archived_at || d.review_status !== tab) continue;
      if (q && !`${driverName(d)} ${labelFor(d.document_type)}`.toLowerCase().includes(q)) continue;
      map.set(d.driver_id, [...(map.get(d.driver_id) ?? []), d]);
    }
    // Drivers still working come first; people who have left sort to the bottom.
    const gone = (l: SignedDocRow[]) => ((l[0].drivers?.status ?? 'active').toLowerCase() === 'active' ? 0 : 1);
    return [...map.values()].sort((a, b) => gone(a) - gone(b) || driverName(a[0]).localeCompare(driverName(b[0])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, tab, search, templateNames]);

  const open = async (d: SignedDocRow) => {
    const path = canSeeFull && d.admin_file_path ? d.admin_file_path : d.file_path;
    const { data, error } = await supabase.storage.from('signed-documents').createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return toast.error(error?.message ?? 'Could not open the document');
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div>
      <PageHeader title="Document review" description="Paperwork drivers have signed, waiting for you to look at it" />

      <StatStrip className="mb-4" cells={[
        { label: 'Waiting for review', value: String(counts.pending), problem: counts.pending > 0 },
        { label: 'Changes requested', value: String(counts.revision_requested), note: 'Waiting on the driver' },
        { label: 'Approved', value: String(counts.approved) },
      ]} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex rounded-md bg-muted p-1">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn('min-h-[40px] rounded-sm px-3 text-sm font-medium', tab === t.key ? 'bg-background shadow' : 'text-muted-foreground')}>
              {t.label} <span className="text-muted-foreground">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by driver or document" className="h-11 pl-9 sm:pl-9" />
        </div>
      </div>

      {tab === 'pending' && orphans.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <p><span className="font-medium">{orphans.length} waiting document{orphans.length === 1 ? '' : 's'}</span> belong to drivers who are no longer on your roster, so no one can review them.</p>
          <Button size="sm" variant="outline" className="h-10" onClick={() => setClearOrphans(true)}><Archive className="mr-1.5 h-4 w-4" />Archive them</Button>
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}</div>
      ) : groups.length === 0 ? (
        <EmptyState icon={FileSignature} title={tab === 'pending' ? 'Nothing waiting' : tab === 'archived' ? 'Nothing archived' : 'Nothing here'} description={tab === 'pending' ? 'Every signed document has been looked at.' : 'No documents in this list.'} />
      ) : (
        <div className="space-y-4">
          {groups.map((list) => (
            <section key={list[0].driver_id} className="overflow-hidden rounded-lg border bg-card">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link to="/drivers" className="font-condensed text-xl font-bold hover:underline">{driverName(list[0])}</Link>
                  {list[0].drivers?.status && list[0].drivers.status.toLowerCase() !== 'active' && <Badge variant="outline" className="text-xs capitalize">{list[0].drivers.status}</Badge>}
                  <span className="text-sm text-muted-foreground">{list.length} document{list.length === 1 ? '' : 's'}</span>
                </div>
                {tab === 'pending' && list.length > 1 && (
                  <Button size="sm" variant="outline" className="h-10 border-success/60 text-success hover:bg-success/10" onClick={() => setApproveAll({ name: driverName(list[0]), ids: list.map((d) => d.id) })}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />Approve all {list.length}
                  </Button>
                )}
              </header>
              <ul className="divide-y">
                {list.map((d) => (
                  <li key={d.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">{labelFor(d.document_type)}</p>
                      <p className="text-xs text-muted-foreground">Signed {format(new Date(d.signed_at), "MMM d, yyyy 'at' h:mm a")}</p>
                      {d.review_status === 'revision_requested' && d.revision_notes && <p className="mt-1 text-xs text-destructive">Asked for: {d.revision_notes}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="h-10" onClick={() => open(d)}><Eye className="mr-1.5 h-4 w-4" />Open</Button>
                      {tab === 'archived' ? (
                        <Button size="sm" variant="outline" className="h-10" disabled={archive.isPending} onClick={() => archive.mutate({ ids: [d.id], archived: false })}><RotateCcw className="mr-1.5 h-4 w-4" />Restore</Button>
                      ) : (<>
                      {d.review_status !== 'approved' && (
                        <Button size="sm" variant="outline" className="h-10 border-success/60 text-success hover:bg-success/10" disabled={review.isPending} onClick={() => review.mutate({ ids: [d.id], status: 'approved', notes: null })}>
                          {review.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}Approve
                        </Button>
                      )}
                      {d.review_status !== 'revision_requested' && (
                        <Button size="sm" variant="outline" className="h-10 border-destructive/60 text-destructive hover:bg-destructive/10" disabled={review.isPending} onClick={() => setRevision({ id: d.id, label: `${labelFor(d.document_type)} for ${driverName(d)}` })}>
                          <ShieldAlert className="mr-1.5 h-4 w-4" />Ask for changes
                        </Button>
                      )}
                      {d.review_status === 'approved' && (
                        <Button size="sm" variant="ghost" className="h-10" disabled={review.isPending} onClick={() => review.mutate({ ids: [d.id], status: 'pending', notes: null })}>Mark as waiting</Button>
                      )}
                      </>)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <RequestRevisionDialog
        open={!!revision}
        onOpenChange={(o) => { if (!o) setRevision(null); }}
        itemLabel={revision?.label ?? ''}
        onConfirm={async (notes) => {
          if (!revision) return;
          await review.mutateAsync({ ids: [revision.id], status: 'revision_requested', notes });
          toast.success('Changes requested. The driver will be notified.');
        }}
      />

      <AlertDialog open={clearOrphans} onOpenChange={setClearOrphans}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {orphans.length} documents from drivers no longer on the roster?</AlertDialogTitle>
            <AlertDialogDescription>Only documents that were never approved are archived. Nothing is deleted: they move to the Archived tab, and Undo on the message afterward restores them straight away.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              const ids = orphans.map((d) => d.id);
              await archive.mutateAsync({ ids, archived: true });
              setClearOrphans(false);
              toast.success(`Archived ${ids.length} documents.`, { duration: 10000, action: { label: 'Undo', onClick: () => archive.mutate({ ids, archived: false }) } });
            }}>Archive them</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!approveAll} onOpenChange={(o) => !o && setApproveAll(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve all {approveAll?.ids.length} documents for {approveAll?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Only do this if you have looked at them. You can mark any of them as waiting again afterward.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (approveAll) { await review.mutateAsync({ ids: approveAll.ids, status: 'approved', notes: null }); toast.success('Approved.'); setApproveAll(null); } }}>Approve all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
