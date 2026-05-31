const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const supabase = require('../db/supabase');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  storeRefreshToken,
  revokeRefreshToken,
  isRefreshTokenValid
} = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');

// ─────────────────────────────────────────────
// POST /api/auth/signup
// Creates user, onboarding_state row, sets status = signed_up
// ─────────────────────────────────────────────
router.post(
  '/signup',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('full_name').trim().notEmpty().withMessage('Full name is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, full_name } = req.body;

    try {
      // Check if email already exists
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .single();

      if (existing) {
        return res.status(409).json({ error: 'Email already in use' });
      }

      const password_hash = await bcrypt.hash(password, 12);

      // Create user
      const { data: user, error: userError } = await supabase
        .from('users')
        .insert({ email, password_hash, full_name, status: 'signed_up' })
        .select('id, email, full_name, status')
        .single();

      if (userError) throw userError;

      // Create onboarding state row
      await supabase
        .from('onboarding_state')
        .insert({ user_id: user.id });

      // Issue tokens
      const accessToken = signAccessToken(user.id);
      const refreshToken = signRefreshToken(user.id);
      await storeRefreshToken(user.id, refreshToken);

      return res.status(201).json({
        user,
        accessToken,
        refreshToken,
        nextStep: '/select-plan'
      });
    } catch (err) {
      console.error('Signup error:', err);
      return res.status(500).json({ error: 'Failed to create account' });
    }
  }
);

// ─────────────────────────────────────────────
// POST /api/auth/login
// Returns tokens + tells frontend exactly where to send the user
// ─────────────────────────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, full_name, status, password_hash')
        .eq('email', email)
        .single();

      if (error || !user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Determine where to send the user
      let redirectTo = '/dashboard';
      if (user.status === 'signed_up') redirectTo = '/select-plan';
      if (user.status === 'pending_payment') redirectTo = '/checkout';
      if (user.status === 'suspended') redirectTo = '/billing';

      // For active users, check onboarding completion
      if (user.status === 'active') {
        const { data: onboarding } = await supabase
          .from('onboarding_state')
          .select('notion_connected, journal_db_selected, tasks_db_selected, template_chosen, schedule_set, completed_at')
          .eq('user_id', user.id)
          .single();

        if (onboarding && !onboarding.completed_at) {
          if (!onboarding.notion_connected) redirectTo = '/onboarding/connect-notion';
          else if (!onboarding.journal_db_selected || !onboarding.tasks_db_selected) redirectTo = '/onboarding/select-databases';
          else if (!onboarding.template_chosen) redirectTo = '/onboarding/choose-template';
          else if (!onboarding.schedule_set) redirectTo = '/onboarding/set-schedule';
        }
      }

      const accessToken = signAccessToken(user.id);
      const refreshToken = signRefreshToken(user.id);
      await storeRefreshToken(user.id, refreshToken);

      const { password_hash, ...safeUser } = user;

      return res.json({
        user: safeUser,
        accessToken,
        refreshToken,
        redirectTo
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Login failed' });
    }
  }
);

// ─────────────────────────────────────────────
// POST /api/auth/refresh
// Exchange refresh token for new access token
// ─────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const valid = await isRefreshTokenValid(refreshToken);

    if (!valid) {
      return res.status(401).json({ error: 'Refresh token is invalid or expired' });
    }

    // Rotate: revoke old, issue new
    await revokeRefreshToken(refreshToken);
    const newAccessToken = signAccessToken(decoded.sub);
    const newRefreshToken = signRefreshToken(decoded.sub);
    await storeRefreshToken(decoded.sub, newRefreshToken);

    return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ─────────────────────────────────────────────
// POST /api/auth/logout
// Revokes the refresh token
// ─────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    await revokeRefreshToken(refreshToken).catch(() => {});
  }
  return res.json({ message: 'Logged out successfully' });
});

// ─────────────────────────────────────────────
// GET /api/auth/me
// Returns current user + subscription + onboarding state
// ─────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end, seats')
      .eq('user_id', req.user.id)
      .single();

    const { data: onboarding } = await supabase
      .from('onboarding_state')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    return res.json({
      user: req.user,
      subscription: subscription || null,
      onboarding: onboarding || null
    });
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

// ─────────────────────────────────────────────
// PUT /api/auth/me
// Updates the user's profile (full_name only for now)
// ─────────────────────────────────────────────
router.put('/me', requireAuth, async (req, res) => {
  const { full_name } = req.body;

  if (!full_name?.trim()) {
    return res.status(400).json({ error: 'Full name is required' });
  }

  try {
    const { data: user, error } = await supabase
      .from('users')
      .update({ full_name: full_name.trim() })
      .eq('id', req.user.id)
      .select('id, email, full_name, status, avatar_url, auth_provider')
      .single();

    if (error) throw error;

    return res.json({ user });
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ─────────────────────────────────────────────
// POST /api/auth/change-password
// Only works for email or 'both' auth_provider users
// Google-only users cannot set a password
// ─────────────────────────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  try {
    const { data: user } = await supabase
      .from('users')
      .select('password_hash, auth_provider')
      .eq('id', req.user.id)
      .single();

    if (user.auth_provider === 'google') {
      return res.status(400).json({
        error: 'Google accounts cannot set a password. Use Google to sign in.'
      });
    }

    if (!user.password_hash) {
      return res.status(400).json({ error: 'No password set on this account' });
    }

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await supabase
      .from('users')
      .update({ password_hash: newHash })
      .eq('id', req.user.id);

    return res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Failed to change password' });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/auth/account
// Permanently deletes the account + cancels Stripe sub
// Requires typing "DELETE" as confirmation
// ON DELETE CASCADE in the DB handles all related rows
// ─────────────────────────────────────────────
router.delete('/account', requireAuth, async (req, res) => {
  const { confirmation } = req.body;

  if (confirmation !== 'DELETE') {
    return res.status(400).json({ error: 'Type DELETE to confirm account deletion' });
  }

  try {
    // Cancel Stripe subscription first if one exists
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', req.user.id)
      .single();

    if (sub?.stripe_subscription_id) {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        await stripe.subscriptions.cancel(sub.stripe_subscription_id);
      } catch (stripeErr) {
        // Log but don't block deletion — user still gets deleted
        console.error('Stripe cancellation error during account deletion:', stripeErr.message);
      }
    }

    // Delete the user row — all related rows cascade automatically
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', req.user.id);

    if (error) throw error;

    return res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Account deletion error:', err);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;

