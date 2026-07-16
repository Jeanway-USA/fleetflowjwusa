import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { QueryClient } from '@tanstack/react-query';

/**
 * Tables that support soft-delete / archiving. Kept in sync with the
 * archive_record / restore_record RPC allow-list on the database.
 */
export const ARCHIVABLE_TABLES = [
  'drivers',
  'trucks',
  'trailers',
  'fleet_loads',
  'agency_loads',
  'crm_contacts',
  'facilities',
  'parts_inventory',
  'truck_stops',
  'company_resources',
  'document_templates',
  'expenses',
  'fuel_purchases',
  'maintenance_requests',
  'work_orders',
  'incidents',
  'detention_requests',
  'driver_requests',
  'settlements',
  'driver_settlements',
  'driver_payroll',
  'load_expenses',
  'agent_commissions',
  'safety_bonus_payouts',
  'load_status_logs',
  'load_intermediate_stops',
  'load_accessorials',
  'maintenance_logs',
] as const;

export type ArchivableTable = (typeof ARCHIVABLE_TABLES)[number];

/**
 * Human-readable entity labels for each archivable table.
 */
export const TABLE_LABELS: Record<ArchivableTable, { singular: string; plural: string }> = {
  drivers: { singular: 'Driver', plural: 'Drivers' },
  trucks: { singular: 'Truck', plural: 'Trucks' },
  trailers: { singular: 'Trailer', plural: 'Trailers' },
  fleet_loads: { singular: 'Load', plural: 'Fleet Loads' },
  agency_loads: { singular: 'Agency Load', plural: 'Agency Loads' },
  crm_contacts: { singular: 'Contact', plural: 'Contacts' },
  facilities: { singular: 'Facility', plural: 'Facilities' },
  parts_inventory: { singular: 'Part', plural: 'Parts Inventory' },
  truck_stops: { singular: 'Truck Stop', plural: 'Truck Stops' },
  company_resources: { singular: 'Resource', plural: 'Company Resources' },
  document_templates: { singular: 'Template', plural: 'Document Templates' },
  expenses: { singular: 'Expense', plural: 'Expenses' },
  fuel_purchases: { singular: 'Fuel Purchase', plural: 'Fuel Purchases' },
  maintenance_requests: { singular: 'Maintenance Request', plural: 'Maintenance Requests' },
  work_orders: { singular: 'Work Order', plural: 'Work Orders' },
  incidents: { singular: 'Incident', plural: 'Incidents' },
  detention_requests: { singular: 'Detention Request', plural: 'Detention Requests' },
  driver_requests: { singular: 'Driver Request', plural: 'Driver Requests' },
  settlements: { singular: 'Settlement', plural: 'Settlements' },
  driver_settlements: { singular: 'Driver Settlement', plural: 'Driver Settlements' },
  driver_payroll: { singular: 'Payroll Record', plural: 'Payroll Records' },
  load_expenses: { singular: 'Load Expense', plural: 'Load Expenses' },
  agent_commissions: { singular: 'Commission', plural: 'Agent Commissions' },
  safety_bonus_payouts: { singular: 'Safety Bonus', plural: 'Safety Bonus Payouts' },
  load_status_logs: { singular: 'Status Log', plural: 'Load Status Logs' },
  load_intermediate_stops: { singular: 'Stop', plural: 'Intermediate Stops' },
  load_accessorials: { singular: 'Accessorial', plural: 'Load Accessorials' },
  maintenance_logs: { singular: 'Maintenance Log', plural: 'Maintenance Logs' },
};

/**
 * Which roles are allowed to archive/restore each table. Mirrors
 * `public.has_archive_access` in the database — client-side only used
 * to gate UI; the RPC is authoritative.
 */
export const ARCHIVE_ROLE_MAP: Record<ArchivableTable, string[]> = {
  drivers: ['owner', 'payroll_admin'],
  driver_requests: ['owner', 'payroll_admin', 'dispatcher'],
  trucks: ['owner', 'maintenance', 'dispatcher'],
  trailers: ['owner', 'maintenance', 'dispatcher'],
  parts_inventory: ['owner', 'maintenance', 'dispatcher'],
  maintenance_requests: ['owner', 'maintenance', 'dispatcher'],
  work_orders: ['owner', 'maintenance', 'dispatcher'],
  maintenance_logs: ['owner', 'maintenance', 'dispatcher'],
  fleet_loads: ['owner', 'dispatcher'],
  agency_loads: ['owner', 'dispatcher'],
  facilities: ['owner', 'dispatcher'],
  truck_stops: ['owner', 'dispatcher'],
  detention_requests: ['owner', 'dispatcher'],
  crm_contacts: ['owner', 'dispatcher'],
  company_resources: ['owner', 'dispatcher'],
  document_templates: ['owner', 'dispatcher'],
  load_status_logs: ['owner', 'dispatcher'],
  load_intermediate_stops: ['owner', 'dispatcher'],
  load_accessorials: ['owner', 'dispatcher'],
  expenses: ['owner', 'payroll_admin'],
  fuel_purchases: ['owner', 'payroll_admin'],
  settlements: ['owner', 'payroll_admin'],
  driver_settlements: ['owner', 'payroll_admin'],
  driver_payroll: ['owner', 'payroll_admin'],
  load_expenses: ['owner', 'payroll_admin'],
  agent_commissions: ['owner', 'payroll_admin'],
  safety_bonus_payouts: ['owner', 'payroll_admin'],
  incidents: ['owner', 'safety'],
};

const UNDO_TIMEOUT = 10_000;

/**
 * Archive a single record via the `archive_record` RPC and show an
 * Undo toast that restores it if the user clicks within 10 seconds.
 * Returns true on successful archive.
 */
export async function archiveWithUndo(opts: {
  table: ArchivableTable;
  id: string;
  itemName?: string;
  queryClient: QueryClient;
  invalidateKeys?: (string | readonly unknown[])[];
}): Promise<boolean> {
  const { table, id, itemName, queryClient, invalidateKeys = [] } = opts;
  const label = TABLE_LABELS[table].singular;

  const { error } = await supabase.rpc('archive_record', { _table: table, _id: id });
  if (error) {
    toast.error(`Failed to archive ${label.toLowerCase()}: ${error.message}`);
    return false;
  }

  const invalidate = () => {
    for (const key of invalidateKeys) {
      queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
    }
  };
  invalidate();

  const title = itemName ? `${label} "${itemName}" archived` : `${label} archived`;
  toast.success(title, {
    duration: UNDO_TIMEOUT,
    action: {
      label: 'Undo',
      onClick: async () => {
        const { error: restoreErr } = await supabase.rpc('restore_record', {
          _table: table,
          _id: id,
        });
        if (restoreErr) {
          toast.error(`Failed to restore: ${restoreErr.message}`);
          return;
        }
        toast.success(`${label} restored`);
        invalidate();
      },
    },
  });

  return true;
}

/**
 * Archive multiple records in one action. Undo restores all of them.
 */
export async function archiveManyWithUndo(opts: {
  table: ArchivableTable;
  ids: string[];
  queryClient: QueryClient;
  invalidateKeys?: (string | readonly unknown[])[];
}): Promise<number> {
  const { table, ids, queryClient, invalidateKeys = [] } = opts;
  const label = TABLE_LABELS[table];

  let archived = 0;
  for (const id of ids) {
    const { error } = await supabase.rpc('archive_record', { _table: table, _id: id });
    if (!error) archived++;
  }

  const invalidate = () => {
    for (const key of invalidateKeys) {
      queryClient.invalidateQueries({ queryKey: Array.isArray(key) ? key : [key] });
    }
  };
  invalidate();

  if (archived === 0) {
    toast.error(`Failed to archive ${label.plural.toLowerCase()}`);
    return 0;
  }

  toast.success(`${archived} ${archived === 1 ? label.singular : label.plural} archived`, {
    duration: UNDO_TIMEOUT,
    action: {
      label: 'Undo',
      onClick: async () => {
        for (const id of ids) {
          await supabase.rpc('restore_record', { _table: table, _id: id });
        }
        toast.success(`${archived} ${archived === 1 ? label.singular : label.plural} restored`);
        invalidate();
      },
    },
  });

  return archived;
}

export async function restoreRecord(table: ArchivableTable, id: string) {
  const { error } = await supabase.rpc('restore_record', { _table: table, _id: id });
  if (error) throw error;
}
