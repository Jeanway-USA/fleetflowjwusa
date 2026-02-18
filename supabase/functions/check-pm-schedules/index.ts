import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed origins for CORS - restrict to known domains
const ALLOWED_ORIGINS = [
  'https://id-preview--a815e5bc-e7f9-4eda-be65-87a78fb56f21.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(allowed => 
    origin === allowed || origin.endsWith('.lovable.app') || origin.endsWith('.lovableproject.com')
  );
  
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

interface PMProfile {
  id: string;
  manufacturer: string;
  service_code: string;
  service_name: string;
  interval_miles: number | null;
  interval_days: number | null;
}

interface ServiceSchedule {
  id: string;
  truck_id: string;
  service_name: string;
  interval_miles: number | null;
  interval_days: number | null;
  last_performed_date: string | null;
  last_performed_miles: number | null;
  profile_service_id: string | null;
}

interface Truck {
  id: string;
  unit_number: string;
  make: string | null;
  current_odometer: number | null;
}

interface WorkOrder {
  id: string;
  truck_id: string;
  entry_date: string;
  service_type: string;
  service_types: string[] | null;
}

interface FleetLoad {
  truck_id: string;
  end_miles: number | null;
  actual_miles: number | null;
  delivery_date: string | null;
}

interface NotificationToCreate {
  truck_id: string;
  service_name: string;
  service_code: string | null;
  notification_type: 'overdue' | 'due_soon' | 'upcoming';
  days_or_miles_remaining: number;
  unit: 'miles' | 'days';
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Verify user has operations access (owner or dispatcher)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: hasAccess } = await supabase.rpc('has_operations_access', { _user_id: user.id });
    
    if (!hasAccess) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`PM schedule check initiated by user: ${user.id}`);

    // Fetch all required data in parallel
    const [
      { data: trucks, error: trucksError },
      { data: profiles, error: profilesError },
      { data: schedules, error: schedulesError },
      { data: workOrders, error: woError },
      { data: loads, error: loadsError },
      { data: existingNotifications, error: existingError },
    ] = await Promise.all([
      supabase.from("trucks").select("id, unit_number, make, current_odometer").eq("status", "active"),
      supabase.from("manufacturer_pm_profiles").select("*"),
      supabase.from("service_schedules").select("*"),
      supabase.from("work_orders").select("id, truck_id, entry_date, service_type, service_types").eq("status", "completed").order("entry_date", { ascending: false }),
      supabase.from("fleet_loads").select("truck_id, end_miles, actual_miles, delivery_date").eq("status", "delivered"),
      supabase.from("pm_notifications").select("truck_id, service_name, notification_type").gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()), // Last 24h
    ]);

    if (trucksError) throw trucksError;
    if (profilesError) throw profilesError;
    if (schedulesError) throw schedulesError;
    if (woError) throw woError;
    if (loadsError) throw loadsError;
    if (existingError) throw existingError;

    // Build lookup maps
    const profilesByManufacturer = new Map<string, PMProfile[]>();
    (profiles || []).forEach((p: PMProfile) => {
      const key = p.manufacturer.toLowerCase();
      if (!profilesByManufacturer.has(key)) {
        profilesByManufacturer.set(key, []);
      }
      profilesByManufacturer.get(key)!.push(p);
    });

    const schedulesByTruck = new Map<string, ServiceSchedule[]>();
    (schedules || []).forEach((s: ServiceSchedule) => {
      if (!schedulesByTruck.has(s.truck_id)) {
        schedulesByTruck.set(s.truck_id, []);
      }
      schedulesByTruck.get(s.truck_id)!.push(s);
    });

    const woByTruck = new Map<string, WorkOrder[]>();
    (workOrders || []).forEach((wo: WorkOrder) => {
      if (!woByTruck.has(wo.truck_id)) {
        woByTruck.set(wo.truck_id, []);
      }
      woByTruck.get(wo.truck_id)!.push(wo);
    });

    // Calculate odometer from delivered loads
    const truckOdometerMap = new Map<string, number>();
    const loadsByTruck = new Map<string, FleetLoad[]>();
    (loads || []).forEach((l: FleetLoad) => {
      if (!loadsByTruck.has(l.truck_id)) {
        loadsByTruck.set(l.truck_id, []);
      }
      loadsByTruck.get(l.truck_id)!.push(l);
    });

    loadsByTruck.forEach((truckLoads, truckId) => {
      const sorted = truckLoads
        .filter(l => l.end_miles && l.delivery_date)
        .sort((a, b) => new Date(b.delivery_date!).getTime() - new Date(a.delivery_date!).getTime());
      if (sorted.length > 0) {
        truckOdometerMap.set(truckId, sorted[0].end_miles!);
      }
    });

    // Build existing notification lookup
    const existingNotifKey = (truckId: string, serviceName: string, type: string) => 
      `${truckId}:${serviceName}:${type}`;
    const existingNotifSet = new Set(
      (existingNotifications || []).map((n: any) => existingNotifKey(n.truck_id, n.service_name, n.notification_type))
    );

    // Helper to match service codes to work orders
    const getServiceCodeMatcher = (serviceCode: string): ((serviceType: string) => boolean) => {
      const code = serviceCode.toLowerCase();
      switch (code) {
        case 'm1': return st => st.includes('m1') || st.includes('grease') || st.includes('lube');
        case 'pm_a': return st => st === 'pm' || st.includes('oil') || st.includes('pm a') || st.includes('pm_a');
        case 'm2': return st => st.includes('m2') || st.includes('annual');
        case 'm3': return st => st.includes('m3') || st.includes('major');
        case 'pm_b': return st => st.includes('pm b') || st.includes('pm_b');
        case 'pm_c': return st => st.includes('pm c') || st.includes('pm_c');
        case 'pm_d': return st => st.includes('pm d') || st.includes('pm_d');
        case 'pm_de': return st => st.includes('pm d') || st.includes('pm_de') || st.includes('pm e');
        case 'pm_e': return st => st.includes('pm e') || st.includes('pm_e');
        case 'pm_g': return st => st.includes('pm g') || st.includes('pm_g');
        case 'class_a': return st => st.includes('class a') || st.includes('class_a');
        case 'class_b': return st => st.includes('class b') || st.includes('class_b');
        case 'class_c': return st => st.includes('class c') || st.includes('class_c');
        case 'class_d': return st => st.includes('class d') || st.includes('class_d');
        default: return st => st.includes(code);
      }
    };

    const findBaselineDate = (truckId: string, matcher: (st: string) => boolean): string | null => {
      const wos = woByTruck.get(truckId) || [];
      const match = wos.find(wo => {
        const types = wo.service_types?.length ? wo.service_types : wo.service_type ? [wo.service_type] : [];
        return types.some(t => matcher(t.toLowerCase()));
      });
      return match?.entry_date || null;
    };

    const sumMilesSince = (truckId: string, sinceDate: string | null): number => {
      const truckLoads = loadsByTruck.get(truckId) || [];
      if (!sinceDate) {
        return truckLoads.reduce((sum, l) => sum + (l.actual_miles || 0), 0);
      }
      const sinceTime = new Date(sinceDate).getTime();
      return truckLoads
        .filter(l => l.delivery_date && new Date(l.delivery_date).getTime() > sinceTime)
        .reduce((sum, l) => sum + (l.actual_miles || 0), 0);
    };

    const notifications: NotificationToCreate[] = [];

    // Thresholds
    const MILES_DUE_SOON = 2000;
    const DAYS_DUE_SOON = 14;

    // Check each truck
    for (const truck of (trucks || [])) {
      const manufacturerKey = (truck.make || '').toLowerCase();
      const manufacturerProfiles = profilesByManufacturer.get(manufacturerKey) || [];
      const truckSchedules = schedulesByTruck.get(truck.id) || [];
      const currentOdometer = truckOdometerMap.get(truck.id) || truck.current_odometer || 0;

      // Check manufacturer-specific services
      for (const profile of manufacturerProfiles) {
        if (!profile.interval_miles) continue;

        const matcher = getServiceCodeMatcher(profile.service_code);
        const baselineDate = findBaselineDate(truck.id, matcher);
        const milesSinceService = sumMilesSince(truck.id, baselineDate);
        const remaining = profile.interval_miles - milesSinceService;

        let notificationType: 'overdue' | 'due_soon' | 'upcoming' | null = null;
        if (remaining < 0) {
          notificationType = 'overdue';
        } else if (remaining <= MILES_DUE_SOON) {
          notificationType = 'due_soon';
        }

        if (notificationType) {
          const key = existingNotifKey(truck.id, profile.service_name, notificationType);
          if (!existingNotifSet.has(key)) {
            notifications.push({
              truck_id: truck.id,
              service_name: profile.service_name,
              service_code: profile.service_code,
              notification_type: notificationType,
              days_or_miles_remaining: remaining,
              unit: 'miles',
            });
          }
        }
      }

      // Check generic services (Oil Change, Tires, 120-Day)
      for (const schedule of truckSchedules) {
        if (manufacturerProfiles.length > 0 && schedule.service_name !== '120-Day Inspection') {
          continue; // Skip generic services if truck has manufacturer profiles
        }

        if (schedule.interval_days) {
          // Date-based service (120-Day Inspection)
          const lastDate = schedule.last_performed_date ? new Date(schedule.last_performed_date) : null;
          if (!lastDate) {
            // Never performed - mark as overdue
            const key = existingNotifKey(truck.id, schedule.service_name, 'overdue');
            if (!existingNotifSet.has(key)) {
              notifications.push({
                truck_id: truck.id,
                service_name: schedule.service_name,
                service_code: null,
                notification_type: 'overdue',
                days_or_miles_remaining: -999,
                unit: 'days',
              });
            }
          } else {
            const dueDate = new Date(lastDate);
            dueDate.setDate(dueDate.getDate() + schedule.interval_days);
            const daysRemaining = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

            let notificationType: 'overdue' | 'due_soon' | null = null;
            if (daysRemaining < 0) {
              notificationType = 'overdue';
            } else if (daysRemaining <= DAYS_DUE_SOON) {
              notificationType = 'due_soon';
            }

            if (notificationType) {
              const key = existingNotifKey(truck.id, schedule.service_name, notificationType);
              if (!existingNotifSet.has(key)) {
                notifications.push({
                  truck_id: truck.id,
                  service_name: schedule.service_name,
                  service_code: null,
                  notification_type: notificationType,
                  days_or_miles_remaining: daysRemaining,
                  unit: 'days',
                });
              }
            }
          }
        } else if (schedule.interval_miles) {
          // Mileage-based service
          const serviceMatcher = schedule.service_name.toLowerCase().includes('oil')
            ? (st: string) => st === 'pm' || st.includes('oil')
            : schedule.service_name.toLowerCase().includes('tire')
            ? (st: string) => st === 'tire' || st.includes('tire')
            : () => false;

          const baselineDate = findBaselineDate(truck.id, serviceMatcher) || schedule.last_performed_date;
          const milesSinceService = sumMilesSince(truck.id, baselineDate);
          const remaining = schedule.interval_miles - milesSinceService;

          let notificationType: 'overdue' | 'due_soon' | null = null;
          if (remaining < 0) {
            notificationType = 'overdue';
          } else if (remaining <= MILES_DUE_SOON) {
            notificationType = 'due_soon';
          }

          if (notificationType) {
            const key = existingNotifKey(truck.id, schedule.service_name, notificationType);
            if (!existingNotifSet.has(key)) {
              notifications.push({
                truck_id: truck.id,
                service_name: schedule.service_name,
                service_code: null,
                notification_type: notificationType,
                days_or_miles_remaining: remaining,
                unit: 'miles',
              });
            }
          }
        }
      }
    }

    console.log(`Found ${notifications.length} new PM notifications to create`);

    // Insert notifications
    if (notifications.length > 0) {
      const { error: insertError } = await supabase
        .from("pm_notifications")
        .insert(notifications);

      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        notificationsCreated: notifications.length,
        message: `Created ${notifications.length} PM notifications`
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error checking PM schedules:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});