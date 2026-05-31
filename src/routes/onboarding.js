const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');

// ─────────────────────────────────────────────
// GET /api/onboarding/status
// Returns what steps are complete and what's next
// ─────────────────────────────────────────────
router.get('/status', requireAuth, async (req, res) => {
  try {
    const { data: onboarding } = await supabase
      .from('onboarding_state')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (!onboarding) {
      return res.status(404).json({ error: 'Onboarding state not found' });
    }

    // Determine next step
    let nextStep = null;
    if (!onboarding.notion_connected) nextStep = '/onboarding/connect-notion';
    else if (!onboarding.journal_db_selected || !onboarding.tasks_db_selected) nextStep = '/onboarding/select-databases';
    else if (!onboarding.template_chosen) nextStep = '/onboarding/choose-template';
    else if (!onboarding.schedule_set) nextStep = '/onboarding/set-schedule';
    else nextStep = '/dashboard';

    const steps = [
      { key: 'notion_connected', label: 'Connect Notion', complete: onboarding.notion_connected, path: '/onboarding/connect-notion' },
      { key: 'databases_selected', label: 'Select your databases', complete: onboarding.journal_db_selected && onboarding.tasks_db_selected, path: '/onboarding/select-databases' },
      { key: 'template_chosen', label: 'Choose a template', complete: onboarding.template_chosen, path: '/onboarding/choose-template' },
      { key: 'schedule_set', label: 'Set your schedule', complete: onboarding.schedule_set, path: '/onboarding/set-schedule' }
    ];

    return res.json({
      onboarding,
      steps,
      nextStep,
      isComplete: !!onboarding.completed_at
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch onboarding status' });
  }
});

// ─────────────────────────────────────────────
// POST /api/onboarding/complete
// Marks the entire onboarding as complete
// Called after the last step (set schedule)
// ─────────────────────────────────────────────
router.post('/complete', requireAuth, async (req, res) => {
  try {
    const { data: onboarding } = await supabase
      .from('onboarding_state')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (!onboarding) {
      return res.status(404).json({ error: 'Onboarding state not found' });
    }

    if (!onboarding.notion_connected || !onboarding.journal_db_selected || !onboarding.tasks_db_selected || !onboarding.template_chosen) {
      return res.status(400).json({ error: 'Not all required onboarding steps are complete' });
    }

    await supabase
      .from('onboarding_state')
      .update({ completed_at: new Date().toISOString() })
      .eq('user_id', req.user.id);

    return res.json({ message: 'Onboarding complete', redirectTo: '/dashboard' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

module.exports = router;
