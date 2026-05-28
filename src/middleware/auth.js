const { verifyAccessToken } = require('../utils/jwt');
const supabase = require('../db/supabase');

// ─────────────────────────────────────────────
// requireAuth
// Validates JWT access token on every protected route
// ─────────────────────────────────────────────
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, status')
      .eq('id', decoded.sub)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ─────────────────────────────────────────────
// guardStatus
// Checks user status and returns the step they
// should be on if they haven't completed the flow.
// Frontend uses the redirectTo field to navigate.
// ─────────────────────────────────────────────
const guardStatus = async (req, res, next) => {
  const { status } = req.user;

  if (status === 'signed_up') {
    return res.status(403).json({
      error: 'Plan not selected',
      code: 'INCOMPLETE_FLOW',
      redirectTo: '/select-plan'
    });
  }

  if (status === 'pending_payment') {
    return res.status(403).json({
      error: 'Payment not completed',
      code: 'INCOMPLETE_FLOW',
      redirectTo: '/checkout'
    });
  }

  if (status === 'suspended') {
    return res.status(403).json({
      error: 'Account suspended',
      code: 'ACCOUNT_SUSPENDED',
      redirectTo: '/billing'
    });
  }

  // Check onboarding completion for active users
  if (status === 'active') {
    const { data: onboarding } = await supabase
      .from('onboarding_state')
      .select('notion_connected, journal_db_selected, tasks_db_selected, template_chosen, schedule_set, completed_at')
      .eq('user_id', req.user.id)
      .single();

    if (onboarding && !onboarding.completed_at) {
      // Find first incomplete step and redirect there
      if (!onboarding.notion_connected) {
        return res.status(403).json({
          error: 'Onboarding incomplete',
          code: 'INCOMPLETE_ONBOARDING',
          redirectTo: '/onboarding/connect-notion'
        });
      }
      if (!onboarding.journal_db_selected || !onboarding.tasks_db_selected) {
        return res.status(403).json({
          error: 'Onboarding incomplete',
          code: 'INCOMPLETE_ONBOARDING',
          redirectTo: '/onboarding/select-databases'
        });
      }
      if (!onboarding.template_chosen) {
        return res.status(403).json({
          error: 'Onboarding incomplete',
          code: 'INCOMPLETE_ONBOARDING',
          redirectTo: '/onboarding/choose-template'
        });
      }
      if (!onboarding.schedule_set) {
        return res.status(403).json({
          error: 'Onboarding incomplete',
          code: 'INCOMPLETE_ONBOARDING',
          redirectTo: '/onboarding/set-schedule'
        });
      }
    }
  }

  next();
};

// ─────────────────────────────────────────────
// requirePlan
// Restrict routes to specific plans
// Usage: requirePlan(['pro', 'team'])
// ─────────────────────────────────────────────
const requirePlan = (allowedPlans) => async (req, res, next) => {
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', req.user.id)
    .single();

  if (!subscription || !allowedPlans.includes(subscription.plan)) {
    return res.status(403).json({
      error: `This feature requires a ${allowedPlans.join(' or ')} plan`,
      code: 'PLAN_REQUIRED',
      requiredPlans: allowedPlans
    });
  }

  if (subscription.status !== 'active' && subscription.status !== 'trialing') {
    return res.status(403).json({
      error: 'Subscription is not active',
      code: 'SUBSCRIPTION_INACTIVE',
      redirectTo: '/billing'
    });
  }

  req.subscription = subscription;
  next();
};

module.exports = { requireAuth, guardStatus, requirePlan };
