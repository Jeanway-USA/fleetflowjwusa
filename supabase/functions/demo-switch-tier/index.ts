import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_EMAIL = "demo@fleetflow-tms.com";

const TIER_ROUTES: Record<string, string> = {
  solo_bco: "/fleet-loads",
  fleet_owner: "/executive-dashboard",
  agency: "/agency-loads",
  all_in_one: "/executive-dashboard",
};

const VALID_TIERS = Object.keys(TIER_ROUTES);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate caller JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the caller is the demo user
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user || user.email !== DEMO_EMAIL) {
      return new Response(JSON.stringify({ error: "Only demo account can switch tiers" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const { tier } = await req.json();
    if (!tier || !VALID_TIERS.includes(tier)) {
      return new Response(JSON.stringify({ error: `Invalid tier. Must be one of: ${VALID_TIERS.join(", ")}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin client bypasses RLS
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Ensure profile has org_id
    const { data: profile } = await adminClient
      .from("profiles")
      .select("org_id")
      .eq("user_id", user.id)
      .single();

    let orgId = profile?.org_id;

    if (!orgId) {
      // Re-create org linkage
      const { data: orgData, error: orgError } = await adminClient
        .from("organizations")
        .insert({ name: "Demo Trucking Co.", subscription_tier: tier })
        .select("id")
        .single();
      if (orgError) throw new Error(`Org creation failed: ${orgError.message}`);
      orgId = orgData.id;

      await adminClient
        .from("profiles")
        .update({ org_id: orgId })
        .eq("user_id", user.id);
    }

    // Ensure user_roles has owner for this org
    await adminClient.from("user_roles").upsert(
      { user_id: user.id, role: "owner", org_id: orgId },
      { onConflict: "user_id,role" }
    );

    // Update the tier
    const { error: updateError } = await adminClient
      .from("organizations")
      .update({ subscription_tier: tier })
      .eq("id", orgId);

    if (updateError) throw new Error(`Tier update failed: ${updateError.message}`);

    return new Response(
      JSON.stringify({ tier, landingPath: TIER_ROUTES[tier] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("demo-switch-tier error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to switch tier" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
