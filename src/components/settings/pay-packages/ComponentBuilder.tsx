import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/shared/FormParts';
import { cn } from '@/lib/utils';
import { checkFormula } from '@/lib/pay-packages/formula';
import {
  CALCULATION_METHODS,
  COMPONENT_LABELS,
  COMPONENT_TYPES,
  DEDUCTION_TYPES,
  FORMULA_VARIABLES,
  METHOD_LABELS,
  METHOD_UNITS,
  type CalculationMethod,
  type ComponentType,
  type PayComponent,
} from '@/lib/pay-packages/types';

const VARIABLE_NAMES = FORMULA_VARIABLES.map((v) => v.name);

const unitHint: Record<string, string> = {
  usd: 'Dollars',
  usd_per_week: 'Dollars each week',
  usd_per_day: 'Dollars for each day worked',
  usd_per_mile: 'Dollars for each mile',
  percent: 'Percent (for example 2 means 2%)',
};

export function newComponent(sortOrder: number): PayComponent {
  return {
    id: `new-${Math.random().toString(36).slice(2, 10)}`,
    component_type: 'base_pay',
    label: '',
    calculation_method: 'flat_weekly',
    value: 0,
    unit: METHOD_UNITS.flat_weekly,
    formula: null,
    is_taxable: true,
    is_deduction: false,
    sort_order: sortOrder,
    is_active: true,
  };
}

interface Props {
  components: PayComponent[];
  onChange: (next: PayComponent[]) => void;
  readOnly?: boolean;
}

/** The ordered list of pay lines in a package. Drag a row, or use the arrows, to reorder. */
export function ComponentBuilder({ components, onChange, readOnly }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const renumber = (list: PayComponent[]) => list.map((c, i) => ({ ...c, sort_order: i + 1 }));
  const patch = (id: string, change: Partial<PayComponent>) => onChange(components.map((c) => (c.id === id ? { ...c, ...change } : c)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= components.length || from === to) return;
    const next = [...components];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(renumber(next));
  };
  const add = () => {
    const c = newComponent(components.length + 1);
    onChange([...components, c]);
    setOpenId(c.id);
  };

  return (
    <div className="space-y-2">
      {components.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No pay lines yet. Add base pay, bonuses, or deductions to build this package.
        </div>
      )}

      {components.map((c, index) => {
        const open = openId === c.id;
        const formulaProblem = c.calculation_method === 'formula' ? checkFormula(c.formula ?? '', VARIABLE_NAMES) : null;
        return (
          <div
            key={c.id}
            draggable={!readOnly}
            onDragStart={() => setDragId(c.id)}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setOverId(c.id);
            }}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = components.findIndex((x) => x.id === dragId);
              if (from >= 0) move(from, index);
              setDragId(null);
              setOverId(null);
            }}
            className={cn(
              'rounded-lg border bg-card transition-colors',
              overId === c.id && dragId !== c.id && 'border-primary ring-1 ring-primary/40',
              dragId === c.id && 'opacity-50',
              !c.is_active && 'opacity-70',
            )}
          >
            <div className="flex items-center gap-1 p-2">
              {!readOnly && <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />}
              <button
                type="button"
                onClick={() => setOpenId(open ? null : c.id)}
                className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left"
                aria-expanded={open}
              >
                <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.label || 'Untitled line'}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {COMPONENT_LABELS[c.component_type]} · {METHOD_LABELS[c.calculation_method]}
                    {c.calculation_method !== 'formula' && ` · ${c.unit === 'percent' ? `${c.value}%` : `$${c.value}`}`}
                  </span>
                </span>
                {c.is_deduction && <Badge variant="outline">Deduction</Badge>}
                {!c.is_active && <Badge variant="secondary">Off</Badge>}
                {formulaProblem && <Badge variant="destructive">Check formula</Badge>}
              </button>
              {!readOnly && (
                <>
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={() => move(index, index - 1)} disabled={index === 0} aria-label="Move up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={() => move(index, index + 1)} disabled={index === components.length - 1} aria-label="Move down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>

            {open && (
              <div className="space-y-3 border-t p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name on the statement">
                    <Input value={c.label} onChange={(e) => patch(c.id, { label: e.target.value })} disabled={readOnly} placeholder="e.g. Weekly base" className="h-11" />
                  </Field>
                  <Field label="Type">
                    <Select
                      value={c.component_type}
                      disabled={readOnly}
                      onValueChange={(v) => {
                        const type = v as ComponentType;
                        patch(c.id, { component_type: type, is_deduction: DEDUCTION_TYPES.includes(type), is_taxable: type === 'benefit' ? false : c.is_taxable });
                      }}
                    >
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COMPONENT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{COMPONENT_LABELS[t]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="How it is worked out">
                    <Select
                      value={c.calculation_method}
                      disabled={readOnly}
                      onValueChange={(v) => {
                        const method = v as CalculationMethod;
                        patch(c.id, { calculation_method: method, unit: METHOD_UNITS[method] });
                      }}
                    >
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CALCULATION_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>{METHOD_LABELS[m]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {c.calculation_method !== 'formula' && (
                    <Field label="Amount" hint={unitHint[c.unit] ?? undefined}>
                      <Input
                        inputMode="decimal"
                        value={Number.isFinite(c.value) ? String(c.value) : ''}
                        onChange={(e) => patch(c.id, { value: Number(e.target.value.replace(/[^0-9.]/g, '')) || 0 })}
                        disabled={readOnly}
                        className="h-11"
                      />
                    </Field>
                  )}
                </div>

                {c.calculation_method === 'formula' && (
                  <Field label="Formula" hint="Use the names below with + - * / ( ), comparisons, ? :, and min, max, round, if.">
                    <Textarea
                      value={c.formula ?? ''}
                      onChange={(e) => patch(c.id, { formula: e.target.value })}
                      disabled={readOnly}
                      rows={2}
                      placeholder="incidents == 0 ? base * 0.1 : 0"
                      className="font-mono text-sm"
                    />
                    {formulaProblem ? (
                      <p className="mt-1 text-xs text-destructive">{formulaProblem}</p>
                    ) : (c.formula ?? '').trim() ? (
                      <p className="mt-1 text-xs text-muted-foreground">This formula reads correctly.</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {FORMULA_VARIABLES.map((v) => (
                        <button
                          key={v.name}
                          type="button"
                          title={v.meaning}
                          disabled={readOnly}
                          onClick={() => patch(c.id, { formula: `${c.formula ?? ''}${c.formula ? ' ' : ''}${v.name}` })}
                          className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs hover:bg-accent"
                        >
                          {v.name}
                        </button>
                      ))}
                    </div>
                  </Field>
                )}

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <label className="flex min-h-[44px] items-center gap-2 text-sm">
                    <Switch checked={c.is_taxable} onCheckedChange={(v) => patch(c.id, { is_taxable: v })} disabled={readOnly || c.is_deduction} />
                    Taxable
                  </label>
                  <label className="flex min-h-[44px] items-center gap-2 text-sm">
                    <Switch checked={c.is_deduction} onCheckedChange={(v) => patch(c.id, { is_deduction: v })} disabled={readOnly} />
                    Takes money off the pay
                  </label>
                  <label className="flex min-h-[44px] items-center gap-2 text-sm">
                    <Switch checked={c.is_active} onCheckedChange={(v) => patch(c.id, { is_active: v })} disabled={readOnly} />
                    Included
                  </label>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="ml-auto min-h-[44px] text-destructive"
                      onClick={() => onChange(renumber(components.filter((x) => x.id !== c.id)))}
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      Remove from package
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <Button type="button" variant="outline" className="min-h-[44px] w-full" onClick={add}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add pay line
        </Button>
      )}
    </div>
  );
}
