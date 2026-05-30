const { verifyAccessToken } = require('../utils/jwt');
const supabase = require('../db/supabase');

// ─────────────────────────────────────────────
// requireAuth
// Validates JWT on every protected route
// Never leaks token details in error messages
// ─────────────────────────────────────────────
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.', code: 'NO_TOKEN' });
    }

    const token = authHeader.split(' ')[1];
    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ error: 'Authentication required.', code: 'NO_TOKEN' });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (jwtErr) {
      if (jwtErr.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Session expired. Please log in again.', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Invalid session. Please log in again.', code: 'INVALID_TOKEN' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name, status, auth_provider, avatar_url')
      .eq('id', decoded.sub)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Account not found.', code: 'USER_NOT_FOUND' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        error: 'Your account has been suspended. Please contact support.',
        code: 'ACCOUNT_SUSPENDED',
        redirectTo: '/dashboard/billing'
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] requireAuth error:`, err.message);
    return res.status(500).json({ error: 'Authentication check failed. Please try again.' });
  }
};

// ─────────────────────────────────────────────
// guardStatus
// Checks user flow completion and redirects to
// the correct incomplete step if they skipped ahead
// ─────────────────────────────────────────────
const guardStatus = async (req, res, next) => {
  const { status } = req.user;

  if (status === 'signed_up') {
    return res.status(403).json({
      error: 'Please select a plan to continue.',
      code: 'INCOMPLETE_FLOW',
      redirectTo: '/select-plan'
    });
  }

  if (status === 'pending_payment') {
    return res.status(403).json({
      error: 'Please complete your payment to continue.',
      code: 'INCOMPLETE_FLOW',
      redirectTo: '/checkout'
    });
  }

  if (status === 'active') {
    const { data: onboarding } = await supabase
      .from('onboarding_state')
      .select('notion_connected, journal_db_selected, tasks_db_selected, template_chosen, schedule_set, completed_at')
      .eq('user_id', req.user.id)
      .single();

    if (onboarding && !onboarding.completed_at) {
      if (!onboarding.notion_connected) {
        return res.status(403).json({
          error: 'Please connect your Notion workspace to continue.',
          code: 'INCOMPLETE_ONBOARDING',
          redirectTo: '/onboarding/connect-notion'
        });
      }
      if (!onboarding.journal_db_selected || !onboarding.tasks_db_selected) {
        return res.status(403).json({
          error: 'Please select your Notion databases to continue.',
          code: 'INCOMPLETE_ONBOARDING',
          redirectTo: '/onboarding/select-databases'
        });
      }
      if (!onboarding.template_chosen) {
        return res.status(403).json({
          error: 'Please choose a journal template to continue.',
          code: 'INCOMPLETE_ONBOARDING',
          redirectTo: '/onboarding/choose-template'
        });
      }
      if (!onboarding.schedule_set) {
        return res.status(403).json({
          error: 'Please set your journal schedule to continue.',
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
// Restricts a route to specific plans
// Usage: requirePlan(['pro', 'team'])
// ─────────────────────────────────────────────
const requirePlan = (allowedPlans) => async (req, res, next) => {
  try {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', req.user.id)
      .single();

    if (!subscription || !allowedPlans.includes(subscription.plan)) {
      return res.status(403).json({
        error: `This feature requires a ${allowedPlans.join(' or ')} plan. Upgrade to unlock it.`,
        code: 'PLAN_REQUIRED',
        requiredPlans: allowedPlans
      });
    }

    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return res.status(403).json({
        error: 'Your subscription is not active. Please update your billing.',
        code: 'SUBSCRIPTION_INACTIVE',
        redirectTo: '/dashboard/billing'
      });
    }

    req.subscription = subscription;
    next();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] requirePlan error:`, err.message);
    return res.status(500).json({ error: 'Failed to verify plan. Please try again.' });
  }
};

module.exports = { requireAuth, guardStatus, requirePlan };
