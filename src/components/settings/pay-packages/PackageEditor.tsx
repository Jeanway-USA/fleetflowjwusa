import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Field, FormSection } from '@/components/shared/FormParts';
import { ComponentBuilder } from '@/components/settings/pay-packages/ComponentBuilder';
import { PayPreview } from '@/components/settings/pay-packages/PayPreview';
import { usePackageComponents, useSavePackage } from '@/hooks/usePayPackages';
import { checkFormula } from '@/lib/pay-packages/formula';
import { FORMULA_VARIABLES, POSITION_TYPES, type PayComponent, type PayPackage } from '@/lib/pay-packages/types';

const VARIABLE_NAMES = FORMULA_VARIABLES.map((v) => v.name);

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The package being edited, or null to start a new one. */
  pkg: PayPackage | null;
  /** When set, the form starts as a copy of this package (saved as a new one). */
  copyOf?: PayPackage | null;
  readOnly?: boolean;
}

export function PackageEditor({ open, onOpenChange, pkg, copyOf, readOnly }: Props) {
  const source = pkg ?? copyOf ?? null;
  const { data: sourceComponents, isLoading } = usePackageComponents(open ? source?.id ?? null : null);
  const save = useSavePackage();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [position, setPosition] = useState<string>('driver');
  const [isActive, setIsActive] = useState(true);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [components, setComponents] = useState<PayComponent[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(copyOf ? `${copyOf.name} (copy)` : source?.name ?? '');
    setDescription(source?.description ?? '');
    setPosition(source?.position_type ?? 'driver');
    setIsActive(copyOf ? true : source?.is_active ?? true);
    setStart(copyOf ? '' : source?.effective_start ?? '');
    setEnd(copyOf ? '' : source?.effective_end ?? '');
    setNote('');
    setComponents([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source?.id, copyOf?.id]);

  useEffect(() => {
    if (!open || !sourceComponents) return;
    // A copy gets brand-new lines, so saving it never touches the original's.
    setComponents(copyOf ? sourceComponents.map((c) => ({ ...c, id: `new-${c.id.slice(0, 8)}-${Math.random().toString(36).slice(2, 6)}` })) : sourceComponents);
  }, [open, sourceComponents, copyOf]);

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!name.trim()) list.push('Give the package a name.');
    if (start && end && end < start) list.push('The end date is before the start date.');
    components.forEach((c, i) => {
      const label = c.label.trim() || `Line ${i + 1}`;
      if (!c.label.trim()) list.push(`Line ${i + 1} needs a name.`);
      if (c.calculation_method === 'formula') {
        const p = checkFormula(c.formula ?? '', VARIABLE_NAMES);
        if (p) list.push(`${label}: ${p}`);
      }
    });
    return list;
  }, [name, start, end, components]);

  const submit = async () => {
    if (problems.length > 0) {
      toast.error(problems[0]);
      return;
    }
    try {
      await save.mutateAsync({
        packageId: pkg?.id ?? null,
        pkg: {
          name: name.trim(),
          description: description.trim() || null,
          position_type: position as PayPackage['position_type'],
          is_active: isActive,
          effective_start: start || null,
          effective_end: end || null,
        },
        components,
        note: note.trim() || undefined,
      });
      toast.success(pkg ? 'Package saved. A new version was recorded.' : 'Package created.');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? 'Could not save the package');
    }
  };

  const title = readOnly ? 'Pay package' : pkg ? `Edit ${pkg.name}` : copyOf ? 'Duplicate package' : 'New pay package';

  return (
    <Dialog open={open} onOpenChange={(v) => !save.isPending && onOpenChange(v)}>
      <DialogContent className="flex max-h-[92vh] max-w-6xl flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? 'This is how your pay is set up. Only owners and payroll admins can change it.'
              : 'Every rate and bonus lives here. Editing saves a new version; settlements already paid keep the version they were paid under.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid flex-1 gap-6 overflow-y-auto pr-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-6">
            <FormSection title="Details">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Package name" className="sm:col-span-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} placeholder="e.g. Company driver, 2026" className="h-11" />
                </Field>
                <Field label="Who it is for">
                  <Select value={position} onValueChange={setPosition} disabled={readOnly}>
                    <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {POSITION_TYPES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Status">
                  <label className="flex min-h-[44px] items-center gap-2 text-sm">
                    <Switch checked={isActive} onCheckedChange={setIsActive} disabled={readOnly} />
                    {isActive ? 'Active' : 'Inactive'}
                  </label>
                </Field>
                <Field label="Starts" hint="Leave empty for no start date.">
                  <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={readOnly} className="h-11" />
                </Field>
                <Field label="Ends" hint="Leave empty for no end date.">
                  <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} disabled={readOnly} className="h-11" />
                </Field>
                <Field label="Description" className="sm:col-span-2">
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={readOnly} rows={2} />
                </Field>
              </div>
            </FormSection>

            <FormSection title="Pay lines" description="Worked out top to bottom. Drag a line, or use the arrows, to change the order.">
              {pkg && isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <ComponentBuilder components={components} onChange={setComponents} readOnly={readOnly} />
              )}
            </FormSection>

            {!readOnly && pkg && (
              <Field label="What changed (optional)" hint="Shown in the version history.">
                <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-11" placeholder="e.g. Raised the per-mile rate" />
              </Field>
            )}
          </div>

          <div className="lg:sticky lg:top-0 lg:self-start">
            <FormSection title="Live preview" description="What this package pays for a sample week.">
              <PayPreview components={components} />
            </FormSection>
          </div>
        </div>

        {!readOnly && problems.length > 0 && (
          <ul className="space-y-0.5 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
            {problems.slice(0, 4).map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" className="min-h-[44px] w-full sm:w-auto" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <LoadingButton loading={save.isPending} disabled={save.isPending} onClick={submit} className="min-h-[44px] w-full gradient-gold text-primary-foreground sm:w-auto">
              {pkg ? 'Save changes' : 'Create package'}
            </LoadingButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
