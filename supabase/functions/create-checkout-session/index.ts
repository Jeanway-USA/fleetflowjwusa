import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
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

    // Auth client for user verification
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    // Service client for DB operations
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
    const userEmail = claimsData.claims.email as string;
    logStep("User authenticated", { userId, email: userEmail });

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
    logStep("Found org_id", { orgId });

    // Parse request body
    const { tier, isAnnual, promoCode } = await req.json();
    if (!tier) throw new Error("Missing tier parameter");
    logStep("Request params", { tier, isAnnual, promoCode });

    // Fetch price from subscription_plans table
    const { data: plan, error: planError } = await supabaseAdmin
      .from("subscription_plans")
      .select("tier, base_price_monthly, base_price_annual, name")
      .eq("tier", tier)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      throw new Error(`Subscription plan not found for tier: ${tier}`);
    }

    let unitAmount = isAnnual
      ? Math.round(Number(plan.base_price_annual) * 100)
      : Math.round(Number(plan.base_price_monthly) * 100);

    logStep("Base price from DB", { unitAmount, tier: plan.tier });

    // Apply promo code discount if provided
    if (promoCode) {
      const { data: promo } = await supabaseAdmin
        .from("promo_codes")
        .select("discount_percentage, discount_amount, valid_from, valid_until, max_redemptions, times_redeemed")
        .eq("code", promoCode.toUpperCase())
        .eq("is_active", true)
        .single();

      if (promo) {
        const now = new Date();
        const validFrom = promo.valid_from ? new Date(promo.valid_from) : null;
        const validUntil = promo.valid_until ? new Date(promo.valid_until) : null;
        const withinDates = (!validFrom || now >= validFrom) && (!validUntil || now <= validUntil);
        const withinLimit = !promo.max_redemptions || promo.times_redeemed < promo.max_redemptions;

        if (withinDates && withinLimit) {
          if (promo.discount_percentage) {
            unitAmount = Math.round(unitAmount * (1 - promo.discount_percentage / 100));
            logStep("Applied percentage discount", { discount: promo.discount_percentage });
          } else if (promo.discount_amount) {
            unitAmount = Math.max(0, unitAmount - Math.round(Number(promo.discount_amount) * 100));
            logStep("Applied fixed discount", { discount: promo.discount_amount });
          }
        }
      }
    }

    // Get or create Stripe customer
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if org already has a stripe_customer_id
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("stripe_customer_id, name")
      .eq("id", orgId)
      .single();

    let customerId = org?.stripe_customer_id;

    if (!customerId) {
      // Check if customer exists in Stripe by email
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        // Create new customer
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: { org_id: orgId, org_name: org?.name || "" },
        });
        customerId = customer.id;
      }

      // Save stripe_customer_id to org
      await supabaseAdmin
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", orgId);

      logStep("Created/linked Stripe customer", { customerId });
    }

    // Create checkout session with dynamic price_data
    const origin = req.headers.get("origin") || "https://fleetflowjwusa.lovable.app";
    
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: orgId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${plan.name || tier} - ${isAnnual ? "Annual" : "Monthly"}`,
              metadata: { tier },
            },
            unit_amount: unitAmount,
            recurring: {
              interval: isAnnual ? "year" : "month",
            },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { org_id: orgId, tier },
      },
      success_url: `${origin}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
