const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');

const PRICE_MAP = {
  pro_monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
  pro_yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
  team_monthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID,
  team_yearly: process.env.STRIPE_TEAM_YEARLY_PRICE_ID
};

// ─────────────────────────────────────────────
// GET /api/plans
// Returns all available plans with features + pricing
// Public route - no auth needed
// UPDATED: v1.0.3 - New pricing structure
// ─────────────────────────────────────────────
router.get('/', (req, res) => {
  return res.json({
    plans: [
      {
        id: 'free',
        name: 'Free',
        price_monthly: 0,
        price_yearly: 0,
        description: 'Try DailyNotion with no commitment',
        features: [
          'Manual journal generation (Generate Now button)',
          '1 pre-built template',
          'Pull from 1 database (Tasks)',
          '7-day journal history',
          'No scheduling',
          'No email notifications'
        ],
        cta: 'Get started free'
      },
      {
        id: 'pro',
        name: 'Pro',
        price_monthly: 5,
        price_yearly: 45,
        description: 'For individuals who want full automation',
        features: [
          'Scheduled daily generation (choose your time)',
          'Pull from up to 3 databases (Tasks, Notes, Habits)',
          'Custom template builder with placeholders',
          'Email notification when journal is ready',
          'Save up to 10 templates',
          'Full journal history',
          'Manual generate button'
        ],
        cta: 'Start Pro',
        popular: true
      },
      {
        id: 'team',
        name: 'Team',
        price_monthly: 15,
        price_yearly: 160,
        description: 'For teams of up to 5 people',
        price_per_extra_seat_monthly: 5,
        price_per_extra_seat_yearly: 50,
        features: [
          'Everything in Pro for all team members',
          'Shared templates across the team',
          'Admin dashboard',
          'Audit logs',
          'Priority support (24h response)',
          '5 seats included',
          'Extra seats at $5/seat/month'
        ],
        cta: 'Start Team'
      }
    ]
  });
});

// ─────────────────────────────────────────────
// POST /api/plans/select
// User selects a plan after signup
// Free: sets status to active immediately
// Paid: sets status to pending_payment
// ─────────────────────────────────────────────
router.post('/select', requireAuth, async (req, res) => {
  const { plan } = req.body;

  if (!['free', 'pro', 'team'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan. Must be free, pro, or team' });
  }

  try {
    if (plan === 'free') {
      // Free users go straight to active
      await supabase
        .from('users')
        .update({ status: 'active' })
        .eq('id', req.user.id);

      await supabase
        .from('subscriptions')
        .upsert({
          user_id: req.user.id,
          plan: 'free',
          status: 'active'
        }, { onConflict: 'user_id' });

      return res.json({
        message: 'Free plan activated',
        redirectTo: '/onboarding/connect-notion'
      });
    }

    // Paid plans — set to pending_payment
    await supabase
      .from('users')
      .update({ status: 'pending_payment' })
      .eq('id', req.user.id);

    return res.json({
      message: 'Plan selected, proceed to checkout',
      plan,
      redirectTo: '/checkout'
    });
  } catch (err) {
    console.error('Plan select error:', err);
    return res.status(500).json({ error: 'Failed to select plan' });
  }
});

// ─────────────────────────────────────────────
// POST /api/billing/checkout
// Creates a Stripe checkout session for paid plans
// ─────────────────────────────────────────────
router.post('/checkout', requireAuth, async (req, res) => {
  const { plan, interval = 'monthly', seats = 1 } = req.body;

  if (!['pro', 'team'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan for checkout' });
  }

  const priceKey = `${plan}_${interval}`;
  const priceId = PRICE_MAP[priceKey];

  if (!priceId) {
    return res.status(400).json({ error: `No price found for ${priceKey}` });
  }

  try {
    // Get or create Stripe customer
    let stripeCustomerId;
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', req.user.id)
      .single();

    if (existingSub?.stripe_customer_id) {
      stripeCustomerId = existingSub.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.full_name,
        metadata: { user_id: req.user.id }
      });
      stripeCustomerId = customer.id;
    }

    const lineItems = [{ price: priceId, quantity: plan === 'team' ? seats : 1 }];

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/#/onboarding/connect-notion?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/#/select-plan`,
      metadata: {
        user_id: req.user.id,
        plan,
        interval,
        seats: String(seats)
      },
      subscription_data: {
        metadata: { user_id: req.user.id, plan }
      }
    });

    return res.json({ checkoutUrl: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

module.exports = router;

// ─────────────────────────────────────────────
// GET /api/billing/subscription
// Returns current user's subscription details
// ─────────────────────────────────────────────
router.get('/subscription', requireAuth, async (req, res) => {
  try {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    return res.json({ subscription: subscription || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// ─────────────────────────────────────────────
// POST /api/billing/portal
// Creates a Stripe customer portal session for managing billing
// ─────────────────────────────────────────────
router.post('/portal', requireAuth, async (req, res) => {
  try {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', req.user.id)
      .single();

    if (!subscription?.stripe_customer_id) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${process.env.FRONTEND_URL}/#/dashboard/billing`
    });

    return res.json({ portalUrl: session.url });
  } catch (err) {
    console.error('Portal error:', err);
    return res.status(500).json({ error: 'Failed to open billing portal' });
  }
});

module.exports = router;
