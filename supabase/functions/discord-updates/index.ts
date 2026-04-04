import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const TYPE_COLORS: Record<string, number> = {
  Update: 0x22c55e,
  Announcement: 0x3b82f6,
  "Bug Fix": 0xf97316,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;

    // Check super admin
    const { data: isSA } = await supabaseAdmin.rpc("is_super_admin");
    // Use service role to check directly
    const { data: saRow } = await supabaseAdmin
      .from("super_admins")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!saRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { title, description, type } = await req.json();

    if (!title || !description || !type) {
      return new Response(
        JSON.stringify({ error: "title, description, and type are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const validTypes = ["Update", "Announcement", "Bug Fix"];
    if (!validTypes.includes(type)) {
      return new Response(
        JSON.stringify({ error: "type must be Update, Announcement, or Bug Fix" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Save to changelog table
    const { error: insertError } = await supabaseAdmin
      .from("changelog")
      .insert({ title, description, type, created_by: userId });

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save changelog" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send Discord webhook
    const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
    if (webhookUrl) {
      const embed = {
        title: `[${type}] ${title}`,
        description,
        color: TYPE_COLORS[type] || 0x6b7280,
        timestamp: new Date().toISOString(),
        footer: { text: "FleetFlow TMS" },
      };

      const discordPayload: Record<string, unknown> = {
        embeds: [embed],
        thread_name: `[${type}] ${title}`,
      };

      const discordRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload),
      });

      if (!discordRes.ok) {
        const errText = await discordRes.text();
        console.error("Discord webhook error:", discordRes.status, errText);
      } else {
        await discordRes.text();
      }
    } else {
      console.warn("DISCORD_WEBHOOK_URL not set, skipping Discord notification");
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unhandled error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
