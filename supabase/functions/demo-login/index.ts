import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_EMAIL = "demo@fleetflow-tms.com";
const DEMO_ORG_NAME = "Demo Trucking Co.";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Try to sign in the demo user first
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });

    if (signInData?.session) {
      return new Response(
        JSON.stringify({ session: signInData.session }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Demo user doesn't exist yet — create everything
    // 1. Create demo org
    const { data: orgData, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: DEMO_ORG_NAME, subscription_tier: "all_in_one" })
      .select("id")
      .single();

    if (orgError) throw new Error(`Org creation failed: ${orgError.message}`);

    // 2. Create demo user (auto-confirmed)
    const { data: userData, error: userError } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { first_name: "Demo", last_name: "User" },
    });

    if (userError) throw new Error(`User creation failed: ${userError.message}`);
    const userId = userData.user.id;

    // 3. Link profile to org
    await supabase
      .from("profiles")
      .update({ org_id: orgData.id, first_name: "Demo", last_name: "User" })
      .eq("user_id", userId);

    // 4. Assign owner role
    await supabase.from("user_roles").insert({ user_id: userId, role: "owner" });

    // 5. Seed sample data
    const orgId = orgData.id;

    // Sample trucks
    const { data: trucks } = await supabase
      .from("trucks")
      .insert([
        { unit_number: "T-101", make: "Freightliner", model: "Cascadia", year: 2022, vin: "DEMO1234567890001", status: "active", org_id: orgId },
        { unit_number: "T-102", make: "Kenworth", model: "T680", year: 2023, vin: "DEMO1234567890002", status: "active", org_id: orgId },
        { unit_number: "T-103", make: "Peterbilt", model: "579", year: 2021, vin: "DEMO1234567890003", status: "in_shop", org_id: orgId },
      ])
      .select("id, unit_number");

    // Sample drivers
    const { data: drivers } = await supabase
      .from("drivers")
      .insert([
        { first_name: "Mike", last_name: "Johnson", email: "mike@demo.com", phone: "555-0101", status: "active", pay_type: "percentage", pay_rate: 75, org_id: orgId },
        { first_name: "Sarah", last_name: "Williams", email: "sarah@demo.com", phone: "555-0102", status: "active", pay_type: "percentage", pay_rate: 72, org_id: orgId },
        { first_name: "Carlos", last_name: "Rodriguez", email: "carlos@demo.com", phone: "555-0103", status: "on_leave", pay_type: "per_mile", pay_rate: 0.65, org_id: orgId },
      ])
      .select("id");

    // Sample fleet loads
    if (trucks && drivers && trucks.length >= 2 && drivers.length >= 2) {
      await supabase.from("fleet_loads").insert([
        { origin: "Dallas, TX", destination: "Houston, TX", rate: 2200, status: "delivered", pickup_date: "2026-02-01", delivery_date: "2026-02-02", driver_id: drivers[0].id, truck_id: trucks[0].id, booked_miles: 240, actual_miles: 245, gross_revenue: 2200, net_revenue: 1870, org_id: orgId },
        { origin: "Atlanta, GA", destination: "Nashville, TN", rate: 1800, status: "delivered", pickup_date: "2026-02-03", delivery_date: "2026-02-04", driver_id: drivers[1].id, truck_id: trucks[1].id, booked_miles: 250, actual_miles: 255, gross_revenue: 1800, net_revenue: 1530, org_id: orgId },
        { origin: "Chicago, IL", destination: "Indianapolis, IN", rate: 1500, status: "in_transit", pickup_date: "2026-02-10", driver_id: drivers[0].id, truck_id: trucks[0].id, booked_miles: 180, org_id: orgId },
        { origin: "Miami, FL", destination: "Jacksonville, FL", rate: 1900, status: "pending", pickup_date: "2026-02-14", booked_miles: 345, org_id: orgId },
        { origin: "Los Angeles, CA", destination: "Phoenix, AZ", rate: 2500, status: "delivered", pickup_date: "2026-01-28", delivery_date: "2026-01-29", driver_id: drivers[1].id, truck_id: trucks[1].id, booked_miles: 370, actual_miles: 375, gross_revenue: 2500, net_revenue: 2125, org_id: orgId },
      ]);
    }

    // Sample expenses
    if (trucks && trucks.length >= 2) {
      await supabase.from("expenses").insert([
        { expense_type: "Fuel", amount: 450, expense_date: "2026-02-01", vendor: "Pilot", gallons: 120, jurisdiction: "TX", truck_id: trucks[0].id, org_id: orgId },
        { expense_type: "Fuel", amount: 380, expense_date: "2026-02-03", vendor: "Love's", gallons: 100, jurisdiction: "GA", truck_id: trucks[1].id, org_id: orgId },
        { expense_type: "Repairs", amount: 850, expense_date: "2026-02-05", vendor: "TruckPro", description: "Brake pad replacement", truck_id: trucks[2].id, org_id: orgId },
        { expense_type: "Insurance", amount: 1200, expense_date: "2026-02-01", description: "Monthly premium", org_id: orgId },
      ]);
    }

    // Sample CRM contacts for Agency view
    await supabase.from("crm_contacts").insert([
      { company_name: "Swift Logistics", contact_name: "John Davis", contact_type: "shipper", email: "john@swiftlogistics.com", phone: "555-0201", city: "Dallas", state: "TX", is_active: true, org_id: orgId },
      { company_name: "Prime Carriers", contact_name: "Maria Santos", contact_type: "carrier", email: "maria@primecarriers.com", phone: "555-0202", city: "Atlanta", state: "GA", is_active: true, org_id: orgId },
      { company_name: "Landstar BCO Network", contact_name: "Tom Mitchell", contact_type: "agent", agent_code: "AGT-501", agent_status: "active", email: "tom@landstar.com", phone: "555-0203", city: "Jacksonville", state: "FL", is_active: true, org_id: orgId },
    ]);

    // Sample agency loads
    const { data: agencyLoads } = await supabase.from("agency_loads").insert([
      { origin: "Memphis, TN", destination: "Nashville, TN", broker_name: "Swift Logistics", broker_rate: 2800, carrier_name: "Prime Carriers", carrier_rate: 2400, margin: 400, status: "delivered", pickup_date: "2026-02-01", delivery_date: "2026-02-02", org_id: orgId },
      { origin: "Jacksonville, FL", destination: "Savannah, GA", broker_name: "Swift Logistics", broker_rate: 1600, carrier_name: "Prime Carriers", carrier_rate: 1350, margin: 250, status: "in_transit", pickup_date: "2026-02-10", org_id: orgId },
      { origin: "Houston, TX", destination: "San Antonio, TX", broker_name: "Swift Logistics", broker_rate: 1200, carrier_name: "Prime Carriers", carrier_rate: 1000, margin: 200, status: "pending", pickup_date: "2026-02-15", org_id: orgId },
    ]).select("id");

    // Sample agent commissions
    if (agencyLoads && agencyLoads.length > 0) {
      await supabase.from("agent_commissions").insert([
        { agent_name: "Tom Mitchell", load_id: agencyLoads[0].id, commission_rate: 10, commission_amount: 280, status: "paid", payout_date: "2026-02-05", org_id: orgId },
        { agent_name: "Tom Mitchell", load_id: agencyLoads[1].id, commission_rate: 10, commission_amount: 160, status: "pending", org_id: orgId },
      ]);
    }

    // 6. Sign in as demo user and return session
    const { data: session, error: sessionError } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });

    if (sessionError) throw new Error(`Demo sign-in failed: ${sessionError.message}`);

    return new Response(
      JSON.stringify({ session: session.session }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Demo login error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
