import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { Archive as ArchiveIcon, RotateCcw, Trash2, Search } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';

import { useArchiveAccess } from '@/hooks/useArchiveAccess';
import {
  ARCHIVABLE_TABLES,
  TABLE_LABELS,
  restoreRecord,
  type ArchivableTable,
} from '@/lib/soft-delete';

/**
 * Per-table display config for the Archive page. Each entry lists which
 * columns to show and how to derive a display label for each row.
 */
type ArchiveViewConfig = {
  select: string;
  label: (r: any) => string;
  meta?: (r: any) => string | null;
};

const VIEW_CONFIG: Record<ArchivableTable, ArchiveViewConfig> = {
  drivers: {
    select: 'id, first_name, last_name, status, deleted_at',
    label: (r) => `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Driver',
    meta: (r) => r.status,
  },
  trucks: {
    select: 'id, unit_number, make, model, status, deleted_at',
    label: (r) => `${r.unit_number ?? 'Truck'} — ${r.make ?? ''} ${r.model ?? ''}`.trim(),
    meta: (r) => r.status,
  },
  trailers: {
    select: 'id, unit_number, trailer_type, status, deleted_at',
    label: (r) => `${r.unit_number ?? 'Trailer'}`,
    meta: (r) => r.trailer_type,
  },
  fleet_loads: {
    select: 'id, origin, destination, status, deleted_at, pickup_date',
    label: (r) => `${r.origin ?? '?'} → ${r.destination ?? '?'}`,
    meta: (r) => r.status,
  },
  agency_loads: {
    select: 'id, origin, destination, broker_name, status, deleted_at',
    label: (r) => `${r.origin ?? '?'} → ${r.destination ?? '?'}`,
    meta: (r) => r.broker_name,
  },
  crm_contacts: {
    select: 'id, company_name, contact_name, contact_type, deleted_at',
    label: (r) => r.company_name || r.contact_name || 'Contact',
    meta: (r) => r.contact_type,
  },
  facilities: {
    select: 'id, name, city, state, deleted_at',
    label: (r) => r.name ?? 'Facility',
    meta: (r) => [r.city, r.state].filter(Boolean).join(', ') || null,
  },
  parts_inventory: {
    select: 'id, part_number, name, deleted_at',
    label: (r) => r.name || r.part_number || 'Part',
    meta: (r) => r.part_number,
  },
  truck_stops: {
    select: 'id, name, city, state, deleted_at',
    label: (r) => r.name ?? 'Truck Stop',
    meta: (r) => [r.city, r.state].filter(Boolean).join(', ') || null,
  },
  company_resources: {
    select: 'id, name, resource_type, deleted_at',
    label: (r) => r.name ?? 'Resource',
    meta: (r) => r.resource_type,
  },
  document_templates: {
    select: 'id, title, category, deleted_at',
    label: (r) => r.title ?? 'Template',
    meta: (r) => r.category,
  },
  expenses: {
    select: 'id, expense_type, amount, expense_date, vendor, deleted_at',
    label: (r) => `${r.expense_type ?? 'Expense'} — $${Number(r.amount ?? 0).toFixed(2)}`,
    meta: (r) => r.vendor,
  },
  fuel_purchases: {
    select: 'id, vendor, total_cost, purchase_date, jurisdiction, deleted_at',
    label: (r) => `${r.vendor ?? 'Fuel'} — $${Number(r.total_cost ?? 0).toFixed(2)}`,
    meta: (r) => r.jurisdiction,
  },
  maintenance_requests: {
    select: 'id, title, status, priority, deleted_at',
    label: (r) => r.title ?? 'Maintenance Request',
    meta: (r) => r.status,
  },
  work_orders: {
    select: 'id, title, status, vendor, deleted_at',
    label: (r) => r.title ?? 'Work Order',
    meta: (r) => r.status,
  },
  incidents: {
    select: 'id, incident_type, incident_date, severity, deleted_at',
    label: (r) => `${r.incident_type ?? 'Incident'} — ${r.incident_date ?? ''}`,
    meta: (r) => r.severity,
  },
  detention_requests: {
    select: 'id, status, requested_hours, deleted_at',
    label: (r) => `Detention: ${r.requested_hours ?? 0}h`,
    meta: (r) => r.status,
  },
  driver_requests: {
    select: 'id, request_type, status, deleted_at',
    label: (r) => r.request_type ?? 'Driver Request',
    meta: (r) => r.status,
  },
  settlements: {
    select: 'id, period_start, period_end, net_pay, status, deleted_at',
    label: (r) =>
      `${r.period_start ?? '?'} → ${r.period_end ?? '?'} — $${Number(r.net_pay ?? 0).toFixed(2)}`,
    meta: (r) => r.status,
  },
  driver_settlements: {
    select: 'id, period_start, period_end, net_pay, status, deleted_at',
    label: (r) =>
      `${r.period_start ?? '?'} → ${r.period_end ?? '?'} — $${Number(r.net_pay ?? 0).toFixed(2)}`,
    meta: (r) => r.status,
  },
  driver_payroll: {
    select: 'id, period_start, period_end, net_pay, status, deleted_at',
    label: (r) =>
      `${r.period_start ?? '?'} → ${r.period_end ?? '?'} — $${Number(r.net_pay ?? 0).toFixed(2)}`,
    meta: (r) => r.status,
  },
  load_expenses: {
    select: 'id, load_id, operating_total, personal_total, deleted_at',
    label: (r) =>
      `Load ${String(r.load_id ?? '').slice(0, 8)} — $${Number(r.operating_total ?? 0).toFixed(2)}`,
    meta: (r) => (r.personal_total ? `Personal $${Number(r.personal_total).toFixed(2)}` : null),
  },
  agent_commissions: {
    select: 'id, agent_name, commission_amount, status, payout_date, deleted_at',
    label: (r) => `${r.agent_name ?? 'Agent'} — $${Number(r.commission_amount ?? 0).toFixed(2)}`,
    meta: (r) => r.status,
  },
  safety_bonus_payouts: {
    select: 'id, period_start, period_end, earned_amount, status, deleted_at',
    label: (r) =>
      `${r.period_start ?? '?'} → ${r.period_end ?? '?'} — $${Number(r.earned_amount ?? 0).toFixed(2)}`,
    meta: (r) => r.status,
  },
  load_status_logs: {
    select: 'id, load_id, previous_status, new_status, changed_at, deleted_at',
    label: (r) => `${r.previous_status ?? '?'} → ${r.new_status ?? '?'}`,
    meta: (r) => (r.load_id ? `Load ${String(r.load_id).slice(0, 8)}` : null),
  },
  load_intermediate_stops: {
    select: 'id, load_id, stop_number, stop_type, facility_name, location, deleted_at',
    label: (r) =>
      `Stop ${r.stop_number ?? '?'} — ${r.facility_name ?? r.location ?? 'Unknown'}`,
    meta: (r) => r.stop_type,
  },
  load_accessorials: {
    select: 'id, load_id, accessorial_type, amount, deleted_at',
    label: (r) => `${r.accessorial_type ?? 'Accessorial'} — $${Number(r.amount ?? 0).toFixed(2)}`,
    meta: (r) => (r.load_id ? `Load ${String(r.load_id).slice(0, 8)}` : null),
  },
  maintenance_logs: {
    select: 'id, service_type, service_date, cost, vendor, deleted_at',
    label: (r) => `${r.service_type ?? 'Service'} — $${Number(r.cost ?? 0).toFixed(2)}`,
    meta: (r) => r.vendor,
  },
};

function ArchiveTab({ table }: { table: ArchivableTable }) {
  const queryClient = useQueryClient();
  const config = VIEW_CONFIG[table];
  const label = TABLE_LABELS[table];
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<{ id: string; name: string } | null>(null);
  const [bulkPurgeOpen, setBulkPurgeOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const queryKey = ['archive', table];

  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table as any)
        .select(config.select)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => config.label(r).toLowerCase().includes(q));
  }, [rows, search, config]);

  const handleRestore = async (id: string, name: string) => {
    setIsMutating(true);
    try {
      await restoreRecord(table, id);
      toast.success(`${label.singular} "${name}" restored`);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: [table] });
    } catch (e: any) {
      toast.error(e.message || 'Restore failed');
    } finally {
      setIsMutating(false);
    }
  };

  const handleBulkRestore = async () => {
    setIsMutating(true);
    let count = 0;
    for (const id of selectedIds) {
      try {
        await restoreRecord(table, id);
        count++;
      } catch {
        /* skip failures */
      }
    }
    toast.success(`${count} ${count === 1 ? label.singular : label.plural} restored`);
    setSelectedIds(new Set());
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: [table] });
    setIsMutating(false);
  };

  const handlePurge = async (id: string) => {
    setIsMutating(true);
    const { error } = await supabase.from(table as any).delete().eq('id', id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${label.singular} permanently deleted`);
      queryClient.invalidateQueries({ queryKey });
    }
    setIsMutating(false);
    setPurgeTarget(null);
    setPurgeOpen(false);
  };

  const handleBulkPurge = async () => {
    setIsMutating(true);
    const { error } = await supabase
      .from(table as any)
      .delete()
      .in('id', [...selectedIds]);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${selectedIds.size} ${label.plural.toLowerCase()} permanently deleted`);
      queryClient.invalidateQueries({ queryKey });
      setSelectedIds(new Set());
    }
    setIsMutating(false);
    setBulkPurgeOpen(false);
  };

  const columns = [
    {
      key: 'label',
      header: label.singular,
      render: (r: any) => <span className="font-medium">{config.label(r)}</span>,
    },
    {
      key: 'meta',
      header: 'Details',
      render: (r: any) => (
        <span className="text-muted-foreground text-sm">{config.meta?.(r) || '—'}</span>
      ),
    },
    {
      key: 'deleted_at',
      header: 'Archived',
      render: (r: any) =>
        r.deleted_at ? format(parseISO(r.deleted_at), 'MMM d, yyyy h:mm a') : '—',
    },
    {
      key: 'actions',
      header: '',
      render: (r: any) => (
        <div className="flex gap-2 justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              handleRestore(r.id, config.label(r));
            }}
            disabled={isMutating}
          >
            <RotateCcw className="mr-1 h-3 w-3" /> Restore
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              setPurgeTarget({ id: r.id, name: config.label(r) });
              setPurgeOpen(true);
            }}
            disabled={isMutating}
          >
            <Trash2 className="mr-1 h-3 w-3" /> Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search archived ${label.plural.toLowerCase()}...`}
          className="pl-9"
        />
      </div>

      <DataTable
        columns={columns as any}
        data={filtered}
        loading={isLoading}
        emptyMessage={`No archived ${label.plural.toLowerCase()}`}
        emptyDescription="Archived records will appear here."
        emptyIcon={ArchiveIcon}
        tableId={`archive-${table}`}
        selectable
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        bulkActions={(ids) => (
          <>
            <Button size="sm" variant="outline" onClick={handleBulkRestore} disabled={isMutating}>
              <RotateCcw className="mr-1 h-3 w-3" /> Restore ({ids.size})
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setBulkPurgeOpen(true)}
              disabled={isMutating}
            >
              <Trash2 className="mr-1 h-3 w-3" /> Delete ({ids.size})
            </Button>
          </>
        )}
      />

      <ConfirmDeleteDialog
        open={purgeOpen}
        onOpenChange={setPurgeOpen}
        onConfirm={() => purgeTarget && handlePurge(purgeTarget.id)}
        title={`Permanently delete ${label.singular.toLowerCase()}?`}
        itemName={purgeTarget?.name}
        description="This will permanently remove the record from the database. This action cannot be undone."
        isDeleting={isMutating}
      />

      <ConfirmDeleteDialog
        open={bulkPurgeOpen}
        onOpenChange={setBulkPurgeOpen}
        onConfirm={handleBulkPurge}
        title={`Permanently delete ${selectedIds.size} ${label.plural.toLowerCase()}?`}
        description="This will permanently remove these records from the database. This action cannot be undone."
        isDeleting={isMutating}
      />
    </div>
  );
}

export default function Archive() {
  const { accessibleTables, hasAnyAccess } = useArchiveAccess();
  const [tab, setTab] = useState<ArchivableTable | null>(accessibleTables[0] ?? null);

  if (!hasAnyAccess) {
    return (
      <>
        <PageHeader title="Archive" description="Recover archived records" />
        <Card className="p-8">
          <EmptyState
            icon={ArchiveIcon}
            title="No archive access"
            description="You don't have permission to view archived records for any resource type."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Archive"
        description="Restore or permanently delete archived records"
      />
      <Tabs
        value={tab ?? undefined}
        onValueChange={(v) => setTab(v as ArchivableTable)}
        className="space-y-4"
      >
        <TabsList className="flex-wrap h-auto">
          {accessibleTables.map((t) => (
            <TabsTrigger key={t} value={t}>
              {TABLE_LABELS[t].plural}
            </TabsTrigger>
          ))}
        </TabsList>
        {accessibleTables.map((t) => (
          <TabsContent key={t} value={t}>
            <ArchiveTab table={t} />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
