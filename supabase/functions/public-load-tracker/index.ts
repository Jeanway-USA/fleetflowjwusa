import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const trackingId = url.searchParams.get("tracking_id");

    if (!trackingId) {
      return new Response(
        JSON.stringify({ error: "tracking_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch load by tracking_id — only safe fields
    const { data: load, error: loadError } = await supabase
      .from("fleet_loads")
      .select("id, origin, destination, status, pickup_date, delivery_date, driver_id, org_id, booked_miles, landstar_load_id")
      .eq("tracking_id", trackingId)
      .maybeSingle();

    if (loadError) {
      console.error("Load query error:", loadError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch tracking data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!load) {
      return new Response(
        JSON.stringify({ error: "Tracking not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch org branding
    let org = null;
    if (load.org_id) {
      const { data } = await supabase
        .from("organizations")
        .select("name, logo_url, primary_color")
        .eq("id", load.org_id)
        .maybeSingle();
      org = data;
    }

    // Fetch driver location if sharing
    let location = null;
    if (load.driver_id) {
      const { data } = await supabase
        .from("driver_locations")
        .select("latitude, longitude, updated_at, is_sharing")
        .eq("driver_id", load.driver_id)
        .eq("is_sharing", true)
        .maybeSingle();
      if (data) {
        location = {
          latitude: data.latitude,
          longitude: data.longitude,
          updated_at: data.updated_at,
        };
      }
    }

    // Condense addresses to city, state only
    const condense = (addr: string) => {
      const parts = addr.split(",").map((p: string) => p.trim()).filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i--) {
        const match = parts[i].match(/\b([A-Z]{2})\b/);
        if (match) {
          const state = match[1];
          const city = i > 0 ? parts[i - 1] : "";
          return city ? `${city}, ${state}` : state;
        }
      }
      return parts[0] || addr;
    };

    return new Response(
      JSON.stringify({
        origin: condense(load.origin),
        origin_full: load.origin,
        destination: condense(load.destination),
        destination_full: load.destination,
        status: load.status,
        pickup_date: load.pickup_date,
        delivery_date: load.delivery_date,
        booked_miles: load.booked_miles,
        load_number: load.landstar_load_id,
        org: org
          ? {
              name: org.name,
              logo_url: org.logo_url,
              primary_color: org.primary_color,
            }
          : null,
        location,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
