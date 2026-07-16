import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, differenceInDays, addDays, subDays } from 'date-fns';

// Opportunity-cost math uses the org's configured
// `company_settings.avg_daily_truck_revenue`. When unset we treat the
// target as 0 so we never fabricate a synthetic dollar figure.

// Chronic-issue detection: minor service types + description keywords.
const MINOR_SERVICE_TYPES = new Set(['fluid', 'tire', 'pressure', 'minor', 'inspection']);
const MINOR_KEYWORD_RE = /\b(leak|drip|slow\s+(?:tire|fluid)|pressure|weep)\b/i;

const isMinorEntry = (serviceType?: string | null, description?: string | null) => {
  if (serviceType && MINOR_SERVICE_TYPES.has(serviceType.toLowerCase())) return true;
  if (description && MINOR_KEYWORD_RE.test(description)) return true;
  return false;
};

export interface ChronicEntry {
  id: string;
  source: 'log' | 'work_order';
  description: string;
  date: string;
  category: string;
}


// Types for our maintenance data
export interface WorkOrder {
  id: string;
  truck_id: string;
  vendor: string | null;
  entry_date: string;
  estimated_completion: string | null;
  status: string;
  service_type: string;
  service_types: string[] | null;
  description: string | null;
  cost_estimate: number | null;
  final_cost: number | null;
  is_reimbursable: boolean;
  invoice_url: string | null;
  odometer_reading: number | null;
  notes: string | null;
  completed_at: string | null;
  days_down: number | null;
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

export interface PMBaseline {
  workOrderId: string | null;
  date: string | null;
}

export interface ManufacturerPMProfile {
  id: string;
  manufacturer: string;
  service_name: string;
  service_code: string;
  interval_miles: number | null;
  interval_days: number | null;
  description: string | null;
  display_order: number;
}

export interface ManufacturerService {
  profile: ManufacturerPMProfile;
  schedule: ServiceSchedule | null;
  miles_since_service: number;
  baseline: PMBaseline;
}

export interface TruckWithSchedules {
  id: string;
  unit_number: string;
  make: string | null;
  current_odometer: number | null;
  /** Mileage when the truck was purchased (for fallback PM calculations). */
  purchase_mileage: number | null;
  /**
   * Truck odometer as of the most recently delivered load (fleet_loads.end_miles).
   * Falls back to trucks.current_odometer when no delivered loads exist.
   */
  calculated_odometer: number;
  /** Miles driven since last Oil Change based on delivered loads' actual_miles. */
  miles_since_oil_change: number;
  /** Miles driven since last Tire Replacement based on delivered loads' actual_miles. */
  miles_since_tire_replacement: number;
  /** Baseline work order info for Oil Change. */
  oil_change_baseline: PMBaseline;
  /** Baseline work order info for Tire Replacement. */
  tire_replacement_baseline: PMBaseline;
  last_120_inspection_date: string | null;
  status: string;
  schedules: ServiceSchedule[];
  /** Manufacturer-specific PM services (for Freightliner, etc.) */
  manufacturer_services: ManufacturerService[];
}

// Service type to schedule name mapping
const SERVICE_TYPE_TO_SCHEDULE: Record<string, string> = {
  'M1': 'M1 Service (Safety & Grease)',
  'PM_A': 'PM A (Oil & Fuel)',
  'M2': 'M2 Service (Annual)',
  'M3': 'M3 Service (Major Fluids)',
  'pm': 'Oil Change',
  'tire': 'Tire Replacement',
  'inspection': '120-Day Inspection',
};

// Matchers for each service type
const getServiceTypeMatcher = (serviceType: string): ((st: string) => boolean) => {
  const type = serviceType.toLowerCase();
  switch (type) {
    case 'm1':
      return st => st.includes('m1') || st.includes('grease') || st.includes('lube');
    case 'pm_a':
      return st => st === 'pm' || st.includes('oil') || st.includes('pm a') || st.includes('pm_a');
    case 'm2':
      return st => st.includes('m2') || st.includes('annual');
    case 'm3':
      return st => st.includes('m3') || st.includes('major');
    case 'pm':
      return st => st === 'pm' || st.includes('oil');
    case 'tire':
      return st => st === 'tire' || st.includes('tire');
    case 'inspection':
      return st => st === 'inspection' || st.includes('inspection');
    default:
      return st => st.includes(type);
  }
};

// Hook to fetch all manufacturer PM profiles (for work order service type selection)
export function useManufacturerPMProfiles() {
  return useQuery({
    queryKey: ['manufacturer-pm-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manufacturer_pm_profiles')
        .select('*')
        .order('manufacturer')
        .order('display_order');
      if (error) throw error;
      return data as ManufacturerPMProfile[];
    },
  });
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

// Hook for Today's Work Orders (scheduled today, not yet completed)
export type TodayUrgency = 'high' | 'medium' | 'low';

export interface TodaysWorkOrder extends WorkOrder {
  urgency: TodayUrgency;
}

function deriveUrgency(serviceType: string | null, serviceTypes: string[] | null): TodayUrgency {
  const all = [serviceType, ...(serviceTypes || [])].filter(Boolean).map(s => (s as string).toLowerCase());
  if (all.some(s => /(tire|brake|repair|engine|breakdown|tow)/.test(s))) return 'high';
  if (all.some(s => /(pm|inspection|oil|m1|m2|m3|service)/.test(s))) return 'medium';
  return 'low';
}

export function useTodaysWorkOrders() {
  return useQuery({
    queryKey: ['todays-work-orders'],
    queryFn: async (): Promise<TodaysWorkOrder[]> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('work_orders')
        .select(`*, trucks (unit_number, make, model)`)
        .in('status', ['open', 'parts_ordered', 'in_progress'])
        .eq('entry_date', today)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data || []) as WorkOrder[];
      const order: Record<TodayUrgency, number> = { high: 0, medium: 1, low: 2 };
      return rows
        .map(wo => ({ ...wo, urgency: deriveUrgency(wo.service_type, wo.service_types) }))
        .sort((a, b) => order[a.urgency] - order[b.urgency]);
    },
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });
}

export function useStartWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('work_orders')
        .update({ status: 'in_progress' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['todays-work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['active-work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-availability'] });
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
          service_types,
          description,
          final_cost,
          completed_at,
          estimated_completion,
          trucks (unit_number)
        `)
        .eq('status', 'completed')
        .order('estimated_completion', { ascending: false });

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
        .is('deleted_at', null)
        .order('service_date', { ascending: false });

      if (searchQuery) {
        logsQuery = logsQuery.or(`description.ilike.%${searchQuery}%,service_type.ilike.%${searchQuery}%,vendor.ilike.%${searchQuery}%`);
      }

      const { data: logs, error: logsError } = await logsQuery;
      if (logsError) throw logsError;

      // Combine and normalize - use estimated_completion for work orders (the actual service date)
      const combined = [
        ...(workOrders?.map(wo => ({
          id: wo.id,
          truckId: wo.truck_id,
          date: wo.estimated_completion || wo.entry_date, // Use estimated_completion as the service date
          unitNumber: (wo.trucks as any)?.unit_number || 'Unknown',
          serviceType: wo.service_type,
          serviceTypes: wo.service_types as string[] | null,
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
          serviceTypes: null as string[] | null,
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
    mutationFn: async ({ id, entry_date, vendor, final_cost, description, service_type, service_types, estimated_completion }: {
      id: string;
      entry_date?: string;
      vendor?: string;
      final_cost?: number;
      description?: string;
      service_type?: string;
      service_types?: string[];
      estimated_completion?: string;
    }) => {
      const updatePayload: Record<string, unknown> = {
        vendor,
        final_cost,
        description,
        service_type,
        service_types: service_types || [],
      };
      if (entry_date) {
        updatePayload.entry_date = entry_date;
        updatePayload.estimated_completion = estimated_completion ?? entry_date;
      }
      const { data, error } = await supabase
        .from('work_orders')
        .update(updatePayload)
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
      // Fetch the work order first so we know what schedules it affected
      const { data: workOrder, error: fetchError } = await supabase
        .from('work_orders')
        .select('id, truck_id, service_type, service_types, entry_date, odometer_reading, status')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const truckId = workOrder.truck_id;
      
      // Get all service types to revert (from array or single value)
      const serviceTypesToRevert: string[] = workOrder.service_types && workOrder.service_types.length > 0
        ? workOrder.service_types
        : workOrder.service_type ? [workOrder.service_type] : [];

      // Delete the work order
      const { error: deleteError } = await supabase
        .from('work_orders')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      const getOdometerAtDate = async (date: string) => {
        const { data } = await supabase
          .from('fleet_loads')
          .select('end_miles, delivery_date')
          .eq('truck_id', truckId)
          .eq('status', 'delivered')
          .not('end_miles', 'is', null)
          .lte('delivery_date', date)
          .order('delivery_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        return data?.end_miles ?? null;
      };

      const fetchMostRecentMatchingWO = async (matcher: (serviceType: string) => boolean) => {
        const { data } = await supabase
          .from('work_orders')
          .select('entry_date, estimated_completion, odometer_reading, service_type, service_types')
          .eq('truck_id', truckId)
          .eq('status', 'completed')
          .order('estimated_completion', { ascending: false })
          .limit(50);

        const rows = (data || []) as Array<{
          entry_date: string;
          estimated_completion: string | null;
          odometer_reading: number | null;
          service_type: string;
          service_types: string[] | null;
        }>;

        // Check both service_types array and service_type string
        return rows.find(r => {
          const types = r.service_types && r.service_types.length > 0 
            ? r.service_types 
            : r.service_type ? [r.service_type] : [];
          return types.some(t => matcher(t.toLowerCase()));
        }) || null;
      };

      const revertScheduleToPrevious = async (serviceName: string, matcher: (serviceType: string) => boolean) => {
        const prev = await fetchMostRecentMatchingWO(matcher);

        if (!prev) {
          await supabase
            .from('service_schedules')
            .update({ last_performed_date: null, last_performed_miles: null })
            .eq('truck_id', truckId)
            .eq('service_name', serviceName);
          return;
        }

        const effectiveDate = prev.estimated_completion || prev.entry_date;
        const odometerAtService =
          prev.odometer_reading ?? (await getOdometerAtDate(effectiveDate)) ?? null;

        await supabase
          .from('service_schedules')
          .update({
            last_performed_date: effectiveDate,
            last_performed_miles: odometerAtService,
          })
          .eq('truck_id', truckId)
          .eq('service_name', serviceName);
      };

      // Revert each service type
      for (const serviceType of serviceTypesToRevert) {
        const type = serviceType.toLowerCase();
        const scheduleName = SERVICE_TYPE_TO_SCHEDULE[serviceType] || SERVICE_TYPE_TO_SCHEDULE[type];
        const matcher = getServiceTypeMatcher(serviceType);

        if (type === 'inspection' || type.includes('inspection')) {
          // Handle inspection specially - also update trucks table
          const prevInspection = await fetchMostRecentMatchingWO(matcher);

          if (!prevInspection) {
            await supabase
              .from('service_schedules')
              .update({ last_performed_date: null, last_performed_miles: null })
              .eq('truck_id', truckId)
              .eq('service_name', '120-Day Inspection');

            await supabase
              .from('trucks')
              .update({
                last_120_inspection_date: null,
                last_120_inspection_miles: null,
                next_inspection_date: null,
              })
              .eq('id', truckId);
          } else {
            const effectiveInspDate = prevInspection.estimated_completion || prevInspection.entry_date;
            const odometerAtService =
              prevInspection.odometer_reading ?? (await getOdometerAtDate(effectiveInspDate)) ?? null;
            const nextInspectionDate = addDays(new Date(`${effectiveInspDate}T00:00:00`), 120)
              .toISOString()
              .split('T')[0];

            await supabase
              .from('service_schedules')
              .update({
                last_performed_date: effectiveInspDate,
                last_performed_miles: odometerAtService,
              })
              .eq('truck_id', truckId)
              .eq('service_name', '120-Day Inspection');

            await supabase
              .from('trucks')
              .update({
                last_120_inspection_date: effectiveInspDate,
                last_120_inspection_miles: odometerAtService,
                next_inspection_date: nextInspectionDate,
              })
              .eq('id', truckId);
          }
        } else if (scheduleName) {
          await revertScheduleToPrevious(scheduleName, matcher);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-history'] });
      queryClient.invalidateQueries({ queryKey: ['pm-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['compliance-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['service-schedules-120day'] });
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
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
        .select('id, unit_number, make, current_odometer, last_120_inspection_date, status, purchase_mileage')
        .eq('status', 'active')
        .order('unit_number');

      if (trucksError) throw trucksError;

      const { data: schedules, error: schedulesError } = await supabase
        .from('service_schedules')
        .select('*');

      if (schedulesError) throw schedulesError;

      // Fetch manufacturer PM profiles
      const { data: manufacturerProfiles, error: profilesError } = await supabase
        .from('manufacturer_pm_profiles')
        .select('*')
        .order('display_order');

      if (profilesError) throw profilesError;

      // Index profiles by manufacturer
      const profilesByManufacturer = new Map<string, ManufacturerPMProfile[]>();
      manufacturerProfiles?.forEach(profile => {
        const key = profile.manufacturer.toLowerCase();
        const arr = profilesByManufacturer.get(key) || [];
        arr.push(profile as ManufacturerPMProfile);
        profilesByManufacturer.set(key, arr);
      });

      // Delivered loads drive two different concepts:
      // 1) Current Odometer display: last delivered load's end_miles
      // 2) PM progress: miles since last service = sum of delivered loads' actual_miles since last_performed_date
      const { data: deliveredLoads, error: loadsError } = await supabase
        .from('fleet_loads')
        .select('truck_id, end_miles, delivery_date, actual_miles')
        .eq('status', 'delivered')
        .order('delivery_date', { ascending: false });

      if (loadsError) throw loadsError;

      // Fetch completed work orders to find baseline work orders for each PM type
      const { data: completedWorkOrders, error: woError } = await supabase
        .from('work_orders')
        .select('id, truck_id, service_type, service_types, entry_date, estimated_completion')
        .eq('status', 'completed')
        .order('estimated_completion', { ascending: false });

      if (woError) throw woError;

      // Latest end_miles per truck (actual odometer reading)
      const truckOdometerMap = new Map<string, number>();
      deliveredLoads?.forEach(load => {
        if (load.truck_id && load.end_miles && !truckOdometerMap.has(load.truck_id)) {
          truckOdometerMap.set(load.truck_id, load.end_miles);
        }
      });

      // Index delivered loads by truck for mileage calculations
      const loadsByTruck = new Map<string, { delivery_date: string | null; actual_miles: number | null }[]>();
      deliveredLoads?.forEach(load => {
        if (!load.truck_id) return;
        const arr = loadsByTruck.get(load.truck_id) || [];
        arr.push({
          delivery_date: load.delivery_date ?? null,
          actual_miles: load.actual_miles ?? null,
        });
        loadsByTruck.set(load.truck_id, arr);
      });

      // Index completed work orders by truck
      const woByTruck = new Map<string, { id: string; service_type: string; service_types: string[] | null; entry_date: string; estimated_completion: string | null }[]>();
      completedWorkOrders?.forEach(wo => {
        if (!wo.truck_id) return;
        const arr = woByTruck.get(wo.truck_id) || [];
        arr.push({
          id: wo.id,
          service_type: wo.service_type || '',
          service_types: wo.service_types as string[] | null,
          entry_date: wo.entry_date,
          estimated_completion: wo.estimated_completion as string | null,
        });
        woByTruck.set(wo.truck_id, arr);
      });

      // Sum actual miles since a given date, or since purchase if no date provided
      const sumActualMilesSince = (truckId: string, sinceDate: string | null, purchaseMileage: number | null, currentOdometer: number) => {
        const loads = loadsByTruck.get(truckId) || [];
        
        // If no baseline date (no previous service), calculate using purchase mileage
        if (!sinceDate && purchaseMileage !== null) {
          // Miles since purchase = current odometer - purchase mileage
          return Math.max(0, currentOdometer - purchaseMileage);
        }
        
        // Otherwise sum actual_miles from loads since the baseline date
        return loads.reduce((sum, l) => {
          if (!l.actual_miles) return sum;
          if (!l.delivery_date) return sum;
          if (!sinceDate) return sum + l.actual_miles;
          return new Date(l.delivery_date).getTime() > new Date(sinceDate).getTime() ? sum + l.actual_miles : sum;
        }, 0);
      };

      const findBaselineWorkOrder = (truckId: string, matcher: (serviceType: string) => boolean): PMBaseline => {
        const wos = woByTruck.get(truckId) || [];
        const match = wos.find(wo => {
          // Check both service_types array and service_type string
          const types = wo.service_types && wo.service_types.length > 0 
            ? wo.service_types 
            : wo.service_type ? [wo.service_type] : [];
          return types.some(t => matcher(t.toLowerCase()));
        });
        return match
          ? { workOrderId: match.id, date: match.estimated_completion || match.entry_date }
          : { workOrderId: null, date: null };
      };

      // Helper to match service codes to work order service types
      const getServiceCodeMatcher = (serviceCode: string): ((serviceType: string) => boolean) => {
        switch (serviceCode) {
          case 'M1':
            return st => st.includes('m1') || st.includes('grease') || st.includes('lube');
          case 'PM_A':
            return st => st === 'pm' || st.includes('oil') || st.includes('pm a') || st.includes('pm_a');
          case 'M2':
            return st => st.includes('m2') || st.includes('annual');
          case 'M3':
            return st => st.includes('m3') || st.includes('major');
          default:
            return st => st.includes(serviceCode.toLowerCase());
        }
      };

      // Map schedules to trucks with:
      // - calculated_odometer = last delivered end_miles
      // - miles since oil/tires = sum(actual_miles) since that service was last performed
      // - baseline work order info for tooltips
      // - manufacturer-specific services
      const trucksWithSchedules: TruckWithSchedules[] =
        trucks?.map(truck => {
          const truckSchedules = schedules?.filter(s => s.truck_id === truck.id) || [];
          const oilSchedule = truckSchedules.find(s => s.service_name === 'Oil Change') || null;
          const tireSchedule = truckSchedules.find(s => s.service_name === 'Tire Replacement') || null;

          // Build manufacturer-specific services if this truck has a known manufacturer
          // Trim whitespace to handle data inconsistencies
          const manufacturerKey = (truck.make || '').trim().toLowerCase();
          const profiles = profilesByManufacturer.get(manufacturerKey) || [];
          
          const manufacturer_services: ManufacturerService[] = profiles.map(profile => {
            // Find matching schedule by profile_service_id or by service_name
            const matchingSchedule = truckSchedules.find(s => 
              s.profile_service_id === profile.id || 
              s.service_name === profile.service_name
            ) || null;

            const matcher = getServiceCodeMatcher(profile.service_code);
            const baseline = findBaselineWorkOrder(truck.id, matcher);
            const calculatedOdometer = truckOdometerMap.get(truck.id) || truck.current_odometer || 0;
            const miles_since_service = sumActualMilesSince(
              truck.id, 
              baseline.date, 
              (truck as any).purchase_mileage ?? null,
              calculatedOdometer
            );

            return {
              profile,
              schedule: matchingSchedule,
              miles_since_service,
              baseline,
            };
          });

          const calculatedOdometer = truckOdometerMap.get(truck.id) || truck.current_odometer || 0;
          const purchaseMileage = (truck as any).purchase_mileage ?? null;
          const oilBaseline = findBaselineWorkOrder(truck.id, st => st === 'pm' || st.includes('oil'));
          const tireBaseline = findBaselineWorkOrder(truck.id, st => st === 'tire' || st.includes('tire'));

          return {
            ...truck,
            purchase_mileage: purchaseMileage,
            calculated_odometer: calculatedOdometer,
            miles_since_oil_change: sumActualMilesSince(
              truck.id, 
              oilSchedule?.last_performed_date || oilBaseline.date, 
              purchaseMileage,
              calculatedOdometer
            ),
            miles_since_tire_replacement: sumActualMilesSince(
              truck.id, 
              tireSchedule?.last_performed_date || tireBaseline.date, 
              purchaseMileage,
              calculatedOdometer
            ),
            oil_change_baseline: oilBaseline,
            tire_replacement_baseline: tireBaseline,
            schedules: truckSchedules,
            manufacturer_services,
          };
        }) || [];

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
      service_types?: string[];
      description?: string;
      cost_estimate?: number;
      is_reimbursable?: boolean;
      odometer_reading?: number;
    }) => {
      const { data, error } = await supabase
        .from('work_orders')
        .insert({
          truck_id: workOrder.truck_id,
          vendor: workOrder.vendor,
          entry_date: workOrder.entry_date,
          estimated_completion: workOrder.estimated_completion,
          service_type: workOrder.service_type,
          service_types: workOrder.service_types || [],
          description: workOrder.description,
          cost_estimate: workOrder.cost_estimate,
          is_reimbursable: workOrder.is_reimbursable,
          odometer_reading: workOrder.odometer_reading,
        })
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
        .select('truck_id, service_type, service_types, entry_date, estimated_completion, odometer_reading')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Calculate days down
      const daysDown = differenceInDays(new Date(), new Date(workOrder.entry_date));

      // Complete the work order
      const { data, error } = await supabase
        .from('work_orders')
        .update({
          status: 'completed',
          final_cost,
          invoice_url,
          notes,
          completed_at: new Date().toISOString(),
          days_down: daysDown,
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

      // Get all service types (from array or single value)
      const serviceTypes: string[] = workOrder.service_types && workOrder.service_types.length > 0
        ? workOrder.service_types
        : workOrder.service_type ? [workOrder.service_type] : [];

      // Process each service type
      for (const serviceType of serviceTypes) {
        const type = serviceType.toLowerCase();
        const scheduleName = SERVICE_TYPE_TO_SCHEDULE[serviceType] || SERVICE_TYPE_TO_SCHEDULE[type];

        if (type === 'inspection' || type.includes('inspection')) {
          // Update the 120-Day Inspection service schedule for this truck
          const inspectionDate = workOrder.estimated_completion || workOrder.entry_date;
          const nextInspectionDate = addDays(new Date(`${inspectionDate}T00:00:00`), 120)
            .toISOString()
            .split('T')[0];

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

          // Also update the truck's inspection dates so Safety alerts clear
          await supabase
            .from('trucks')
            .update({
              last_120_inspection_date: inspectionDate,
              last_120_inspection_miles: workOrder.odometer_reading || currentOdometer,
              next_inspection_date: nextInspectionDate,
            })
            .eq('id', workOrder.truck_id);
        } else if (scheduleName) {
          // Update the corresponding service schedule
          await supabase
            .from('service_schedules')
            .update({
              last_performed_date: workOrder.estimated_completion || workOrder.entry_date,
              last_performed_miles: currentOdometer,
            })
            .eq('truck_id', workOrder.truck_id)
            .eq('service_name', scheduleName);
        }
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
      queryClient.invalidateQueries({ queryKey: ['trucks'] });
      queryClient.invalidateQueries({ queryKey: ['driver-fault-reports'] });
      queryClient.invalidateQueries({ queryKey: ['driver-maintenance-requests'] });
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
        .is('deleted_at', null)
        .order('service_date', { ascending: false });

      if (logsError) throw logsError;

      // Fetch the org's avg daily revenue target (fallback to constant).
      const { data: dailyRevSetting } = await supabase
        .from('company_settings')
        .select('setting_value')
        .eq('setting_key', 'avg_daily_truck_revenue')
        .maybeSingle();
      const avgDailyRevenue =
        parseFloat(dailyRevSetting?.setting_value || '') || 0;

      // Calculate stats
      const totalSpend =
        (workOrders?.reduce((sum, wo) => sum + (wo.final_cost || 0), 0) || 0) +
        (logs?.reduce((sum, log) => sum + (log.cost || 0), 0) || 0);

      const lastServiceDate = [...(workOrders || []), ...(logs || [])]
        .map(item => 'completed_at' in item ? item.completed_at : item.service_date)
        .filter(Boolean)
        .sort()
        .pop();

      // === Down-Time Leakage ===
      const today = new Date();
      const openWorkOrders = (workOrders || []).filter(wo => wo.status !== 'completed');
      const liveDaysDown = openWorkOrders.reduce((sum, wo) => {
        if (!wo.entry_date) return sum;
        const entry = new Date(`${wo.entry_date.slice(0, 10)}T00:00:00`);
        const days = Math.max(0, differenceInDays(today, entry));
        return sum + days;
      }, 0);
      const historicalDaysDown = (workOrders || [])
        .filter(wo => wo.status === 'completed')
        .reduce((sum, wo) => sum + (wo.days_down || 0), 0);
      const totalDaysDown = liveDaysDown + historicalDaysDown;
      const opportunityRevenueLost = totalDaysDown * avgDailyRevenue;

      // === Chronic Issue Detection (trailing 30 days) ===
      const thirtyAgo = subDays(today, 30);
      const chronicEntries: ChronicEntry[] = [];

      for (const log of logs || []) {
        if (!log.service_date) continue;
        const d = new Date(`${log.service_date.slice(0, 10)}T00:00:00`);
        if (d < thirtyAgo) continue;
        if (!isMinorEntry(log.service_type, log.description)) continue;
        chronicEntries.push({
          id: log.id,
          source: 'log',
          description: log.description || log.service_type || 'Minor maintenance log',
          date: log.service_date,
          category: log.service_type || 'general',
        });
      }
      for (const wo of workOrders || []) {
        if (wo.status === 'completed') continue;

        if (!wo.entry_date) continue;
        const d = new Date(`${wo.entry_date.slice(0, 10)}T00:00:00`);
        if (d < thirtyAgo) continue;
        if (!isMinorEntry(wo.service_type, wo.description)) continue;
        chronicEntries.push({
          id: wo.id,
          source: 'work_order',
          description: wo.description || wo.service_type || 'Open minor work order',
          date: wo.entry_date,
          category: wo.service_type || 'general',
        });
      }

      const chronic = {
        hasChronicIssue: chronicEntries.length > 2,
        count: chronicEntries.length,
        entries: chronicEntries.slice(0, 10),
      };

      return {
        truck,
        workOrders: workOrders || [],
        logs: logs || [],
        stats: {
          totalSpend,
          lastServiceDate,
          openWorkOrders: openWorkOrders.length,
          liveDaysDown,
          historicalDaysDown,
          totalDaysDown,
          avgDailyRevenue,
          opportunityRevenueLost,
        },
        chronic,
      };
    },
  });
}

/**
 * Fleet-wide chronic issue scan. Returns truck IDs with > 2 uncorrected minor
 * maintenance entries in the trailing 30 days. Used by PMFleetHealthSummary.
 */
export function useChronicIssueTrucks() {
  return useQuery({
    queryKey: ['chronic-issue-trucks'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const thirtyAgoIso = subDays(new Date(), 30).toISOString().slice(0, 10);
      const [logsRes, wosRes] = await Promise.all([
        supabase
          .from('maintenance_logs')
          .select('id, truck_id, service_type, description, service_date')
          .gte('service_date', thirtyAgoIso),
        supabase
          .from('work_orders')
          .select('id, truck_id, service_type, description, status, entry_date')
          .gte('entry_date', thirtyAgoIso)
          .neq('status', 'completed'),
      ]);

      const counts = new Map<string, number>();
      for (const l of logsRes.data || []) {
        if (!l.truck_id) continue;
        if (!isMinorEntry(l.service_type, l.description)) continue;
        counts.set(l.truck_id, (counts.get(l.truck_id) || 0) + 1);
      }
      for (const wo of wosRes.data || []) {
        if (!wo.truck_id) continue;
        if (!isMinorEntry(wo.service_type, wo.description)) continue;
        counts.set(wo.truck_id, (counts.get(wo.truck_id) || 0) + 1);
      }

      const truckIds = new Set<string>();
      for (const [id, count] of counts) if (count > 2) truckIds.add(id);
      return { truckIds, count: truckIds.size };
    },
  });
}


export function useTruckProfitability(truckId: string | null) {
  const { data, isLoading } = useQuery({
    queryKey: ['truck-profitability', truckId],
    queryFn: async () => {
      if (!truckId) return null;

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

      const [{ data: loads, error: loadsError }, { data: workOrders, error: woError }, { data: expenses, error: expensesError }, { data: dailyRevSetting }] = await Promise.all([
        supabase
          .from('fleet_loads')
          .select('gross_revenue, delivery_date')
          .eq('truck_id', truckId)
          .eq('status', 'delivered')
          .gte('delivery_date', ninetyDaysAgoStr),
        supabase
          .from('work_orders')
          .select('final_cost, estimated_completion, days_down')
          .eq('truck_id', truckId)
          .eq('status', 'completed')
          .gte('estimated_completion', ninetyDaysAgoStr)
          .not('final_cost', 'is', null),
        supabase
          .from('expenses')
          .select('amount, expense_date')
          .eq('truck_id', truckId)
          .gte('expense_date', ninetyDaysAgoStr),
        supabase
          .from('company_settings')
          .select('setting_value')
          .eq('setting_key', 'avg_daily_truck_revenue')
          .maybeSingle(),
      ]);

      if (loadsError) throw loadsError;
      if (woError) throw woError;
      if (expensesError) throw expensesError;

      const avgDailyRevenue =
        parseFloat(dailyRevSetting?.setting_value || '') || 0;
      const totalRevenue = (loads || []).reduce((sum, load) => sum + (load.gross_revenue || 0), 0);
      const totalMaintenanceCost = (workOrders || []).reduce((sum, wo) => sum + (wo.final_cost || 0), 0);
      const totalDaysDown = (workOrders || []).reduce((sum, wo) => sum + (wo.days_down || 0), 0);
      const estimatedLostRevenue = totalDaysDown * avgDailyRevenue;
      const totalExpenses = (expenses || []).reduce((sum, exp) => sum + (exp.amount || 0), 0);
      const totalCost = totalMaintenanceCost + totalExpenses;
      const netProfit = totalRevenue - totalCost;
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      const monthlyMap = new Map<string, { revenue: number; cost: number }>();

      (loads || []).forEach(load => {
        if (load.delivery_date) {
          const month = load.delivery_date.substring(0, 7);
          const existing = monthlyMap.get(month) || { revenue: 0, cost: 0 };
          monthlyMap.set(month, { ...existing, revenue: existing.revenue + (load.gross_revenue || 0) });
        }
      });
      (workOrders || []).forEach(wo => {
        if (wo.estimated_completion) {
          const month = wo.estimated_completion.substring(0, 7);
          const existing = monthlyMap.get(month) || { revenue: 0, cost: 0 };
          monthlyMap.set(month, { ...existing, cost: existing.cost + (wo.final_cost || 0) });
        }
      });
      (expenses || []).forEach(exp => {
        if (exp.expense_date) {
          const month = exp.expense_date.substring(0, 7);
          const existing = monthlyMap.get(month) || { revenue: 0, cost: 0 };
          monthlyMap.set(month, { ...existing, cost: existing.cost + (exp.amount || 0) });
        }
      });

      const chartData = Array.from(monthlyMap.entries())
        .map(([month, values]) => ({ month, revenue: values.revenue, cost: values.cost }))
        .sort((a, b) => a.month.localeCompare(b.month));

      return { totalRevenue, totalCost, netProfit, profitMargin, chartData, totalMaintenanceCost, totalDaysDown, estimatedLostRevenue, avgDailyRevenue };
    },
    enabled: !!truckId,
  });

  return { data, isLoading };
}

// ============================================================================
// Parts Inventory — low stock alerts for the Maintenance Dashboard
// ============================================================================
export interface PartInventoryItem {
  id: string;
  org_id: string;
  part_number: string | null;
  part_name: string;
  category: string | null;
  quantity_on_hand: number;
  min_threshold: number;
  unit: string;
  reorder_url: string | null;
  reorder_requested_at: string | null;
  notes: string | null;
  vendor_name: string | null;
  last_restocked: string | null;
  created_at: string;
  updated_at: string;
}

export function useAllPartsInventory() {
  return useQuery({
    queryKey: ['all-parts-inventory'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('parts_inventory')
        .select('*')
        .order('part_name', { ascending: true });
      if (error) throw error;
      return (data || []) as PartInventoryItem[];
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}

export function useLowStockParts() {
  return useQuery({
    queryKey: ['low-stock-parts'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('parts_inventory')
        .select('*')
        .order('quantity_on_hand', { ascending: true })
        .limit(50);

      if (error) throw error;

      const all = (data || []) as PartInventoryItem[];
      const low = all.filter(p => Number(p.quantity_on_hand) <= Number(p.min_threshold));
      low.sort((a, b) => {
        const ra = a.min_threshold > 0 ? a.quantity_on_hand / a.min_threshold : a.quantity_on_hand;
        const rb = b.min_threshold > 0 ? b.quantity_on_hand / b.min_threshold : b.quantity_on_hand;
        return ra - rb;
      });
      return low.slice(0, 8);
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}

export function useRequestReorder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partId: string) => {
      const { error } = await (supabase as any)
        .from('parts_inventory')
        .update({ reorder_requested_at: new Date().toISOString() })
        .eq('id', partId);
      if (error) throw error;
      return partId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['low-stock-parts'] });
      queryClient.invalidateQueries({ queryKey: ['all-parts-inventory'] });
    },
  });
}

// Helper: resolve current user's org_id for inserts
async function getCurrentOrgId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.org_id) throw new Error('No organization found for user');
  return data.org_id as string;
}

function invalidatePartsQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['all-parts-inventory'] });
  qc.invalidateQueries({ queryKey: ['low-stock-parts'] });
}

export interface CreatePartInput {
  part_name: string;
  part_number?: string | null;
  vendor_name?: string | null;
  category?: string | null;
  unit?: string;
  quantity_on_hand: number;
  min_threshold: number;
}

export function useCreatePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePartInput) => {
      const org_id = await getCurrentOrgId();
      const payload = {
        org_id,
        part_name: input.part_name,
        part_number: input.part_number || null,
        vendor_name: input.vendor_name || null,
        category: input.category || null,
        unit: input.unit || 'ea',
        quantity_on_hand: input.quantity_on_hand,
        min_threshold: input.min_threshold,
        last_restocked: new Date().toISOString(),
      };
      const { data, error } = await (supabase as any)
        .from('parts_inventory')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as PartInventoryItem;
    },
    onSuccess: () => invalidatePartsQueries(queryClient),
  });
}

export interface UpdatePartInput {
  id: string;
  part_name?: string;
  part_number?: string | null;
  vendor_name?: string | null;
  category?: string | null;
  unit?: string;
  min_threshold?: number;
}

export function useUpdatePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdatePartInput) => {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        cleaned[k] = v === '' ? null : v;
      }
      const { error } = await (supabase as any)
        .from('parts_inventory')
        .update(cleaned)
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => invalidatePartsQueries(queryClient),
  });
}

export interface ReceiveShipmentInput {
  id: string;
  quantity: number;
  vendor_name?: string | null;
}

export function useReceiveShipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, quantity, vendor_name }: ReceiveShipmentInput) => {
      // Fetch current quantity (small dataset; acceptable race risk)
      const { data: current, error: fetchError } = await (supabase as any)
        .from('parts_inventory')
        .select('quantity_on_hand')
        .eq('id', id)
        .single();
      if (fetchError) throw fetchError;

      const newQty = Number(current.quantity_on_hand) + Number(quantity);
      const patch: Record<string, unknown> = {
        quantity_on_hand: newQty,
        last_restocked: new Date().toISOString(),
        reorder_requested_at: null,
      };
      if (vendor_name && vendor_name.trim()) {
        patch.vendor_name = vendor_name.trim();
      }
      const { error } = await (supabase as any)
        .from('parts_inventory')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
      return { id, newQty };
    },
    onSuccess: () => invalidatePartsQueries(queryClient),
  });
}

export function useDeletePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('parts_inventory')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => invalidatePartsQueries(queryClient),
  });
}

// ============================================================================
// Quick Actions — supporting hooks
// ============================================================================

export interface ActiveDriverRow {
  id: string;
  first_name: string;
  last_name: string;
}

export function useActiveDrivers() {
  return useQuery({
    queryKey: ['active-drivers'],
    queryFn: async (): Promise<ActiveDriverRow[]> => {
      const { data, error } = await supabase
        .from('drivers')
        .select('id, first_name, last_name, status')
        .eq('status', 'active')
        .order('first_name', { ascending: true });
      if (error) throw error;
      return (data || []) as ActiveDriverRow[];
    },
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
}

export interface LogPartUsageInput {
  part_id: string;
  quantity: number;
  truck_id?: string | null;
  truck_label?: string | null;
  work_order_id?: string | null;
}

export function useLogPartUsage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: LogPartUsageInput) => {
      const { data: current, error: fetchError } = await (supabase as any)
        .from('parts_inventory')
        .select('quantity_on_hand, notes, part_name')
        .eq('id', input.part_id)
        .single();
      if (fetchError) throw fetchError;

      const newQty = Math.max(0, Number(current.quantity_on_hand) - Number(input.quantity));
      const stamp = new Date().toISOString().slice(0, 10);
      const target =
        input.work_order_id
          ? `WO ${input.work_order_id.slice(0, 8)}`
          : input.truck_label
            ? `Truck ${input.truck_label}`
            : input.truck_id
              ? `Truck ${input.truck_id.slice(0, 8)}`
              : 'unassigned';
      const usageLine = `${stamp}: Used ${input.quantity} on ${target}`;
      const notes = current.notes ? `${current.notes}\n${usageLine}` : usageLine;

      const { error } = await (supabase as any)
        .from('parts_inventory')
        .update({ quantity_on_hand: newQty, notes })
        .eq('id', input.part_id);
      if (error) throw error;
      return { id: input.part_id, newQty };
    },
    onSuccess: () => invalidatePartsQueries(queryClient),
  });
}

export type TruckStatus = 'active' | 'in_shop' | 'out_of_service' | 'pending_inspection';

export interface UpdateTruckStatusInput {
  truck_id: string;
  status: TruckStatus;
}

export function useUpdateTruckStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ truck_id, status }: UpdateTruckStatusInput) => {
      const { error } = await supabase
        .from('trucks')
        .update({ status })
        .eq('id', truck_id);
      if (error) throw error;
      return truck_id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trucks-list'] });
      queryClient.invalidateQueries({ queryKey: ['fleet-availability'] });
      queryClient.invalidateQueries({ queryKey: ['active-work-orders'] });
    },
  });
}

export interface MessageDriverInput {
  driver_id: string;
  body: string;
}

export function useMessageDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ driver_id, body }: MessageDriverInput) => {
      // 1. Try to find an existing open thread for this driver
      const { data: existing, error: findErr } = await supabase
        .from('maintenance_requests')
        .select('id')
        .eq('driver_id', driver_id)
        .in('status', ['submitted', 'acknowledged', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (findErr) throw findErr;

      let requestId = existing && existing.length > 0 ? (existing[0] as any).id as string : null;

      // 2. Otherwise create a fresh thread
      if (!requestId) {
        const org_id = await getCurrentOrgId();

        // Find a truck for this driver (current_driver_id) or any truck in the org
        const { data: assignedTruck } = await supabase
          .from('trucks')
          .select('id')
          .eq('current_driver_id', driver_id)
          .maybeSingle();
        let truckId = assignedTruck?.id as string | undefined;
        if (!truckId) {
          const { data: anyTruck, error: truckErr } = await supabase
            .from('trucks')
            .select('id')
            .eq('org_id', org_id)
            .limit(1)
            .maybeSingle();
          if (truckErr) throw truckErr;
          if (!anyTruck?.id) throw new Error('No truck available to start a thread.');
          truckId = anyTruck.id as string;
        }

        const { data: created, error: insertErr } = await supabase
          .from('maintenance_requests')
          .insert({
            driver_id,
            truck_id: truckId,
            org_id,
            issue_type: 'other',
            priority: 'medium',
            description: 'Message from maintenance team',
            status: 'acknowledged',
          })
          .select('id')
          .single();
        if (insertErr) throw insertErr;
        requestId = created.id as string;
      }

      // 3. Post the chat message
      const { error: msgErr } = await supabase
        .from('maintenance_request_messages')
        .insert({
          request_id: requestId,
          body,
          sender_role: 'maintenance',
          message_type: 'chat',
        } as any);
      if (msgErr) throw msgErr;

      return requestId;
    },
    onSuccess: (requestId) => {
      queryClient.invalidateQueries({ queryKey: ['driver-fault-reports'] });
      queryClient.invalidateQueries({ queryKey: ['driver-maintenance-requests'] });
      if (requestId) {
        queryClient.invalidateQueries({ queryKey: ['maintenance-thread', requestId] });
      }
    },
  });
}
