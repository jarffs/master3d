import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.4.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

// We need the service role key to bypass RLS and add credits
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("No signature", { status: 400 });
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  try {
    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret
    );

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      
      const userId = session.client_reference_id;
      const creditsString = session.metadata?.credits;

      if (!userId || !creditsString) {
        console.error("Missing userId or credits in session metadata.");
        return new Response("Missing data", { status: 400 });
      }

      const credits = parseInt(creditsString, 10);
      if (isNaN(credits) || credits <= 0) {
        console.error("Invalid credits amount:", creditsString);
        return new Response("Invalid credits", { status: 400 });
      }

      // Call the RPC to securely add credits
      const { error } = await supabase.rpc("add_credits", {
        target_user_id: userId,
        amount: credits
      });

      if (error) {
        console.error("Supabase RPC error:", error);
        throw error;
      }

      console.log(`Successfully added ${credits} credits to user ${userId}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }
});
