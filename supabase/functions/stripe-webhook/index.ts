import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new Error("No stripe-signature header");

    const body = await req.text();
    
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logStep("Signature verification failed", { message });
      return new Response(JSON.stringify({ error: `Webhook signature verification failed: ${message}` }), {
        status: 400,
      });
    }

    logStep("Event verified", { type: event.type, id: event.id });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep("checkout.session.completed", { sessionId: session.id });

        const orgId = session.client_reference_id;
        const stripeCustomerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!orgId) {
          logStep("No org_id in client_reference_id, skipping");
          break;
        }

        // Fetch subscription details to get tier from metadata
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const tier = subscription.metadata?.tier || null;
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        const updateData: Record<string, unknown> = {
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: subscriptionId,
          subscription_status: subscription.status,
          subscription_period_end: periodEnd,
          is_active: true,
          updated_at: new Date().toISOString(),
        };

        // Update subscription_tier if present in metadata
        if (tier) {
          updateData.subscription_tier = tier;
        }

        const { error } = await supabase
          .from("organizations")
          .update(updateData)
          .eq("id", orgId);

        if (error) {
          logStep("Error updating organization", { error: error.message });
        } else {
          logStep("Organization updated", { orgId, status: subscription.status, tier });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("customer.subscription.updated", { subscriptionId: subscription.id });

        const stripeCustomerId = subscription.customer as string;
        const tier = subscription.metadata?.tier || null;
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        // Find org by stripe_customer_id
        const { data: org, error: findError } = await supabase
          .from("organizations")
          .select("id")
          .eq("stripe_customer_id", stripeCustomerId)
          .single();

        if (findError || !org) {
          logStep("Organization not found for customer", { stripeCustomerId });
          break;
        }

        const updateData: Record<string, unknown> = {
          stripe_subscription_id: subscription.id,
          subscription_status: subscription.status,
          subscription_period_end: periodEnd,
          is_active: ["active", "trialing"].includes(subscription.status),
          updated_at: new Date().toISOString(),
        };

        if (tier) {
          updateData.subscription_tier = tier;
        }

        const { error } = await supabase
          .from("organizations")
          .update(updateData)
          .eq("id", org.id);

        if (error) {
          logStep("Error updating organization", { error: error.message });
        } else {
          logStep("Subscription updated", { orgId: org.id, status: subscription.status });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("customer.subscription.deleted", { subscriptionId: subscription.id });

        const stripeCustomerId = subscription.customer as string;

        const { data: org, error: findError } = await supabase
          .from("organizations")
          .select("id")
          .eq("stripe_customer_id", stripeCustomerId)
          .single();

        if (findError || !org) {
          logStep("Organization not found for customer", { stripeCustomerId });
          break;
        }

        const { error } = await supabase
          .from("organizations")
          .update({
            subscription_status: "canceled",
            is_active: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", org.id);

        if (error) {
          logStep("Error updating organization", { error: error.message });
        } else {
          logStep("Subscription canceled", { orgId: org.id });
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
