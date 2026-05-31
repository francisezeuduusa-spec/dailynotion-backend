// Stripe Webhook Handler
// Mounted with raw body parsing in index.js
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// POST /api/billing/webhook
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { user_id, plan, interval, seats } = session.metadata;

        await supabase
          .from('users')
          .update({ status: 'active' })
          .eq('id', user_id);

        await supabase
          .from('subscriptions')
          .upsert({
            user_id,
            plan,
            billing_interval: interval,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            stripe_price_id: session.metadata.price_id,
            status: 'active',
            seats: parseInt(seats) || 1
          }, { onConflict: 'user_id' });

        console.log(`✅ Payment complete for user ${user_id} — plan: ${plan}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', invoice.subscription)
          .single();

        if (sub) {
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', invoice.subscription);
          console.log(`⚠️ Payment failed for subscription ${invoice.subscription}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await supabase
          .from('subscriptions')
          .update({ status: 'canceled' })
          .eq('stripe_subscription_id', subscription.id);

        const { data: sub } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (sub) {
          await supabase
            .from('users')
            .update({ status: 'canceled' })
            .eq('id', sub.user_id);
        }

        console.log(`❌ Subscription canceled: ${subscription.id}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Webhook handler error:', err);
  }

  res.json({ received: true });
});

module.exports = router;
