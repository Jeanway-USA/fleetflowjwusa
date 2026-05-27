import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DriverFaultReport {
  id: string;
  driver_id: string;
  truck_id: string;
  issue_type: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  status: 'submitted' | 'acknowledged' | 'scheduled' | 'in_progress' | 'completed';
  admin_notes: string | null;
  created_at: string;
  drivers?: { first_name: string | null; last_name: string | null } | null;
  trucks?: { unit_number: string | null } | null;
}

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function useDriverFaultReports() {
  return useQuery({
    queryKey: ['driver-fault-reports'],
    queryFn: async (): Promise<DriverFaultReport[]> => {
      const { data, error } = await supabase
        .from('maintenance_requests')
        .select('id, driver_id, truck_id, issue_type, priority, description, status, admin_notes, created_at, drivers(first_name, last_name), trucks(unit_number)')
        .in('status', ['submitted', 'acknowledged', 'in_progress'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as unknown as DriverFaultReport[];
      return rows.sort((a, b) => {
        const p = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
        if (p !== 0) return p;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    },
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });
}

export function useAcknowledgeFaultReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('maintenance_requests')
        .update({ status: 'acknowledged' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-fault-reports'] });
    },
  });
}

function mapIssueToServiceType(issueType: string): string {
  if (issueType === 'tire') return 'tire';
  return 'repair';
}

export function useConvertFaultReportToWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (report: DriverFaultReport) => {
      const issueLabel = report.issue_type.charAt(0).toUpperCase() + report.issue_type.slice(1);
      const driverName = `${report.drivers?.first_name ?? ''} ${report.drivers?.last_name ?? ''}`.trim() || 'Driver';
      const woDescription = `Driver report (${driverName} — ${issueLabel}, ${report.priority}): ${report.description}`;

      const { data: wo, error: woErr } = await supabase
        .from('work_orders')
        .insert({
          truck_id: report.truck_id,
          service_type: mapIssueToServiceType(report.issue_type),
          service_types: [mapIssueToServiceType(report.issue_type)],
          description: woDescription,
          entry_date: new Date().toISOString().slice(0, 10),
          status: 'open',
        })
        .select('id')
        .single();
      if (woErr) throw woErr;

      const { error: updErr } = await supabase
        .from('maintenance_requests')
        .update({
          status: 'in_progress',
          admin_notes: `Converted to work order ${wo.id}`,
        })
        .eq('id', report.id);
      if (updErr) throw updErr;

      return wo.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-fault-reports'] });
      qc.invalidateQueries({ queryKey: ['active-work-orders'] });
      qc.invalidateQueries({ queryKey: ['fleet-availability'] });
    },
  });
}
