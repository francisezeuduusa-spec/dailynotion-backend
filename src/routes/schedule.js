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

  // Validate time format HH:MM
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(generate_time)) {
    return res.status(400).json({ error: 'Invalid time format. Use HH:MM (e.g., 08:00)' });
  }

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

    const nextRun = computeNextRun(generate_time, timezone);

    const { data: schedule, error } = await supabase
      .from('schedules')
      .upsert({
        user_id: req.user.id,
        generate_time: `${generate_time}:00`,
        timezone,
        is_active: true,
        next_run_at: nextRun
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    // Mark schedule step as complete in onboarding
    const { data: onboarding } = await supabase
      .from('onboarding_state')
      .select('completed_at, notion_connected, journal_db_selected, tasks_db_selected, template_chosen')
      .eq('user_id', req.user.id)
      .single();

    if (onboarding && !onboarding.completed_at) {
      const allComplete =
        onboarding.notion_connected &&
        onboarding.journal_db_selected &&
        onboarding.tasks_db_selected &&
        onboarding.template_chosen;

      await supabase
        .from('onboarding_state')
        .update({
          schedule_set: true,
          completed_at: allComplete ? new Date().toISOString() : null
        })
        .eq('user_id', req.user.id);
    }

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
