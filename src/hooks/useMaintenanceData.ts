import { todayLocal, toLocalIso } from '@/lib/datetime';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, differenceInDays, addDays, subDays, parseISO } from 'date-fns';

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
        .select('id, status')
        .is('deleted_at', null);
      
      if (trucksError) throw trucksError;

      const { data: activeWorkOrders, error: woError } = await supabase
        .from('work_orders')
        .select('truck_id')
        .in('status', ['open', 'parts_ordered', 'in_progress'])
        .is('deleted_at', null);
      
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
      // service_date is a plain date: compare it with local calendar days, not the UTC day of the end instant
      const firstDay = toLocalIso(startOfMonth(now));
      const lastDay = toLocalIso(endOfMonth(now));

      // Get costs from maintenance_logs
      const { data: logs, error: logsError } = await supabase
        .from('maintenance_logs')
        .select('cost')
        .is('deleted_at', null)
        .gte('service_date', firstDay)
        .lte('service_date', lastDay);

      if (logsError) throw logsError;

      // Get costs from completed work orders this month
      const { data: workOrders, error: woError } = await supabase
        .from('work_orders')
        .select('final_cost')
        .eq('status', 'completed')
        .is('deleted_at', null)
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
        .select('cost')
        .is('deleted_at', null);

      if (logsError) throw logsError;

      const { data: workOrders, error: woError } = await supabase
        .from('work_orders')
        .select('final_cost')
        .eq('status', 'completed')
        .is('deleted_at', null);

      if (woError) throw woError;

      // Get total miles from fleet_loads
      const { data: loads, error: loadsError } = await supabase
        .from('fleet_loads')
        .select('actual_miles')
        .eq('status', 'delivered')
        .is('deleted_at', null);

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
        
        const lastDate = parseISO(schedule.last_performed_date);
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
            addDays(parseISO(s.last_performed_date), s.interval_days || 120),
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

// Hook for Service History (completed work orders + maintenance logs)

// Hook for PM Schedule with health calculations
export function usePMSchedule() {
  return useQuery({
    queryKey: ['pm-schedule'],
    queryFn: async () => {
      const { data: trucks, error: trucksError } = await supabase
        .from('trucks')
        .select('id, unit_number, make, current_odometer, last_120_inspection_date, status, purchase_mileage')
        .eq('status', 'active')
        .is('deleted_at', null)
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
        .is('deleted_at', null)
        .order('delivery_date', { ascending: false });

      if (loadsError) throw loadsError;

      // Fetch completed work orders to find baseline work orders for each PM type
      const { data: completedWorkOrders, error: woError } = await supabase
        .from('work_orders')
        .select('id, truck_id, service_type, service_types, entry_date, estimated_completion')
        .eq('status', 'completed')
        .is('deleted_at', null)
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
      const daysDown = differenceInDays(new Date(), parseISO(workOrder.entry_date));

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
        .is('deleted_at', null)
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

// ============================================================================
// Quick Actions — supporting hooks
// ============================================================================

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
