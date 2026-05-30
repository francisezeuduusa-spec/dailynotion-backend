const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { computeNextRun } = require('../utils/scheduleUtils');

// ─────────────────────────────────────────────
// GET /api/schedule
// Returns the user's current schedule
// ─────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data: schedule } = await supabase
      .from('schedules')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    return res.json({ schedule: schedule || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// ─────────────────────────────────────────────
// POST /api/schedule
// Creates or updates the user's schedule
// Body: { generate_time: "08:00", timezone: "America/New_York" }
// ─────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { generate_time, timezone } = req.body;

  if (!generate_time || !timezone) {
    return res.status(400).json({ error: 'generate_time and timezone are required' });
  }

  // Accept HH:MM or HH:MM:SS — normalize to HH:MM
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
  if (!timeRegex.test(generate_time)) {
    return res.status(400).json({ error: 'Invalid time format. Use HH:MM (e.g., 09:00)' });
  }
  // Strip seconds if present so we always work with HH:MM
  const normalizedTime = generate_time.slice(0, 5);

  try {
    // Check plan — free users can't schedule
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_id', req.user.id)
      .single();

    if (!subscription || subscription.plan === 'free') {
      return res.status(403).json({
        error: 'Scheduled generation requires a Pro or Team plan',
        code: 'PLAN_REQUIRED',
        requiredPlans: ['pro', 'team']
      });
    }

    const nextRun = computeNextRun(normalizedTime, timezone);

    const upsertData = {
      user_id: req.user.id,
      generate_time: `${normalizedTime}:00`,
      timezone,
      is_active: true,
    };

    // Only set next_run_at if we got a valid value — never write null/invalid dates
    if (nextRun) {
      upsertData.next_run_at = nextRun;
    }

    const { data: schedule, error } = await supabase
      .from('schedules')
      .upsert(upsertData, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    // Mark schedule step as complete — always set schedule_set = true
    // Then check if ALL steps are done and mark completed_at
    const { data: onboarding } = await supabase
      .from('onboarding_state')
      .select('completed_at, notion_connected, journal_db_selected, tasks_db_selected, template_chosen')
      .eq('user_id', req.user.id)
      .single();

    const allComplete = onboarding &&
      onboarding.notion_connected &&
      onboarding.journal_db_selected &&
      onboarding.tasks_db_selected &&
      onboarding.template_chosen;

    // Always mark schedule_set = true regardless of other steps
    // Always set completed_at if all steps done — even if it was already set
    await supabase
      .from('onboarding_state')
      .update({
        schedule_set: true,
        completed_at: allComplete ? new Date().toISOString() : onboarding?.completed_at || null,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', req.user.id);

    return res.json({
      schedule,
      message: 'Schedule saved',
      redirectTo: '/dashboard'
    });
  } catch (err) {
    console.error('Schedule error:', err);
    return res.status(500).json({ error: 'Failed to save schedule' });
  }
});

// ─────────────────────────────────────────────
// PATCH /api/schedule/toggle
// Enable or disable the schedule without deleting it
// ─────────────────────────────────────────────
router.patch('/toggle', requireAuth, async (req, res) => {
  try {
    const { data: schedule } = await supabase
      .from('schedules')
      .select('is_active')
      .eq('user_id', req.user.id)
      .single();

    if (!schedule) {
      return res.status(404).json({ error: 'No schedule found' });
    }

    const { data: updated } = await supabase
      .from('schedules')
      .update({ is_active: !schedule.is_active })
      .eq('user_id', req.user.id)
      .select()
      .single();

    return res.json({ schedule: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to toggle schedule' });
  }
});

module.exports = router;
