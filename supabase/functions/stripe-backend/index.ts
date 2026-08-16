import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from 'https://esm.sh/stripe@11.16.0?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.11.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // Webhook from Stripe
    if (action === 'webhook') {
      const signature = req.headers.get('stripe-signature')
      const body = await req.text()
      const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
      
      let event;
      try {
        event = stripe.webhooks.constructEvent(body, signature!, endpointSecret!)
      } catch (err) {
        console.log(`Webhook signature verification failed.`, err.message)
        return new Response(err.message, { status: 400 })
      }

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object
        const userId = session.client_reference_id
        
        if (userId) {
          // Upgrade user to pro
          await supabase
            .from('profiles')
            .update({ plan_type: 'pro', stripe_customer_id: session.customer })
            .eq('id', userId)
        }
      } else if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object
        // Downgrade user back to free
        await supabase
          .from('profiles')
          .update({ plan_type: 'free' })
          .eq('stripe_customer_id', subscription.customer)
      }

      return new Response(JSON.stringify({ received: true }), { headers: corsHeaders })
    }

    // Require Auth for other endpoints
    const authHeader = req.headers.get('Authorization')!
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error('Not logged in')

    // Create Checkout
    if (action === 'checkout') {
      const { priceId } = await req.json()
      const origin = req.headers.get('origin')
      
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        client_reference_id: user.id,
        success_url: `${origin}/app.html?success=true`,
        cancel_url: `${origin}/app.html?canceled=true`,
      })
      
      return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Create Portal
    if (action === 'portal') {
      // Get customer ID from profiles
      const { data: profile } = await supabaseClient.from('profiles').select('stripe_customer_id').eq('id', user.id).single()
      
      if (!profile?.stripe_customer_id) throw new Error('Not a customer yet')

      const origin = req.headers.get('origin')
      const session = await stripe.billingPortal.sessions.create({
        customer: profile.stripe_customer_id,
        return_url: `${origin}/app.html`,
      })
      
      return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response('Not found', { status: 404, headers: corsHeaders })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
