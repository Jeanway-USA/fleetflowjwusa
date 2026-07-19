import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Pencil, Trash2, MoreHorizontal, Briefcase, Archive, ChevronDown } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { BulkStatusEditDialog } from '@/components/shared/BulkStatusEditDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { Database } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';

type AgencyLoad = Database['public']['Tables']['agency_loads']['Row'];
type AgencyLoadInsert = Database['public']['Tables']['agency_loads']['Insert'];

export default function AgencyLoads() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLoad, setEditingLoad] = useState<AgencyLoad | null>(null);
  const [formData, setFormData] = useState<Partial<AgencyLoadInsert>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [massDeleteOpen, setMassDeleteOpen] = useState(false);
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);

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
      await archiveWithUndo({
        table: 'agency_loads',
        id,
        queryClient,
        invalidateKeys: [['agency_loads']],
      });
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
      toast.error('Origin and destination are required');
      return;
    }
    if (editingLoad) {
      updateMutation.mutate({ id: editingLoad.id, ...formData });
    } else {
      createMutation.mutate(formData as AgencyLoadInsert);
    }
  };

  // Split a "City, ST 12345" style string into pieces so we can stack City/ST above ZIP.
  const formatAddressDisplay = (address: string | null) => {
    if (!address) return { city: '-', state: '', zip: '', full: '' };
    const parts = address.split(',').map((p) => p.trim());
    for (let i = parts.length - 1; i >= 0; i--) {
      const m = parts[i].match(/\b([A-Z]{2})\s*(\d{5}(-\d{4})?)?\b/);
      if (m) {
        const city = i > 0 ? parts[i - 1].trim() : '';
        return { city, state: m[1], zip: m[2] || '', full: address };
      }
    }
    return { city: parts[0] || '-', state: '', zip: '', full: address };
  };

  const fmtMoney = (n: number | null | undefined) =>
    `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return '-';
    try {
      return new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
    } catch { return '-'; }
  };

  const fmtDateTime = (d: string | null | undefined, tz?: string | null) => {
    if (!d) return '-';
    try {
      const dt = new Date(d);
      const s = dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
      return tz ? `${s} ${tz}` : s;
    } catch { return '-'; }
  };

  const marginPct = (l: AgencyLoad) => {
    const br = Number(l.broker_rate) || 0;
    if (!br) return null;
    return ((Number(l.margin) || 0) / br) * 100;
  };

  const RowActions = ({ load }: { load: AgencyLoad }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => openDialog(load)}>
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(load.id)}>
          <Archive className="mr-2 h-4 w-4" /> Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns = [
    {
      key: 'load',
      header: 'Load',
      render: (l: AgencyLoad) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-mono font-semibold text-foreground whitespace-normal break-words">
            {l.load_reference || l.id.slice(0, 8)}
          </span>
          {l.load_reference && (
            <span className="text-xs text-muted-foreground">{l.id.slice(0, 8)}</span>
          )}
        </div>
      ),
    },
    {
      key: 'agency',
      header: 'Agency / Carrier',
      render: (l: AgencyLoad) => (
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-medium text-foreground whitespace-normal break-words">
            {l.broker_name || 'Unassigned agency'}
          </span>
          <span className="text-xs text-muted-foreground whitespace-normal break-words">
            {l.carrier_name || 'Unassigned carrier'}
          </span>
        </div>
      ),
    },
    {
      key: 'origin',
      header: 'Origin',
      render: (l: AgencyLoad) => {
        const a = formatAddressDisplay(l.origin);
        return (
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-medium text-foreground whitespace-normal break-words">
              {[a.city, a.state].filter(Boolean).join(', ') || a.full || '-'}
            </span>
            {a.zip && <span className="text-xs text-muted-foreground">{a.zip}</span>}
          </div>
        );
      },
    },
    {
      key: 'destination',
      header: 'Destination',
      render: (l: AgencyLoad) => {
        const a = formatAddressDisplay(l.destination);
        return (
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-medium text-foreground whitespace-normal break-words">
              {[a.city, a.state].filter(Boolean).join(', ') || a.full || '-'}
            </span>
            {a.zip && <span className="text-xs text-muted-foreground">{a.zip}</span>}
          </div>
        );
      },
    },
    { key: 'status', header: 'Status', render: (l: AgencyLoad) => <StatusBadge status={l.status} /> },
    {
      key: 'margin',
      header: 'Margin',
      render: (l: AgencyLoad) => {
        const pct = marginPct(l);
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className={cn('font-semibold', Number(l.margin) >= 0 ? 'text-success' : 'text-destructive')}>
              {fmtMoney(l.margin)}
            </span>
            {pct !== null && (
              <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
            )}
          </div>
        );
      },
    },
    { key: 'actions', header: '', render: (load: AgencyLoad) => <RowActions load={load} /> },
  ];

  const renderExpanded = (l: AgencyLoad) => {
    const pct = marginPct(l);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Broker Rate</div>
            <div className="text-sm font-semibold">{fmtMoney(l.broker_rate)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Carrier Rate</div>
            <div className="text-sm font-semibold">{fmtMoney(l.carrier_rate)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Margin</div>
            <div className={cn('text-sm font-semibold', Number(l.margin) >= 0 ? 'text-success' : 'text-destructive')}>
              {fmtMoney(l.margin)}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Margin %</div>
            <div className="text-sm font-semibold">{pct !== null ? `${pct.toFixed(1)}%` : '—'}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pickup</div>
            <div className="text-sm">{l.pickup_at ? fmtDateTime(l.pickup_at, l.pickup_tz) : fmtDate(l.pickup_date)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Delivery</div>
            <div className="text-sm">{l.delivery_at ? fmtDateTime(l.delivery_at, l.delivery_tz) : fmtDate(l.delivery_date)}</div>
          </div>
          <div className="col-span-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Reference</div>
            <div className="text-sm font-mono break-all">{l.load_reference || '—'}</div>
          </div>
        </div>
        {l.notes && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
            <div className="text-sm whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/30 p-3">
              {l.notes}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderMobileCard = (l: AgencyLoad) => {
    const o = formatAddressDisplay(l.origin);
    const d = formatAddressDisplay(l.destination);
    const pct = marginPct(l);
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="font-mono font-semibold text-sm break-words">
              {l.load_reference || l.id.slice(0, 8)}
            </div>
            <div className="text-sm font-medium text-foreground break-words">
              {l.broker_name || 'Unassigned agency'}
            </div>
            <div className="text-xs text-muted-foreground break-words">
              Carrier: {l.carrier_name || 'Unassigned'}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <StatusBadge status={l.status} />
            <RowActions load={l} />
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">From</div>
            <div className="font-medium break-words">
              {[o.city, o.state].filter(Boolean).join(', ') || o.full || '-'}
            </div>
            {o.zip && <div className="text-xs text-muted-foreground">{o.zip}</div>}
          </div>
          <div className="flex items-center text-muted-foreground pl-0.5" aria-hidden>
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">To</div>
            <div className="font-medium break-words">
              {[d.city, d.state].filter(Boolean).join(', ') || d.full || '-'}
            </div>
            {d.zip && <div className="text-xs text-muted-foreground">{d.zip}</div>}
          </div>
        </div>
        <div className="flex items-center justify-between text-xs pt-2 border-t border-border/60">
          <span className={cn('font-semibold', Number(l.margin) >= 0 ? 'text-success' : 'text-destructive')}>
            {fmtMoney(l.margin)}
          </span>
          {pct !== null && <span className="text-muted-foreground">{pct.toFixed(1)}% margin</span>}
          <span className="text-muted-foreground">{fmtDate(l.pickup_date)}</span>
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHeader title="Agency Loads" description="Manage brokerage and agency loads" action={{ label: 'Add Load', onClick: () => openDialog() }} />
      <DataTable
        columns={columns}
        data={loads}
        loading={isLoading}
        emptyMessage="No agency loads yet"
        emptyDescription="Add your first brokerage load to start tracking margins."
        emptyIcon={Briefcase}
        emptyAction={{ label: 'Add First Load', onClick: () => openDialog() }}
        tableId="agency-loads"
        exportFilename="agency-loads"
        onRowDoubleClick={(load) => openDialog(load)}
        wrapCells
        expandable
        renderExpanded={renderExpanded}
        renderMobileCard={renderMobileCard}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={(ids) => (
          <>
            <Button size="sm" variant="outline" onClick={() => setMassEditOpen(true)}>
              <Pencil className="mr-1 h-3 w-3" /> Edit ({ids.size})
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setMassDeleteOpen(true)}>
              <Archive className="mr-1 h-3 w-3" /> Archive ({ids.size})
            </Button>
          </>
        )}
      />
      <ConfirmDeleteDialog
        open={massDeleteOpen}
        onOpenChange={setMassDeleteOpen}
        onConfirm={async () => {
          setBulkUpdating(true);
          try {
            const { archiveManyWithUndo } = await import('@/lib/soft-delete');
            await archiveManyWithUndo({
              table: 'agency_loads',
              ids: [...selectedIds],
              queryClient,
              invalidateKeys: [['agency_loads']],
            });
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
        statusOptions={[
          { value: 'pending', label: 'Pending' },
          { value: 'booked', label: 'Booked' },
          { value: 'in_transit', label: 'In Transit' },
          { value: 'delivered', label: 'Delivered' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLoad ? 'Edit Agency Load' : 'Add New Agency Load'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="load_reference">Load Reference</Label>
                <Input id="load_reference" value={formData.load_reference || ''} onChange={(e) => setFormData({ ...formData, load_reference: e.target.value })} placeholder="REF-12345" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status || 'pending'} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="in_transit">In Transit</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="broker_name">Broker Name</Label>
                <Input id="broker_name" value={formData.broker_name || ''} onChange={(e) => setFormData({ ...formData, broker_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carrier_name">Carrier Name</Label>
                <Input id="carrier_name" value={formData.carrier_name || ''} onChange={(e) => setFormData({ ...formData, carrier_name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="origin">Origin *</Label>
                <Input id="origin" value={formData.origin || ''} onChange={(e) => setFormData({ ...formData, origin: e.target.value })} placeholder="City, State" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="destination">Destination *</Label>
                <Input id="destination" value={formData.destination || ''} onChange={(e) => setFormData({ ...formData, destination: e.target.value })} placeholder="City, State" required />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pickup_date">Pickup Date</Label>
                <Input id="pickup_date" type="date" value={formData.pickup_date || ''} onChange={(e) => setFormData({ ...formData, pickup_date: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery_date">Delivery Date</Label>
                <Input id="delivery_date" type="date" value={formData.delivery_date || ''} onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="broker_rate">Broker Rate ($)</Label>
                <Input id="broker_rate" type="number" step="0.01" value={formData.broker_rate || ''} onChange={(e) => setFormData({ ...formData, broker_rate: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carrier_rate">Carrier Rate ($)</Label>
                <Input id="carrier_rate" type="number" step="0.01" value={formData.carrier_rate || ''} onChange={(e) => setFormData({ ...formData, carrier_rate: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <LoadingButton type="submit" className="gradient-gold text-primary-foreground" loading={createMutation.isPending || updateMutation.isPending}>
                {editingLoad ? 'Save Changes' : 'Add Load'}
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
