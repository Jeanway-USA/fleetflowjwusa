import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, differenceInDays, addDays } from 'date-fns';

// Types for our maintenance data
export interface WorkOrder {
  id: string;
  truck_id: string;
  vendor: string | null;
  entry_date: string;
  estimated_completion: string | null;
  status: string;
  service_type: string;
  description: string | null;
  cost_estimate: number | null;
  final_cost: number | null;
  is_reimbursable: boolean;
  invoice_url: string | null;
  odometer_reading: number | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  trucks?: {
    unit_number: string;
    make: string | null;
    model: string | null;
  };
}

export interface ServiceSchedule {
  id: string;
  truck_id: string;
  service_name: string;
  interval_miles: number | null;
  interval_days: number | null;
  last_performed_date: string | null;
  last_performed_miles: number | null;
  trucks?: {
    unit_number: string;
    current_odometer: number | null;
    last_120_inspection_date: string | null;
  };
}

export interface TruckWithSchedules {
  id: string;
  unit_number: string;
  current_odometer: number | null;
  calculated_odometer: number; // Miles from delivered loads
  last_120_inspection_date: string | null;
  status: string;
  schedules: ServiceSchedule[];
}

// Hook for Fleet Availability KPI
export function useFleetAvailability() {
  return useQuery({
    queryKey: ['fleet-availability'],
    queryFn: async () => {
      const { data: trucks, error: trucksError } = await supabase
        .from('trucks')
        .select('id, status');
      
      if (trucksError) throw trucksError;

      const { data: activeWorkOrders, error: woError } = await supabase
        .from('work_orders')
        .select('truck_id')
        .in('status', ['open', 'parts_ordered', 'in_progress']);
      
      if (woError) throw woError;

      const inShopTruckIds = new Set(activeWorkOrders?.map(wo => wo.truck_id) || []);
      const available = trucks?.filter(t => !inShopTruckIds.has(t.id) && t.status === 'active').length || 0;
      const inShop = inShopTruckIds.size;
      const total = trucks?.length || 0;

      return { available, inShop, total };
    },
  });
}

// Hook for Maintenance Cost MTD
export function useMaintenanceCostMTD() {
  return useQuery({
    queryKey: ['maintenance-cost-mtd'],
    queryFn: async () => {
      const now = new Date();
      const monthStart = startOfMonth(now).toISOString();
      const monthEnd = endOfMonth(now).toISOString();

      // Get costs from maintenance_logs
      const { data: logs, error: logsError } = await supabase
        .from('maintenance_logs')
        .select('cost')
        .gte('service_date', monthStart.split('T')[0])
        .lte('service_date', monthEnd.split('T')[0]);

      if (logsError) throw logsError;

      // Get costs from completed work orders this month
      const { data: workOrders, error: woError } = await supabase
        .from('work_orders')
        .select('final_cost')
        .eq('status', 'completed')
        .gte('completed_at', monthStart)
        .lte('completed_at', monthEnd);

      if (woError) throw woError;

      const logsCost = logs?.reduce((sum, log) => sum + (log.cost || 0), 0) || 0;
      const woCost = workOrders?.reduce((sum, wo) => sum + (wo.final_cost || 0), 0) || 0;

      return logsCost + woCost;
    },
  });
}

// Hook for Cost Per Mile
export function useCostPerMile() {
  return useQuery({
    queryKey: ['cost-per-mile'],
    queryFn: async () => {
      // Get total maintenance costs (all time for now, can be adjusted)
      const { data: logs, error: logsError } = await supabase
        .from('maintenance_logs')
        .select('cost');

      if (logsError) throw logsError;

      const { data: workOrders, error: woError } = await supabase
        .from('work_orders')
        .select('final_cost')
        .eq('status', 'completed');

      if (woError) throw woError;

      // Get total miles from fleet_loads
      const { data: loads, error: loadsError } = await supabase
        .from('fleet_loads')
        .select('actual_miles')
        .eq('status', 'delivered');

      if (loadsError) throw loadsError;

      const totalCost = 
        (logs?.reduce((sum, log) => sum + (log.cost || 0), 0) || 0) +
        (workOrders?.reduce((sum, wo) => sum + (wo.final_cost || 0), 0) || 0);

      const totalMiles = loads?.reduce((sum, load) => sum + (load.actual_miles || 0), 0) || 0;

      return totalMiles > 0 ? totalCost / totalMiles : 0;
    },
  });
}

// Hook for Compliance Alerts (120-Day Inspections due within 10 days)
export function useComplianceAlerts() {
  return useQuery({
    queryKey: ['compliance-alerts'],
    queryFn: async () => {
      const { data: schedules, error } = await supabase
        .from('service_schedules')
        .select(`
          id,
          truck_id,
          service_name,
          interval_days,
          last_performed_date,
          trucks!inner (
            id,
            unit_number,
            status
          )
        `)
        .eq('service_name', '120-Day Inspection');

      if (error) throw error;

      const today = new Date();
      const alertThreshold = 10; // days

      const dueInspections = schedules?.filter(schedule => {
        if (!schedule.interval_days) return false;
        
        // If never performed, mark as needing inspection (but not with crazy overdue days)
        if (!schedule.last_performed_date) {
          return true; // Flag as needing attention
        }
        
        const lastDate = new Date(schedule.last_performed_date);
        const dueDate = addDays(lastDate, schedule.interval_days);
        const daysRemaining = differenceInDays(dueDate, today);
        
        return daysRemaining <= alertThreshold;
      }) || [];

      return {
        count: dueInspections.length,
        trucks: dueInspections.map(s => {
          // Handle never inspected case
          if (!s.last_performed_date) {
            return {
              truckId: s.truck_id,
              unitNumber: (s.trucks as any)?.unit_number || 'Unknown',
              daysRemaining: null, // null means never inspected
              neverInspected: true,
            };
          }
          
          const daysRemaining = differenceInDays(
            addDays(new Date(s.last_performed_date), s.interval_days || 120),
            today
          );
          
          return {
            truckId: s.truck_id,
            unitNumber: (s.trucks as any)?.unit_number || 'Unknown',
            daysRemaining,
            neverInspected: false,
          };
        }),
      };
    },
  });
}

// Hook for Active Work Orders
export function useActiveWorkOrders() {
  return useQuery({
    queryKey: ['active-work-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          *,
          trucks (
            unit_number,
            make,
            model
          )
        `)
        .in('status', ['open', 'parts_ordered', 'in_progress'])
        .order('entry_date', { ascending: false });

      if (error) throw error;
      return data as WorkOrder[];
    },
  });
}

// Hook for Service History (completed work orders + maintenance logs)
export function useServiceHistory(searchQuery?: string) {
  return useQuery({
    queryKey: ['service-history', searchQuery],
    queryFn: async () => {
      // Get completed work orders
      let woQuery = supabase
        .from('work_orders')
        .select(`
          id,
          truck_id,
          vendor,
          entry_date,
          service_type,
          description,
          final_cost,
          completed_at,
          estimated_completion,
          trucks (unit_number)
        `)
        .eq('status', 'completed')
        .order('entry_date', { ascending: false });

      if (searchQuery) {
        woQuery = woQuery.or(`description.ilike.%${searchQuery}%,service_type.ilike.%${searchQuery}%,vendor.ilike.%${searchQuery}%`);
      }

      const { data: workOrders, error: woError } = await woQuery;
      if (woError) throw woError;

      // Get maintenance logs
      let logsQuery = supabase
        .from('maintenance_logs')
        .select(`
          id,
          truck_id,
          vendor,
          service_date,
          service_type,
          description,
          cost,
          trucks (unit_number)
        `)
        .order('service_date', { ascending: false });

      if (searchQuery) {
        logsQuery = logsQuery.or(`description.ilike.%${searchQuery}%,service_type.ilike.%${searchQuery}%,vendor.ilike.%${searchQuery}%`);
      }

      const { data: logs, error: logsError } = await logsQuery;
      if (logsError) throw logsError;

      // Combine and normalize - use entry_date for work orders (the date the work was done)
      const combined = [
        ...(workOrders?.map(wo => ({
          id: wo.id,
          truckId: wo.truck_id,
          date: wo.entry_date, // Use entry_date as the service date
          unitNumber: (wo.trucks as any)?.unit_number || 'Unknown',
          serviceType: wo.service_type,
          vendor: wo.vendor,
          cost: wo.final_cost,
          description: wo.description,
          source: 'work_order' as const,
        })) || []),
        ...(logs?.map(log => ({
          id: log.id,
          truckId: log.truck_id,
          date: log.service_date,
          unitNumber: (log.trucks as any)?.unit_number || 'Unknown',
          serviceType: log.service_type,
          vendor: log.vendor,
          cost: log.cost,
          description: log.description,
          source: 'maintenance_log' as const,
        })) || []),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return combined;
    },
  });
}

// Mutation to update a completed work order
export function useUpdateCompletedWorkOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, entry_date, vendor, final_cost, description, service_type }: {
      id: string;
      entry_date?: string;
      vendor?: string;
      final_cost?: number;
      description?: string;
      service_type?: string;
    }) => {
      const { data, error } = await supabase
        .from('work_orders')
        .update({
          entry_date,
          vendor,
          final_cost,
          description,
          service_type,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-history'] });
    },
  });
}

// Mutation to delete a completed work order
export function useDeleteCompletedWorkOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('work_orders')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-history'] });
    },
  });
}

// Hook for PM Schedule with health calculations
export function usePMSchedule() {
  return useQuery({
    queryKey: ['pm-schedule'],
    queryFn: async () => {
      const { data: trucks, error: trucksError } = await supabase
        .from('trucks')
        .select('id, unit_number, current_odometer, last_120_inspection_date, status')
        .eq('status', 'active')
        .order('unit_number');

      if (trucksError) throw trucksError;

      const { data: schedules, error: schedulesError } = await supabase
        .from('service_schedules')
        .select('*');

      if (schedulesError) throw schedulesError;

      // Get the most recent delivered load per truck to get end_miles (actual odometer)
      const { data: deliveredLoads, error: loadsError } = await supabase
        .from('fleet_loads')
        .select('truck_id, end_miles, delivery_date')
        .eq('status', 'delivered')
        .not('end_miles', 'is', null)
        .order('delivery_date', { ascending: false });

      if (loadsError) throw loadsError;

      // Get the latest end_miles per truck (actual odometer reading)
      const truckOdometerMap = new Map<string, number>();
      deliveredLoads?.forEach(load => {
        if (load.truck_id && load.end_miles && !truckOdometerMap.has(load.truck_id)) {
          // Only take the first (most recent) load for each truck
          truckOdometerMap.set(load.truck_id, load.end_miles);
        }
      });

      // Map schedules to trucks with odometer from last delivered load
      const trucksWithSchedules: TruckWithSchedules[] = trucks?.map(truck => ({
        ...truck,
        // Use end_miles from the most recent delivered load as the odometer
        calculated_odometer: truckOdometerMap.get(truck.id) || truck.current_odometer || 0,
        schedules: schedules?.filter(s => s.truck_id === truck.id) || [],
      })) || [];

      return trucksWithSchedules;
    },
  });
}

// Hook for Trucks (for dropdowns)
export function useTrucks() {
  return useQuery({
    queryKey: ['trucks-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trucks')
        .select('id, unit_number, make, model, current_odometer')
        .order('unit_number');

      if (error) throw error;
      return data;
    },
  });
}

// Mutation to create work order
export function useCreateWorkOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (workOrder: {
      truck_id: string;
      vendor?: string;
      entry_date?: string;
      estimated_completion?: string;
      service_type: string;
      description?: string;
      cost_estimate?: number;
      is_reimbursable?: boolean;
      odometer_reading?: number;
    }) => {
      const { data, error } = await supabase
        .from('work_orders')
        .insert(workOrder)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-availability'] });
    },
  });
}

// Mutation to complete work order
export function useCompleteWorkOrder() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, final_cost, invoice_url, notes }: {
      id: string;
      final_cost: number;
      invoice_url?: string;
      notes?: string;
    }) => {
      // First, get the work order to check its type and truck_id
      const { data: workOrder, error: fetchError } = await supabase
        .from('work_orders')
        .select('truck_id, service_type, entry_date, odometer_reading')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Complete the work order
      const { data, error } = await supabase
        .from('work_orders')
        .update({
          status: 'completed',
          final_cost,
          invoice_url,
          notes,
          completed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Get the current odometer from the most recent delivered load's end_miles
      const { data: lastLoad } = await supabase
        .from('fleet_loads')
        .select('end_miles')
        .eq('truck_id', workOrder.truck_id)
        .eq('status', 'delivered')
        .not('end_miles', 'is', null)
        .order('delivery_date', { ascending: false })
        .limit(1)
        .single();

      const currentOdometer = lastLoad?.end_miles || 0;

      // If this is an inspection work order, update the service schedule
      if (workOrder.service_type === 'inspection') {
        // Use the work order's entry_date (the actual inspection date), not today's date
        const inspectionDate = workOrder.entry_date;
        
        // Update the 120-Day Inspection service schedule for this truck
        const { error: scheduleError } = await supabase
          .from('service_schedules')
          .update({
            last_performed_date: inspectionDate,
            last_performed_miles: workOrder.odometer_reading || currentOdometer,
          })
          .eq('truck_id', workOrder.truck_id)
          .eq('service_name', '120-Day Inspection');

        if (scheduleError) {
          console.error('Failed to update service schedule:', scheduleError);
        }

        // Also update the truck's last_120_inspection_date
        await supabase
          .from('trucks')
          .update({
            last_120_inspection_date: inspectionDate,
            last_120_inspection_miles: workOrder.odometer_reading || currentOdometer,
          })
          .eq('id', workOrder.truck_id);
      }

      // If this is an oil change work order, reset the oil change PM schedule
      if (workOrder.service_type === 'pm' || workOrder.service_type.toLowerCase().includes('oil')) {
        await supabase
          .from('service_schedules')
          .update({
            last_performed_date: workOrder.entry_date,
            last_performed_miles: currentOdometer,
          })
          .eq('truck_id', workOrder.truck_id)
          .eq('service_name', 'Oil Change');
      }

      // If this is a tire work order, reset the tire PM schedule
      if (workOrder.service_type === 'tire' || workOrder.service_type.toLowerCase().includes('tire')) {
        await supabase
          .from('service_schedules')
          .update({
            last_performed_date: workOrder.entry_date,
            last_performed_miles: currentOdometer,
          })
          .eq('truck_id', workOrder.truck_id)
          .eq('service_name', 'Tire Replacement');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['service-history'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-availability'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-cost-mtd'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['service-schedules-120day'] });
      queryClient.invalidateQueries({ queryKey: ['pm-schedule'] });
    },
  });
}

// Mutation to update work order status
export function useUpdateWorkOrderStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data, error } = await supabase
        .from('work_orders')
        .update({ status })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-work-orders'] });
    },
  });
}

// Mutation to update service schedule (after performing service)
export function useUpdateServiceSchedule() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, last_performed_date, last_performed_miles }: {
      id: string;
      last_performed_date: string;
      last_performed_miles?: number;
    }) => {
      const { data, error } = await supabase
        .from('service_schedules')
        .update({ last_performed_date, last_performed_miles })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pm-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-alerts'] });
    },
  });
}

// Hook for truck history (all maintenance for a specific truck)
export function useTruckHistory(truckId: string | null) {
  return useQuery({
    queryKey: ['truck-history', truckId],
    enabled: !!truckId,
    queryFn: async () => {
      if (!truckId) return null;

      // Get truck info
      const { data: truck, error: truckError } = await supabase
        .from('trucks')
        .select('*')
        .eq('id', truckId)
        .single();

      if (truckError) throw truckError;

      // Get all work orders for this truck
      const { data: workOrders, error: woError } = await supabase
        .from('work_orders')
        .select('*')
        .eq('truck_id', truckId)
        .order('entry_date', { ascending: false });

      if (woError) throw woError;

      // Get all maintenance logs for this truck
      const { data: logs, error: logsError } = await supabase
        .from('maintenance_logs')
        .select('*')
        .eq('truck_id', truckId)
        .order('service_date', { ascending: false });

      if (logsError) throw logsError;

      // Calculate stats
      const totalSpend = 
        (workOrders?.reduce((sum, wo) => sum + (wo.final_cost || 0), 0) || 0) +
        (logs?.reduce((sum, log) => sum + (log.cost || 0), 0) || 0);

      const lastServiceDate = [...(workOrders || []), ...(logs || [])]
        .map(item => 'completed_at' in item ? item.completed_at : item.service_date)
        .filter(Boolean)
        .sort()
        .reverse()[0];

      return {
        truck,
        workOrders: workOrders || [],
        maintenanceLogs: logs || [],
        stats: {
          totalSpend,
          totalWorkOrders: workOrders?.length || 0,
          totalMaintenanceLogs: logs?.length || 0,
          lastServiceDate,
        },
      };
    },
  });
}
