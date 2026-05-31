const express = require('express');
const router = express.Router();
const axios = require('axios');
const supabase = require('../db/supabase');
const {
  signAccessToken,
  signRefreshToken,
  storeRefreshToken
} = require('../utils/jwt');

// ─────────────────────────────────────────────
// GET /api/auth/google
// Redirects user to Google's OAuth consent screen
// ─────────────────────────────────────────────
router.get('/google', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account'
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// ─────────────────────────────────────────────
// GET /api/auth/google/callback
// Google redirects here after user approves
// Handles both signup and login in one flow
// ─────────────────────────────────────────────
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(
      `${process.env.FRONTEND_URL}/login?error=google_denied`
    );
  }

  try {
    // Step 1: Exchange code for tokens
    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      {
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
      }
    );

    const { access_token: googleAccessToken, id_token } = tokenResponse.data;

    // Step 2: Get user info from Google
    const userInfoResponse = await axios.get(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { headers: { Authorization: `Bearer ${googleAccessToken}` } }
    );

    const {
      sub: googleId,
      email,
      name: full_name,
      picture: avatar_url
    } = userInfoResponse.data;

    // Step 3: Check if user already exists (by google_id or email)
    let user = null;
    let isNewUser = false;

    const { data: existingByGoogle } = await supabase
      .from('users')
      .select('id, email, full_name, status, auth_provider')
      .eq('google_id', googleId)
      .single();

    if (existingByGoogle) {
      user = existingByGoogle;
    } else {
      // Check by email — user may have signed up with email before
      const { data: existingByEmail } = await supabase
        .from('users')
        .select('id, email, full_name, status, auth_provider')
        .eq('email', email)
        .single();

      if (existingByEmail) {
        // Link Google to their existing email account
        const { data: updated } = await supabase
          .from('users')
          .update({
            google_id: googleId,
            avatar_url,
            auth_provider: 'both'
          })
          .eq('id', existingByEmail.id)
          .select('id, email, full_name, status, auth_provider')
          .single();

        user = updated;
      } else {
        // Brand new user — create account
        const { data: created, error: createError } = await supabase
          .from('users')
          .insert({
            email,
            full_name,
            google_id: googleId,
            avatar_url,
            auth_provider: 'google',
            status: 'signed_up'
            // password_hash is NULL — that's fine for Google users
          })
          .select('id, email, full_name, status, auth_provider')
          .single();

        if (createError) throw createError;

        // Create onboarding state row for new user
        await supabase
          .from('onboarding_state')
          .insert({ user_id: created.id });

        user = created;
        isNewUser = true;
      }
    }

    // Step 4: Determine where to redirect
    let redirectTo = '/dashboard';
    if (user.status === 'signed_up') redirectTo = '/select-plan';
    if (user.status === 'pending_payment') redirectTo = '/checkout';
    if (user.status === 'suspended') redirectTo = '/billing';

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

    // Step 5: Issue JWT tokens
    const accessToken = signAccessToken(user.id);
    const refreshToken = signRefreshToken(user.id);
    await storeRefreshToken(user.id, refreshToken);

    // Step 6: Redirect to frontend with tokens in URL params
    // Frontend reads these, stores them, then navigates to redirectTo
    const params = new URLSearchParams({
      accessToken,
      refreshToken,
      redirectTo
    });

    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/google/success?${params.toString()}`
    );
  } catch (err) {
    console.error('Google OAuth error:', err.response?.data || err.message);
    return res.redirect(
      `${process.env.FRONTEND_URL}/login?error=google_failed`
    );
  }
});

module.exports = router;
