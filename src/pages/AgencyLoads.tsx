import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import { Field, FormSection } from '@/components/shared/FormParts';
import { Roster, RosterToolbar, RosterBulkBar, downloadCsv, type RosterEntry } from '@/components/fleet/Roster';
import { Panel, StatementLine } from '@/components/finance/statement-ui';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Pencil, MoreHorizontal, Briefcase, Archive, Download } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { BulkStatusEditDialog } from '@/components/shared/BulkStatusEditDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Database } from '@/integrations/supabase/types';
import { cityState, formatCurrency } from '@/lib/formatters';
import { DEFAULT_BCO_SPLIT_PCT, bcoPayout, landstarBilled, marginPercent, summarizeAgencyLoads } from '@/lib/agency-load-math';

type AgencyLoad = Database['public']['Tables']['agency_loads']['Row'];
type AgencyLoadInsert = Database['public']['Tables']['agency_loads']['Insert'];

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'booked', label: 'Booked' },
  { value: 'in_transit', label: 'In transit' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

const day = (d: string | null | undefined) => {
  if (!d) return null;
  try {
    return format(parseISO(d.length === 10 ? `${d}T00:00:00` : d), 'EEE MMM d');
  } catch {
    return null;
  }
};

const wholeDollars = (v: number) => formatCurrency(v, { maximumFractionDigits: 0 });

export default function AgencyLoads() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLoad, setEditingLoad] = useState<AgencyLoad | null>(null);
  const [formData, setFormData] = useState<Partial<AgencyLoadInsert>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [massDeleteOpen, setMassDeleteOpen] = useState(false);
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: loads = [], isLoading } = useQuery({
    queryKey: ['agency_loads'],
    queryFn: async () => {
      const { data, error } = await supabase.from('agency_loads').select('*').is('deleted_at', null).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (load: AgencyLoadInsert) => {
      const { error } = await supabase.from('agency_loads').insert(load);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency_loads'] });
      toast.success('Load created successfully');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AgencyLoad> & { id: string }) => {
      const { error } = await supabase.from('agency_loads').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agency_loads'] });
      toast.success('Load updated successfully');
      closeDialog();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { archiveWithUndo } = await import('@/lib/soft-delete');
      await archiveWithUndo({ table: 'agency_loads', id, queryClient, invalidateKeys: [['agency_loads']] });
    },
    onError: (error) => toast.error(error.message),
  });

  const openDialog = (load?: AgencyLoad) => {
    setEditingLoad(load || null);
    setFormData(load || { status: 'pending' });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingLoad(null);
    setFormData({});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.origin || !formData.destination) {
      toast.error('Pickup and delivery are required');
      return;
    }
    if (editingLoad) {
      updateMutation.mutate({ id: editingLoad.id, ...formData });
    } else {
      createMutation.mutate(formData as AgencyLoadInsert);
    }
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filtered = loads.filter((l) => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [l.load_reference, l.broker_name, l.carrier_name, l.origin, l.destination, l.status, l.notes].filter(Boolean).join(' ').toLowerCase().includes(q);
  });
  const totals = summarizeAgencyLoads(filtered);

  const entries: RosterEntry[] = filtered.map((l) => {
    const pct = marginPercent(l);
    const margin = Number(l.margin) || 0;
    const reference = l.load_reference || `#${l.id.slice(0, 8)}`;
    const dates = [day(l.pickup_date), day(l.delivery_date)].filter(Boolean).join(' to ');
    const landstarSide = Number(l.gross_linehaul) > 0;
    return {
      id: l.id,
      title: reference,
      onOpen: () => openDialog(l),
      chips: (
        <>
          <StatusBadge status={l.status} />
          {l.exception_status && l.exception_status !== 'normal' && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${l.exception_status === 'disrupted' ? 'bg-destructive/15 text-destructive' : 'bg-warning/15 text-warning'}`}>
              {l.exception_status === 'disrupted' ? 'Disrupted' : 'Update pending'}
            </span>
          )}
          {l.pay2day && <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">Pay2Day</span>}
        </>
      ),
      subtitle: (
        <>
          <span className="font-medium text-foreground">{cityState(l.origin) || 'Pickup not set'} to {cityState(l.destination) || 'Delivery not set'}</span>
          {dates && <span className="block tabular-nums">{dates}</span>}
        </>
      ),
      facts: [
        { label: 'Broker', value: l.broker_name || <span className="font-normal text-muted-foreground">Not set</span> },
        { label: 'Carrier', value: l.carrier_name || <span className="font-normal text-muted-foreground">Not set</span> },
        { label: 'Margin', value: `${formatCurrency(margin)}${pct !== null ? `, ${pct.toFixed(1)}%` : ''}`, tone: margin >= 0 ? ('good' as const) : ('bad' as const) },
        ...(landstarSide ? [{ label: 'You are paid', value: formatCurrency(bcoPayout(l)) }] : []),
      ],
      menu: (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Actions for load ${reference}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openDialog(l)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(l.id)}><Archive className="mr-2 h-4 w-4" /> Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    };
  });

  const exportCsv = () =>
    downloadCsv(
      'agency-loads',
      ['Reference', 'Status', 'Broker', 'Carrier', 'Pickup', 'Delivery', 'Pickup date', 'Delivery date', 'Broker rate', 'Carrier rate', 'Margin', 'Gross linehaul', 'Fuel surcharge', 'Tarp fee', 'Split %', 'You are paid'],
      filtered.map((l) => [l.load_reference, l.status, l.broker_name, l.carrier_name, l.origin, l.destination, l.pickup_date, l.delivery_date, l.broker_rate, l.carrier_rate, l.margin, l.gross_linehaul, l.fuel_surcharge, l.tarp_fee, l.bco_split_pct, bcoPayout(l)]),
    );

  const split = Number(formData.bco_split_pct) || DEFAULT_BCO_SPLIT_PCT;
  const set = (patch: Partial<AgencyLoadInsert>) => setFormData({ ...formData, ...patch });
  const money = (v: string, key: keyof AgencyLoadInsert) => set({ [key]: v === '' ? null : parseFloat(v) } as Partial<AgencyLoadInsert>);

  return (
    <>
      <PageHeader title="Agency Loads" description="Brokerage loads, and what each one leaves you" action={{ label: 'Add load', onClick: () => openDialog() }} />

      {!isLoading && loads.length === 0 ? (
        <EmptyState icon={Briefcase} title="No agency loads yet" description="Add your first brokerage load to start tracking margins." action={{ label: 'Add first load', onClick: () => openDialog() }} />
      ) : (
        <>
          <Panel title="Margin on these loads" description="Cancelled loads are left out." className="mb-5">
            <StatementLine label="Brokers pay" note={`${totals.loads} ${totals.loads === 1 ? 'load' : 'loads'}, ${totals.open} not delivered`} value={isLoading ? '…' : wholeDollars(totals.brokerPays)} />
            <StatementLine label="Carriers are paid" value={isLoading ? '…' : `−${wholeDollars(totals.carrierCost)}`} rule="single" />
            <StatementLine label="Margin" note={totals.brokerPays > 0 ? `${((totals.margin / totals.brokerPays) * 100).toFixed(1)}% of what brokers pay` : undefined} value={isLoading ? '…' : wholeDollars(totals.margin)} strong rule="double" />
            {totals.bcoPayout > 0 && <StatementLine label="Paid to you on Landstar loads" note="Your split of linehaul, plus fuel surcharge and tarp fee in full" value={wholeDollars(totals.bcoPayout)} muted rule="single" />}
          </Panel>

          <RosterToolbar search={search} onSearch={setSearch} placeholder="Search reference, broker, carrier, city">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 w-full sm:w-[170px]" aria-label="Status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" className="h-11" onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </RosterToolbar>

          <RosterBulkBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
            <Button variant="outline" className="h-11" onClick={() => setMassEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" /> Change status
            </Button>
            <Button variant="outline" className="h-11 text-destructive" onClick={() => setMassDeleteOpen(true)}>
              <Archive className="mr-2 h-4 w-4" /> Archive
            </Button>
          </RosterBulkBar>

          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading…</div>
          ) : (
            <Roster entries={entries} selectedIds={selectedIds} onToggle={toggleSelect} empty="No loads match your filters." />
          )}
        </>
      )}

      <ConfirmDeleteDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        onConfirm={async () => {
          setBulkUpdating(true);
          try {
            const { archiveManyWithUndo } = await import('@/lib/soft-delete');
            await archiveManyWithUndo({ table: 'agency_loads', ids: [...selectedIds], queryClient, invalidateKeys: [['agency_loads']] });
            setSelectedIds(new Set());
            setMassDeleteOpen(false);
          } catch (e: any) { toast.error(e.message); }
          finally { setBulkUpdating(false); }
        }}
        title="Archive Selected Loads"
        description={`Archive ${selectedIds.size} load(s)? They can be restored from the Archive page.`}
        isDeleting={bulkUpdating}
      />
      <BulkStatusEditDialog
        open={massEditOpen}
        onOpenChange={setMassEditOpen}
        onConfirm={async (status) => {
          setBulkUpdating(true);
          try {
            const { error } = await supabase.from('agency_loads').update({ status }).in('id', [...selectedIds]);
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['agency_loads'] });
            toast.success(`${selectedIds.size} load(s) updated`);
            setSelectedIds(new Set());
            setMassEditOpen(false);
          } catch (e: any) { toast.error(e.message); }
          finally { setBulkUpdating(false); }
        }}
        count={selectedIds.size}
        entityName="loads"
        isUpdating={bulkUpdating}
        statusOptions={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{editingLoad ? `Edit load ${editingLoad.load_reference || ''}`.trim() : 'Add an agency load'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <FormSection title="The load">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Load reference" htmlFor="load_reference">
                  <Input id="load_reference" value={formData.load_reference || ''} onChange={(e) => set({ load_reference: e.target.value })} placeholder="REF-12345" />
                </Field>
                <Field label="Status" htmlFor="status">
                  <Select value={formData.status || 'pending'} onValueChange={(v) => set({ status: v })}>
                    <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Broker" htmlFor="broker_name">
                  <Input id="broker_name" value={formData.broker_name || ''} onChange={(e) => set({ broker_name: e.target.value })} />
                </Field>
                <Field label="Carrier" htmlFor="carrier_name">
                  <Input id="carrier_name" value={formData.carrier_name || ''} onChange={(e) => set({ carrier_name: e.target.value })} />
                </Field>
              </div>
            </FormSection>

            <FormSection title="Route and dates">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Pickup" htmlFor="origin">
                  <Input id="origin" value={formData.origin || ''} onChange={(e) => set({ origin: e.target.value })} placeholder="City, State" required />
                </Field>
                <Field label="Delivery" htmlFor="destination">
                  <Input id="destination" value={formData.destination || ''} onChange={(e) => set({ destination: e.target.value })} placeholder="City, State" required />
                </Field>
                <Field label="Pickup date" htmlFor="pickup_date">
                  <Input id="pickup_date" type="date" value={formData.pickup_date || ''} onChange={(e) => set({ pickup_date: e.target.value })} />
                </Field>
                <Field label="Delivery date" htmlFor="delivery_date">
                  <Input id="delivery_date" type="date" value={formData.delivery_date || ''} onChange={(e) => set({ delivery_date: e.target.value })} />
                </Field>
              </div>
            </FormSection>

            <FormSection title="Rates" description="What the broker pays and what the carrier is paid. The difference is your margin.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Broker rate" htmlFor="broker_rate">
                  <CurrencyInput id="broker_rate" value={formData.broker_rate ?? ''} onChange={(v) => money(v, 'broker_rate')} placeholder="0.00" />
                </Field>
                <Field label="Carrier rate" htmlFor="carrier_rate">
                  <CurrencyInput id="carrier_rate" value={formData.carrier_rate ?? ''} onChange={(v) => money(v, 'carrier_rate')} placeholder="0.00" />
                </Field>
              </div>
            </FormSection>

            <FormSection title="If it runs on Landstar" description="Leave these empty for a load you broker to another carrier.">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Gross linehaul" htmlFor="gross_linehaul">
                  <CurrencyInput id="gross_linehaul" value={formData.gross_linehaul ?? ''} onChange={(v) => money(v, 'gross_linehaul')} placeholder="0.00" />
                </Field>
                <Field label="Fuel surcharge" htmlFor="fuel_surcharge">
                  <CurrencyInput id="fuel_surcharge" value={formData.fuel_surcharge ?? ''} onChange={(v) => money(v, 'fuel_surcharge')} placeholder="0.00" />
                </Field>
                <Field label="Tarp fee" htmlFor="tarp_fee">
                  <CurrencyInput id="tarp_fee" value={formData.tarp_fee ?? ''} onChange={(v) => money(v, 'tarp_fee')} placeholder="0.00" />
                </Field>
                <Field label="Your split of linehaul (%)" htmlFor="bco_split_pct" hint="Landstar pays 65 to 75 percent.">
                  <Input id="bco_split_pct" type="number" step="0.5" min={65} max={75} value={formData.bco_split_pct ?? DEFAULT_BCO_SPLIT_PCT} onChange={(e) => set({ bco_split_pct: e.target.value === '' ? DEFAULT_BCO_SPLIT_PCT : parseFloat(e.target.value) })} />
                </Field>
                <Field label="Problems with this load" htmlFor="exception_status">
                  <Select value={formData.exception_status || 'normal'} onValueChange={(v) => set({ exception_status: v })}>
                    <SelectTrigger id="exception_status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">None</SelectItem>
                      <SelectItem value="disrupted">Disrupted</SelectItem>
                      <SelectItem value="pending_update">Waiting on an update</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="flex items-end pb-1">
                  <div className="flex h-11 items-center gap-3">
                    <Checkbox id="pay2day" checked={!!formData.pay2day} onCheckedChange={(checked) => set({ pay2day: !!checked })} />
                    <Label htmlFor="pay2day" className="cursor-pointer font-normal">Pay2Day fast settlement</Label>
                  </div>
                </div>
              </div>

              <Panel title="What this pays you" description="Split applies to linehaul only. Fuel surcharge and tarp fee pay through in full." className="mt-4">
                <StatementLine label="Billed on the Landstar side" note="Gross linehaul, fuel surcharge and tarp fee" value={formatCurrency(landstarBilled(formData))} />
                <StatementLine label={`Your ${split}% of linehaul`} value={formatCurrency((Number(formData.gross_linehaul) || 0) * (split / 100))} rule="single" />
                <StatementLine label="Fuel surcharge and tarp fee" value={formatCurrency((Number(formData.fuel_surcharge) || 0) + (Number(formData.tarp_fee) || 0))} rule="single" />
                <StatementLine label="You are paid" value={formatCurrency(bcoPayout(formData))} strong rule="double" />
              </Panel>
            </FormSection>

            <FormSection title="Notes">
              <Textarea id="notes" aria-label="Notes" value={formData.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Anything the next person should know" rows={3} />
            </FormSection>

            <DialogFooter className="sticky -bottom-4 z-10 -mx-4 mt-2 flex-row justify-end gap-2 border-t bg-background px-4 py-3 sm:-bottom-6 sm:-mx-6 sm:space-x-0 sm:px-6">
              <Button type="button" variant="outline" className="h-11 flex-1 sm:flex-none" onClick={closeDialog}>Cancel</Button>
              <LoadingButton type="submit" className="h-11 flex-1 bg-primary text-primary-foreground hover:bg-primary/90 sm:flex-none" loading={createMutation.isPending || updateMutation.isPending}>
                {editingLoad ? 'Save changes' : 'Add load'}
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
