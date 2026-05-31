const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Client } = require('@notionhq/client');
const supabase = require('../db/supabase');
const { requireAuth, guardStatus } = require('../middleware/auth');

// ─────────────────────────────────────────────
// GET /api/notion/auth-url
// Returns the Notion OAuth URL for the frontend to redirect to
// ─────────────────────────────────────────────
router.get('/auth-url', requireAuth, (req, res) => {
  const clientId = process.env.NOTION_CLIENT_ID;
  const redirectUri = process.env.NOTION_REDIRECT_URI;
  
  if (!clientId || !redirectUri) {
    console.error('Missing Notion config:', { clientId: !!clientId, redirectUri: !!redirectUri });
    return res.status(500).json({ error: 'Notion OAuth not configured. Please contact support.' });
  }
  
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    owner: 'user',
    redirect_uri: redirectUri,
    state: req.user.id
  });

  const authUrl = `https://api.notion.com/v1/oauth/authorize?${params.toString()}`;
  return res.json({ authUrl });
});

// ─────────────────────────────────────────────
// GET /api/notion/callback
// Handles Notion OAuth callback, stores access token
// ─────────────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, state: userId, error } = req.query;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}/#/onboarding/connect-notion?error=notion_denied`);
  }

  if (!code || !userId) {
    return res.redirect(`${process.env.FRONTEND_URL}/#/onboarding/connect-notion?error=missing_params`);
  }

  try {
    // Exchange code for access token
    const credentials = Buffer.from(
      `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
    ).toString('base64');

    const tokenResponse = await axios.post(
      'https://api.notion.com/v1/oauth/token',
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.NOTION_REDIRECT_URI
      },
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const {
      access_token,
      workspace_id,
      workspace_name,
      workspace_icon,
      bot_id
    } = tokenResponse.data;

    // Store in notion_configs
    await supabase
      .from('notion_configs')
      .upsert({
        user_id: userId,
        access_token,
        workspace_id,
        workspace_name,
        workspace_icon: workspace_icon?.url || null,
        bot_id
      }, { onConflict: 'user_id' });

    // Update onboarding state
    await supabase
      .from('onboarding_state')
      .update({ notion_connected: true })
      .eq('user_id', userId);

    return res.redirect(
      `${process.env.FRONTEND_URL}/#/onboarding/select-databases?notion=connected`
    );
  } catch (err) {
    console.error('Notion OAuth error:', err.response?.data || err.message);
    return res.redirect(
      `${process.env.FRONTEND_URL}/#/onboarding/connect-notion?error=oauth_failed`
    );
  }
});

// ─────────────────────────────────────────────
// GET /api/notion/databases
// Lists all databases the user has granted access to
// ─────────────────────────────────────────────
router.get('/databases', requireAuth, async (req, res) => {
  try {
    const { data: config } = await supabase
      .from('notion_configs')
      .select('access_token')
      .eq('user_id', req.user.id)
      .single();

    if (!config) {
      return res.status(400).json({ error: 'Notion not connected' });
    }

    const notion = new Client({ auth: config.access_token });

    const response = await notion.search({
      filter: { value: 'database', property: 'object' },
      page_size: 50
    });

    const databases = response.results.map((db) => ({
      id: db.id,
      name: db.title?.[0]?.plain_text || 'Untitled',
      url: db.url,
      properties: Object.keys(db.properties || {})
    }));

    return res.json({ databases });
  } catch (err) {
    console.error('List databases error:', err);
    return res.status(500).json({ error: 'Failed to fetch databases' });
  }
});

// ─────────────────────────────────────────────
// POST /api/notion/databases/select
// Saves which databases to use for journal, tasks, notes
// ─────────────────────────────────────────────
router.post('/databases/select', requireAuth, async (req, res) => {
  const {
    journal_db_id, journal_db_name,
    tasks_db_id, tasks_db_name,
    notes_db_id, notes_db_name,
    habits_db_id, habits_db_name
  } = req.body;

  if (!journal_db_id || !tasks_db_id) {
    return res.status(400).json({ error: 'Journal and Tasks databases are required' });
  }

  try {
    await supabase
      .from('notion_configs')
      .update({
        journal_db_id, journal_db_name,
        tasks_db_id, tasks_db_name,
        notes_db_id: notes_db_id || null,
        notes_db_name: notes_db_name || null,
        habits_db_id: habits_db_id || null,
        habits_db_name: habits_db_name || null
      })
      .eq('user_id', req.user.id);

    // Update onboarding state
    await supabase
      .from('onboarding_state')
      .update({
        journal_db_selected: true,
        tasks_db_selected: true
      })
      .eq('user_id', req.user.id);

    return res.json({
      message: 'Databases saved',
      redirectTo: '/onboarding/choose-template'
    });
  } catch (err) {
    console.error('Database select error:', err);
    return res.status(500).json({ error: 'Failed to save databases' });
  }
});

// ─────────────────────────────────────────────
// GET /api/notion/config
// Returns current notion config for the user
// ─────────────────────────────────────────────
router.get('/config', requireAuth, async (req, res) => {
  try {
    const { data: config } = await supabase
      .from('notion_configs')
      .select(
        'workspace_name, workspace_icon, journal_db_id, journal_db_name, tasks_db_id, tasks_db_name, notes_db_id, notes_db_name, habits_db_id, habits_db_name'
      )
      .eq('user_id', req.user.id)
      .single();

    return res.json({ config: config || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch Notion config' });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/notion/disconnect
// Disconnects Notion from the user's account
// ─────────────────────────────────────────────
router.delete('/disconnect', requireAuth, async (req, res) => {
  try {
    await supabase
      .from('notion_configs')
      .delete()
      .eq('user_id', req.user.id);

    await supabase
      .from('onboarding_state')
      .update({
        notion_connected: false,
        journal_db_selected: false,
        tasks_db_selected: false,
        completed_at: null
      })
      .eq('user_id', req.user.id);

    return res.json({ message: 'Notion disconnected successfully' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to disconnect Notion' });
  }
});

module.exports = router;
