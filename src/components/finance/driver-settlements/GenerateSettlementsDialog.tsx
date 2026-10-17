import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { toast } from 'sonner';
import { useTaxYearConfig } from '@/hooks/useTaxYearConfig';
import { applyW2WithholdingToSettlements } from '@/lib/payroll/applySettlementWithholding';
import { formatCurrency } from '@/lib/formatters';
import { useAuth } from '@/contexts/AuthContext';
import { settlementWeek } from '@/lib/settlement-week';
import { driversOnPackages, findOverlaps, generatePackageSettlements, loadPackageContext, type PackageContext } from '@/lib/pay-packages/generate';
import { cn } from '@/lib/utils';
import { addDays, format } from 'date-fns';
import { CalendarIcon, Check, ChevronsUpDown, X, Users } from 'lucide-react';

interface Driver {
  id: string;
  first_name: string | null;
  last_name: string | null;
  status: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drivers: Driver[];
  onGenerated: () => void;
}

function driverName(d: Driver) {
  return `${d.first_name ?? ''} ${d.last_name ?? ''}`.trim() || 'Driver';
}

// Today if today is Thursday (4), otherwise next Thursday
function nextThursday(from = new Date()): Date {
  const day = from.getDay();
  const diff = (4 - day + 7) % 7;
  return addDays(from, diff);
}

/** The most recent Landstar settlement week (Thursday to Wednesday) that has ended, or is ending today. */
function lastSettlementWeek() {
  const now = new Date();
  const current = settlementWeek(now);
  const endsToday = format(current.end, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd');
  return endsToday ? current : settlementWeek(now, -1);
}

export function GenerateSettlementsDialog({
  open,
  onOpenChange,
  drivers,
  onGenerated,
}: Props) {
  const [periodEnd, setPeriodEnd] = useState<Date>(lastSettlementWeek().end);
  const [periodStart, setPeriodStart] = useState<Date>(lastSettlementWeek().start);
  const [paymentDate, setPaymentDate] = useState<Date>(nextThursday());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const week = lastSettlementWeek();
      setPeriodEnd(week.end);
      setPeriodStart(week.start);
      setPaymentDate(nextThursday());
      setSelected(new Set());
      setPickerOpen(false);
    }
  }, [open]);

  const allSelected = drivers.length > 0 && selected.size === drivers.length;
  const selectedDrivers = useMemo(
    () => drivers.filter((d) => selected.has(d.id)),
    [drivers, selected],
  );

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(drivers.map((d) => d.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data: taxConfig } = useTaxYearConfig();
  const startIso = format(periodStart, 'yyyy-MM-dd');
  const endIso = format(periodEnd, 'yyyy-MM-dd');
  const { data: overlaps = [] } = useQuery({
    queryKey: ['settlement-overlaps', taxConfig?.orgId, Array.from(selected).sort().join(','), startIso, endIso],
    enabled: open && !!taxConfig?.orgId && selected.size > 0 && startIso <= endIso,
    queryFn: () => findOverlaps(taxConfig!.orgId, Array.from(selected), startIso, endIso),
  });
  const { user } = useAuth();

  const generate = useMutation({
    mutationFn: async () => {
      if (selected.size === 0) {
        throw new Error('Select at least one driver.');
      }
      if (!periodEnd || !paymentDate || !periodStart) {
        throw new Error('Pay period start, end, and payment date are required.');
      }
      if (periodStart > periodEnd) {
        throw new Error('Pay period start must be on or before the end date.');
      }
      const start = format(periodStart, 'yyyy-MM-dd');
      const end = format(periodEnd, 'yyyy-MM-dd');
      const pay = format(paymentDate, 'yyyy-MM-dd');

      // Drivers with a pay package are paid from it; everyone else goes through the original generator.
      // If the pay package tables are not set up yet, every driver is simply paid the original way.
      let context: PackageContext | null = null;
      try {
        context = await loadPackageContext();
      } catch {
        context = null;
      }
      const chosen = Array.from(selected);
      const onPackage = context ? driversOnPackages(chosen, context, end) : new Set<string>();
      const legacyIds = chosen.filter((id) => !onPackage.has(id));

      const rows: any[] = [];
      let packageSkipped: Array<{ driverId: string; reason: string }> = [];
      if (legacyIds.length > 0) {
        const targetIds = onPackage.size === 0 && allSelected ? null : legacyIds;
        const { data, error } = await supabase.rpc('generate_driver_settlements', {
          _driver_ids: targetIds,
          _period_start: start,
          _period_end: end,
          _payment_date: pay,
        });
        if (error) throw error;
        rows.push(...((data ?? []) as any[]));
      }
      if (onPackage.size > 0 && context) {
        if (!taxConfig?.orgId) throw new Error('Your organization has not finished loading. Try again in a moment.');
        const made = await generatePackageSettlements({
          orgId: taxConfig.orgId,
          userId: user?.id ?? null,
          driverIds: Array.from(onPackage),
          periodStart: start,
          periodEnd: end,
          paymentDate: pay,
          context,
          replaceDrafts: true,
        });
        rows.push(...made.rows);
        packageSkipped = made.skipped;
      }

      // Auto-apply W-2 withholding (contractors are left untouched).
      let withheld = { w2Count: 0, totalWithheld: 0 };
      if (taxConfig?.orgId && rows.length) {
        withheld = await applyW2WithholdingToSettlements(rows, {
          orgId: taxConfig.orgId,
          config: taxConfig.config,
          statesByCode: taxConfig.statesByCode,
          payFrequency: taxConfig.payFrequency,
          defaultTaxState: taxConfig.defaultTaxState,
        });
      }
      // The rows above were read before withholding was applied, so read the pay back for the message.
      let finalNet = rows.reduce((s, r: any) => s + Number(r.net_pay ?? 0), 0);
      if (rows.length > 0) {
        const { data: fresh } = await supabase.from('driver_settlements').select('net_pay').in('id', rows.map((r: any) => r.id));
        if (fresh) finalNet = fresh.reduce((s, r) => s + Number(r.net_pay ?? 0), 0);
      }
      return { rows, withheld, packageSkipped, finalNet };
    },
    onSuccess: ({ rows, withheld, packageSkipped, finalNet }) => {
      const total = finalNet;
      const requested = allSelected ? drivers.length : selected.size;
      const skipped = Math.max(0, requested - rows.length);
      const skipNote =
        skipped > 0
          ? ` ${skipped} driver${skipped === 1 ? '' : 's'} skipped (no activity, or an approved/paid statement already exists for this period).`
          : '';
      if (rows.length === 0) {
        toast.info(
          'No settlements generated. Drivers had no activity, or already have an approved/paid statement for this period.',
        );
      } else {
        toast.success(
          `Generated ${rows.length} settlement${rows.length === 1 ? '' : 's'} (Net ${formatCurrency(total)}).${
            withheld.w2Count > 0
              ? ` Withheld ${formatCurrency(withheld.totalWithheld)} in taxes for ${withheld.w2Count} W-2 employee${withheld.w2Count === 1 ? '' : 's'}.`
              : ''
          }${skipNote}`,
        );
      }
      onGenerated();
      onOpenChange(false);
    },

    onError: (e: any) => toast.error(e.message ?? 'Failed to generate settlements'),
  });

  const busy = generate.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Generate Settlement Statements</DialogTitle>
          <DialogDescription>
            Aggregates delivered loads and reimbursements since each driver's last settlement
            up to and including the Pay Period End Date.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5">
          {/* Drivers multi-select */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Drivers</Label>
              <Badge variant="outline">
                {selected.size === 0
                  ? 'None selected'
                  : allSelected
                    ? `All ${drivers.length}`
                    : `${selected.size} selected`}
              </Badge>
            </div>

            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                  disabled={busy}
                >
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {selected.size === 0 ? 'Select drivers…' : `${selected.size} selected`}
                  </span>
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search drivers…" />
                  <CommandList>
                    <CommandEmpty>No drivers found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem onSelect={toggleAll} className="cursor-pointer">
                        <div
                          className={cn(
                            'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                            allSelected ? 'bg-primary text-primary-foreground' : 'opacity-50',
                          )}
                        >
                          {allSelected && <Check className="h-3 w-3" />}
                        </div>
                        <span className="font-medium">Select all active drivers</span>
                      </CommandItem>
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup>
                      {drivers.map((d) => {
                        const isOn = selected.has(d.id);
                        return (
                          <CommandItem
                            key={d.id}
                            value={driverName(d)}
                            onSelect={() => toggleOne(d.id)}
                            className="cursor-pointer"
                          >
                            <div
                              className={cn(
                                'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                                isOn ? 'bg-primary text-primary-foreground' : 'opacity-50',
                              )}
                            >
                              {isOn && <Check className="h-3 w-3" />}
                            </div>
                            {driverName(d)}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {overlaps.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                <p className="font-medium">These dates overlap a settlement that already exists, so some loads could be paid twice:</p>
                <ul className="mt-1 list-disc pl-4">
                  {overlaps.slice(0, 5).map((o) => {
                    const d = drivers.find((x) => x.id === o.driverId);
                    return <li key={`${o.driverId}-${o.periodEnd}`}>{d ? driverName(d) : 'Driver'}: {o.periodStart} to {o.periodEnd} ({o.status})</li>;
                  })}
                </ul>
                <p className="mt-1">Pay package drivers are skipped automatically. Change the dates to start the day after the last settlement.</p>
              </div>
            )}

            {selectedDrivers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedDrivers.map((d) => (
                  <Badge key={d.id} variant="secondary" className="gap-1 pl-2 pr-1 py-1">
                    {driverName(d)}
                    <button
                      type="button"
                      onClick={() => toggleOne(d.id)}
                      disabled={busy}
                      className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5"
                      aria-label={`Remove ${driverName(d)}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Pay Period Start</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={busy}
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !periodStart && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {periodStart ? format(periodStart, 'MMM d, yyyy') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={periodStart}
                    onSelect={(d) => d && setPeriodStart(d)}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Pay Period End</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={busy}
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !periodEnd && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {periodEnd ? format(periodEnd, 'MMM d, yyyy') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={periodEnd}
                    onSelect={(d) => d && setPeriodEnd(d)}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={busy}
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !paymentDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {paymentDate ? format(paymentDate, 'MMM d, yyyy') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={paymentDate}
                    onSelect={(d) => d && setPaymentDate(d)}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                Defaults to the upcoming Thursday.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <LoadingButton
            loading={busy}
            disabled={busy || selected.size === 0}
            onClick={() => generate.mutate()}
            className="w-full sm:w-auto gradient-gold text-primary-foreground"
          >
            Generate
          </LoadingButton>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
