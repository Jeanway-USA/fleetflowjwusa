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
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/formatters';
import { addDays, format } from 'date-fns';

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

export function GenerateSettlementsDialog({ open, onOpenChange, drivers, onGenerated }: Props) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const [periodEnd, setPeriodEnd] = useState<string>(today);
  const [paymentDate, setPaymentDate] = useState<string>(
    format(addDays(new Date(), 5), 'yyyy-MM-dd'),
  );
  const [allDrivers, setAllDrivers] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setPeriodEnd(today);
      setPaymentDate(format(addDays(new Date(), 5), 'yyyy-MM-dd'));
      setAllDrivers(true);
      setSelected(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const targetIds = useMemo(() => {
    if (allDrivers) return null;
    return Array.from(selected);
  }, [allDrivers, selected]);

  const generate = useMutation({
    mutationFn: async () => {
      if (!allDrivers && (!targetIds || targetIds.length === 0)) {
        throw new Error('Select at least one driver, or choose "All active drivers".');
      }
      if (!periodEnd || !paymentDate) {
        throw new Error('Pay period end and payment date are required.');
      }
      const { data, error } = await supabase.rpc('generate_driver_settlements', {
        _driver_ids: targetIds,
        _period_end: periodEnd,
        _payment_date: paymentDate,
      });
      if (error) throw error;
      return data ?? [];
    },
    onSuccess: (rows: any[]) => {
      const total = rows.reduce((s, r) => s + Number(r.net_pay ?? 0), 0);
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

  const toggleDriver = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Generate Settlement Statements</DialogTitle>
          <DialogDescription>
            Aggregates all completed loads, advances, deductions, and reimbursements since each
            driver's last settlement up to and including the Pay Period End Date.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="period-end">Pay Period End Date</Label>
              <Input
                id="period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment-date">Payment Date</Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Target Drivers</Label>
              <Badge variant="outline">
                {allDrivers ? `${drivers.length} active` : `${selected.size} selected`}
              </Badge>
            </div>

            <label className="flex items-center gap-2 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/50">
              <Checkbox
                checked={allDrivers}
                onCheckedChange={(v) => setAllDrivers(Boolean(v))}
              />
              <span className="text-sm font-medium">All active drivers</span>
            </label>

            {!allDrivers && (
              <ScrollArea className="h-64 rounded-md border border-border p-2">
                <div className="space-y-1">
                  {drivers.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2">No active drivers.</p>
                  ) : (
                    drivers.map((d) => (
                      <label
                        key={d.id}
                        className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={selected.has(d.id)}
                          onCheckedChange={(v) => toggleDriver(d.id, Boolean(v))}
                        />
                        <span className="text-sm">{driverName(d)}</span>
                      </label>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <LoadingButton
            loading={generate.isPending}
            onClick={() => generate.mutate()}
            className="gradient-gold text-primary-foreground"
          >
            Generate
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
