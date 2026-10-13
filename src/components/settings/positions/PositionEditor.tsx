import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Field, FormSection } from '@/components/shared/FormParts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePayPackages } from '@/hooks/usePayPackages';
import { useSavePosition } from '@/hooks/usePositions';
import {
  APP_ROLE_LABELS,
  BUILTIN_DOCUMENTS,
  PERMISSION_AREAS,
  type AppRoleKey,
  type ChecklistItem,
  type Position,
  type RequiredDocument,
} from '@/lib/positions/types';

const NONE = '__none__';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  position: Position | null;
}

/** Create or edit a position: its default pay package, role, permissions, documents and checklist. */
export function PositionEditor({ open, onOpenChange, position }: Props) {
  const { orgId } = useAuth();
  const save = useSavePosition();
  const { data: packages = [] } = usePayPackages();
  const { data: templates = [] } = useQuery({
    queryKey: ['position-document-templates', orgId],
    enabled: open && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from('document_templates').select('document_type, name').eq('org_id', orgId!).eq('is_active', true);
      if (error) throw error;
      return (data ?? []) as Array<{ document_type: string; name: string | null }>;
    },
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [role, setRole] = useState<string>(NONE);
  const [packageId, setPackageId] = useState<string>(NONE);
  const [requiresOnboarding, setRequiresOnboarding] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [docs, setDocs] = useState<RequiredDocument[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(position?.name ?? '');
    setDescription(position?.description ?? '');
    setRole(position?.default_role ?? NONE);
    setPackageId(position?.default_pay_package_id ?? NONE);
    setRequiresOnboarding(position?.requires_onboarding ?? false);
    setPermissions(position?.default_permissions ?? []);
    setDocs(position?.required_documents ?? []);
    setChecklist(position?.onboarding_checklist ?? []);
  }, [open, position]);

  // Every document a position can ask for: the built-in forms and the company's own templates.
  const allDocuments = useMemo(() => {
    const map = new Map<string, RequiredDocument>();
    BUILTIN_DOCUMENTS.forEach((d) => map.set(d.key, d));
    templates.forEach((t) => map.set(t.document_type, { key: t.document_type, label: t.name || t.document_type }));
    docs.forEach((d) => !map.has(d.key) && map.set(d.key, d));
    return Array.from(map.values());
  }, [templates, docs]);

  const toggle = <T,>(list: T[], item: T, set: (v: T[]) => void, same: (a: T, b: T) => boolean) =>
    set(list.some((x) => same(x, item)) ? list.filter((x) => !same(x, item)) : [...list, item]);

  const move = (i: number, to: number) => {
    if (to < 0 || to >= checklist.length) return;
    const next = [...checklist];
    const [row] = next.splice(i, 1);
    next.splice(to, 0, row);
    setChecklist(next);
  };

  const usablePackages = packages.filter((p) => !p.archived_at || p.id === position?.default_pay_package_id);

  const submit = async () => {
    if (!name.trim()) return toast.error('Give the position a name.');
    const items = checklist.filter((c) => c.label.trim()).map((c, i) => ({ id: c.id.startsWith('new-') ? `item-${Date.now()}-${i}` : c.id, label: c.label.trim() }));
    try {
      await save.mutateAsync({
        id: position?.id ?? null,
        draft: {
          key: position?.key ?? '',
          name: name.trim(),
          description: description.trim() || null,
          is_builtin: position?.is_builtin ?? false,
          default_pay_package_id: packageId === NONE ? null : packageId,
          default_role: role === NONE ? null : (role as AppRoleKey),
          default_permissions: permissions,
          required_documents: docs,
          onboarding_checklist: items,
          requires_onboarding: requiresOnboarding,
          sort_order: position?.sort_order ?? 100,
        },
      });
      toast.success(position ? 'Position saved.' : 'Position created.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not save the position');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !save.isPending && onOpenChange(v)}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>{position ? `Edit ${position.name}` : 'New position'}</DialogTitle>
          <DialogDescription>
            These are starting points. When someone is hired into this position they are suggested, and can still be changed for that person.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto pr-1">
          <FormSection title="Details">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Position name" className="sm:col-span-2">
                <Input className="h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Yard Hand" />
              </Field>
              <Field label="Description" className="sm:col-span-2">
                <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Default pay package" description="Suggested when someone is hired into this position. Any package can be linked.">
            <Select value={packageId} onValueChange={setPackageId}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No default package</SelectItem>
                {usablePackages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}{p.archived_at ? ' (archived)' : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormSection>

          <FormSection title="Default permissions" description="The account role is what the app enforces. The areas show what this position is meant to use.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Account role">
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No account needed</SelectItem>
                    {(Object.keys(APP_ROLE_LABELS) as AppRoleKey[]).map((r) => <SelectItem key={r} value={r}>{APP_ROLE_LABELS[r]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Onboarding">
                <label className="flex min-h-[44px] items-center gap-2 text-sm">
                  <Switch checked={requiresOnboarding} onCheckedChange={setRequiresOnboarding} />
                  Must finish onboarding before using the app
                </label>
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {PERMISSION_AREAS.map((a) => (
                <label key={a.key} className="flex min-h-[44px] items-center gap-2 text-sm">
                  <Checkbox checked={permissions.includes(a.key)} onCheckedChange={() => toggle(permissions, a.key, setPermissions, (x, y) => x === y)} />
                  {a.label}
                </label>
              ))}
            </div>
          </FormSection>

          <FormSection title="Required documents" description="Forms this position must sign. Add your own under Settings → Onboarding & Documents.">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {allDocuments.map((d) => (
                <label key={d.key} className="flex min-h-[44px] items-center gap-2 text-sm">
                  <Checkbox checked={docs.some((x) => x.key === d.key)} onCheckedChange={() => toggle(docs, d, setDocs, (x, y) => x.key === y.key)} />
                  {d.label}
                </label>
              ))}
            </div>
          </FormSection>

          <FormSection title="Onboarding checklist" description="Steps to tick off for each new person. Drag order does not matter; use the arrows.">
            <div className="space-y-2">
              {checklist.map((c, i) => (
                <div key={c.id} className="flex items-center gap-1">
                  <Input className="h-11 flex-1" value={c.label} onChange={(e) => setChecklist(checklist.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="e.g. Drug test cleared" />
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={() => move(i, i + 1)} disabled={i === checklist.length - 1} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={() => setChecklist(checklist.filter((_, j) => j !== i))} aria-label="Remove step"><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setChecklist([...checklist, { id: `new-${Math.random().toString(36).slice(2, 8)}`, label: '' }])}>
                <Plus className="mr-1.5 h-4 w-4" />Add a step
              </Button>
            </div>
          </FormSection>
        </div>

        <DialogFooter>
          <Button variant="outline" className="min-h-[44px] w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <LoadingButton loading={save.isPending} disabled={save.isPending} onClick={submit} className="min-h-[44px] w-full gradient-gold text-primary-foreground sm:w-auto">
            {position ? 'Save changes' : 'Create position'}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
