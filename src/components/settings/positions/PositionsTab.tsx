import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Archive, Briefcase, Pencil, Plus, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { PositionEditor } from '@/components/settings/positions/PositionEditor';
import { useArchivePosition, usePositions, useSeedPositions } from '@/hooks/usePositions';
import { isMissingTables, usePayPackages } from '@/hooks/usePayPackages';
import { useAuth } from '@/contexts/AuthContext';
import { APP_ROLE_LABELS, type Position } from '@/lib/positions/types';

/** Settings → Compensation → Positions. Owners and payroll admins manage them; others see only their own. */
export function PositionsTab() {
  const { hasPayrollAccess } = useAuth();
  const { data: positions = [], isLoading, error } = usePositions();
  const { data: packages = [] } = usePayPackages();
  const seed = useSeedPositions();
  const archive = useArchivePosition();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [creating, setCreating] = useState(false);

  // The first time a company opens this, create the standard positions. Existing ones are never overwritten.
  const seeded = useRef(false);
  useEffect(() => {
    if (hasPayrollAccess && !isLoading && !error && positions.length === 0 && !seeded.current) {
      seeded.current = true;
      seed.mutate(undefined, { onError: (e: any) => toast.error(e.message ?? 'Could not create the standard positions') });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPayrollAccess, isLoading, error, positions.length]);

  const packageName = (id: string | null) => (id ? packages.find((p) => p.id === id)?.name ?? 'Package' : null);
  const shown = positions.filter((p) => showArchived || !p.archived_at);

  const toggleArchive = async (p: Position) => {
    const archiving = !p.archived_at;
    try {
      await archive.mutateAsync({ id: p.id, archived: archiving });
      toast.success(archiving ? `${p.name} archived. People already in it keep it.` : `${p.name} restored.`, {
        action: { label: 'Undo', onClick: () => archive.mutate({ id: p.id, archived: !archiving }) },
      });
    } catch (e: any) {
      toast.error(e.message ?? 'Could not update the position');
    }
  };

  if (error) {
    return (
      <Card className="card-elevated">
        <CardContent className="py-10 text-center">
          <Briefcase className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{isMissingTables(error) ? 'Positions are not switched on yet' : 'Positions could not load'}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {isMissingTables(error) ? 'The database update for positions has not been applied yet. Hiring works as it always has until it is.' : (error as Error).message}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-elevated">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5 text-primary" />Positions</CardTitle>
          <CardDescription>A position carries the defaults for a kind of job: pay package, documents, permissions and onboarding steps.</CardDescription>
        </div>
        {hasPayrollAccess && (
          <Button className="min-h-[44px] gradient-gold text-primary-foreground" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />New position
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {hasPayrollAccess && positions.some((p) => p.archived_at) && (
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            <Label className="cursor-pointer">Show archived</Label>
          </label>
        )}
        {(isLoading || seed.isPending) && <p className="text-sm text-muted-foreground">Loading…</p>}
        <ul className="space-y-2">
          {shown.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1 basis-60">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  {p.archived_at && <Badge variant="secondary">Archived</Badge>}
                  {p.default_role && <Badge variant="outline">{APP_ROLE_LABELS[p.default_role]}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {packageName(p.default_pay_package_id) ? `Pay: ${packageName(p.default_pay_package_id)}` : 'No default pay package'} · {p.required_documents.length} document{p.required_documents.length === 1 ? '' : 's'} · {p.onboarding_checklist.length} checklist step{p.onboarding_checklist.length === 1 ? '' : 's'}
                </p>
              </div>
              {hasPayrollAccess && (
                <div className="flex flex-wrap gap-1">
                  <Button variant="outline" className="min-h-[44px]" onClick={() => setEditing(p)} disabled={!!p.archived_at}><Pencil className="mr-1.5 h-4 w-4" />Edit</Button>
                  <Button variant="ghost" className="min-h-[44px]" onClick={() => toggleArchive(p)}>
                    {p.archived_at ? <RotateCcw className="mr-1.5 h-4 w-4" /> : <Archive className="mr-1.5 h-4 w-4" />}
                    {p.archived_at ? 'Restore' : 'Archive'}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
      <PositionEditor open={creating} onOpenChange={setCreating} position={null} />
      <PositionEditor open={!!editing} onOpenChange={(v) => !v && setEditing(null)} position={editing} />
    </Card>
  );
}
