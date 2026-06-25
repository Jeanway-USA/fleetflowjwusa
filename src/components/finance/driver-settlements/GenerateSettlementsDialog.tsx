import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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
import { formatCurrency } from '@/lib/formatters';
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

export function GenerateSettlementsDialog({
  open,
  onOpenChange,
  drivers,
  onGenerated,
}: Props) {
  const [periodEnd, setPeriodEnd] = useState<Date>(new Date());
  const [periodStart, setPeriodStart] = useState<Date>(addDays(new Date(), -6));
  const [paymentDate, setPaymentDate] = useState<Date>(nextThursday());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      const end = new Date();
      setPeriodEnd(end);
      setPeriodStart(addDays(end, -6));
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
      const targetIds = allSelected ? null : Array.from(selected);
      const { data, error } = await supabase.rpc('generate_driver_settlements', {
        _driver_ids: targetIds,
        _period_start: format(periodStart, 'yyyy-MM-dd'),
        _period_end: format(periodEnd, 'yyyy-MM-dd'),
        _payment_date: format(paymentDate, 'yyyy-MM-dd'),
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    onSuccess: (rows) => {
      const total = rows.reduce((s, r: any) => s + Number(r.net_pay ?? 0), 0);
      toast.success(
        rows.length === 0
          ? 'No drivers had activity in this period.'
          : `Generated ${rows.length} settlement${rows.length === 1 ? '' : 's'} (Net ${formatCurrency(total)}).`,
      );
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
                    {periodStart ? format(periodStart, 'PPP') : <span>Pick a date</span>}
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
                    {periodEnd ? format(periodEnd, 'PPP') : <span>Pick a date</span>}
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
                    {paymentDate ? format(paymentDate, 'PPP') : <span>Pick a date</span>}
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
