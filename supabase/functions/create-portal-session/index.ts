import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

// Allowed origins for CORS - restrict to known domains
const ALLOWED_ORIGINS = [
  'https://tms.jeanwayusa.com',
  'https://fleetflowjwusa.lovable.app',
  'https://id-preview--a815e5bc-e7f9-4eda-be65-87a78fb56f21.lovable.app',
  'http://localhost:5173',
  'http://localhost:8080',
];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(allowed =>
    origin === allowed ||
    origin.endsWith('.lovable.app') ||
    origin.endsWith('.lovableproject.com')
  );
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };
}

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-PORTAL] ${step}${detailsStr}`);
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) throw new Error("Invalid token");

    const userId = claimsData.claims.sub as string;
    logStep("User authenticated", { userId });

    // Verify user has 'owner' role before allowing billing portal access
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "owner")
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Only owners can manage subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }
    logStep("Owner role verified");

    // Get user's org_id from profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("org_id")
      .eq("user_id", userId)
      .single();

    if (profileError || !profile?.org_id) {
      throw new Error("User profile or organization not found");
    }

    const orgId = profile.org_id;

    // Get stripe_customer_id from organization
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", orgId)
      .single();

    if (orgError || !org?.stripe_customer_id) {
      throw new Error("No Stripe customer found for this organization");
    }

    logStep("Found Stripe customer", { customerId: org.stripe_customer_id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const ALLOWED_ORIGINS = [
      "https://fleetflowjwusa.lovable.app",
      "https://tms.jeanwayusa.com",
      "http://localhost:5173",
    ];
    const rawOrigin = req.headers.get("origin") || "";
    const origin = ALLOWED_ORIGINS.includes(rawOrigin)
      ? rawOrigin
      : "https://fleetflowjwusa.lovable.app";

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${origin}/settings?tab=billing`,
    });

    logStep("Portal session created", { url: portalSession.url });

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
