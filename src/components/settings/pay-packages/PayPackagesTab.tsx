import { todayLocal } from '@/lib/datetime';
import { useState } from 'react';
import { toast } from 'sonner';
import { Archive, Copy, Eye, History, Pencil, Plus, RotateCcw, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { PackageEditor } from '@/components/settings/pay-packages/PackageEditor';
import { PackageHistoryDialog } from '@/components/settings/pay-packages/PackageHistoryDialog';
import { isMissingTables, useArchivePackage, usePayPackages } from '@/hooks/usePayPackages';
import { useAuth } from '@/contexts/AuthContext';
import { formatDate } from '@/lib/formatters';
import type { PayPackage } from '@/lib/pay-packages/types';

function statusOf(p: PayPackage): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (p.archived_at) return { label: 'Archived', variant: 'secondary' };
  const today = todayLocal();
  if (!p.is_active) return { label: 'Inactive', variant: 'outline' };
  if (p.effective_start && p.effective_start > today) return { label: 'Starts later', variant: 'outline' };
  if (p.effective_end && p.effective_end < today) return { label: 'Ended', variant: 'secondary' };
  return { label: 'Active', variant: 'default' };
}

const dates = (p: PayPackage) =>
  p.effective_start || p.effective_end
    ? `${p.effective_start ? formatDate(p.effective_start) : 'Always'} to ${p.effective_end ? formatDate(p.effective_end) : 'no end'}`
    : 'No dates set';

/**
 * Settings → Compensation → Pay Packages. Owners and payroll admins can build and change packages; everyone
 * else can only see the package assigned to them (the database returns no others).
 */
export function PayPackagesTab() {
  const { hasPayrollAccess } = useAuth();
  const { data: packages = [], isLoading, error } = usePayPackages();
  const archive = useArchivePackage();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<PayPackage | null>(null);
  const [copyOf, setCopyOf] = useState<PayPackage | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<PayPackage | null>(null);
  const [history, setHistory] = useState<PayPackage | null>(null);

  const shown = packages.filter((p) => showArchived || !p.archived_at);

  const toggleArchive = async (p: PayPackage) => {
    const archiving = !p.archived_at;
    try {
      await archive.mutateAsync({ packageId: p.id, archived: archiving });
      toast.success(archiving ? `${p.name} archived. Settlements already paid are unchanged.` : `${p.name} restored.`, {
        action: { label: 'Undo', onClick: () => archive.mutate({ packageId: p.id, archived: !archiving }) },
      });
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update the package');
    }
  };

  if (error) {
    return (
      <Card className="card-elevated">
        <CardContent className="py-10 text-center">
          <Wallet className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{isMissingTables(error) ? 'Pay packages are not switched on yet' : 'Pay packages could not load'}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {isMissingTables(error)
              ? 'The database update for pay packages has not been applied. Until it is, every driver is paid the way they always have been.'
              : (error as Error).message}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="card-elevated">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              {hasPayrollAccess ? 'Pay packages' : 'My pay package'}
            </CardTitle>
            <CardDescription>
              {hasPayrollAccess
                ? 'Build how each person is paid. Settlements use the package in force for the pay week.'
                : 'How your pay is worked out. Only owners and payroll admins can change it.'}
            </CardDescription>
          </div>
          {hasPayrollAccess && (
            <Button className="min-h-[44px] gradient-gold text-primary-foreground" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New package
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {hasPayrollAccess && packages.some((p) => p.archived_at) && (
            <label className="flex min-h-[44px] items-center gap-2 text-sm">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} />
              <Label className="cursor-pointer">Show archived</Label>
            </label>
          )}

          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && shown.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {hasPayrollAccess ? 'No pay packages yet. Create one, then assign it to a driver from their profile.' : 'No pay package has been assigned to you yet.'}
            </div>
          )}

          <ul className="space-y-2">
            {shown.map((p) => {
              const status = statusOf(p);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      <Badge variant={status.variant}>{status.label}</Badge>
                      <span className="text-xs capitalize text-muted-foreground">{p.position_type}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {dates(p)} · Version {p.version_number ?? 1}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {hasPayrollAccess ? (
                      <>
                        <Button variant="outline" className="min-h-[44px]" onClick={() => setEditing(p)} disabled={!!p.archived_at}>
                          <Pencil className="mr-1.5 h-4 w-4" />Edit
                        </Button>
                        <Button variant="outline" className="min-h-[44px]" onClick={() => setCopyOf(p)}>
                          <Copy className="mr-1.5 h-4 w-4" />Duplicate
                        </Button>
                        <Button variant="outline" className="min-h-[44px]" onClick={() => setHistory(p)}>
                          <History className="mr-1.5 h-4 w-4" />History
                        </Button>
                        <Button variant="ghost" className="min-h-[44px]" onClick={() => toggleArchive(p)}>
                          {p.archived_at ? <RotateCcw className="mr-1.5 h-4 w-4" /> : <Archive className="mr-1.5 h-4 w-4" />}
                          {p.archived_at ? 'Restore' : 'Archive'}
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" className="min-h-[44px]" onClick={() => setViewing(p)}>
                        <Eye className="mr-1.5 h-4 w-4" />View
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <PackageEditor open={creating} onOpenChange={setCreating} pkg={null} />
      <PackageEditor open={!!editing} onOpenChange={(v) => !v && setEditing(null)} pkg={editing} />
      <PackageEditor open={!!copyOf} onOpenChange={(v) => !v && setCopyOf(null)} pkg={null} copyOf={copyOf} />
      <PackageEditor open={!!viewing} onOpenChange={(v) => !v && setViewing(null)} pkg={viewing} readOnly />
      <PackageHistoryDialog packageId={history?.id ?? null} name={history?.name ?? ''} open={!!history} onOpenChange={(v) => !v && setHistory(null)} />
    </div>
  );
}
