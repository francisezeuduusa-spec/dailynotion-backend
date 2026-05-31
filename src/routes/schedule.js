const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { computeNextRun } = require('../utils/scheduleUtils');

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

router.post('/', requireAuth, async (req, res) => {
  const { generate_time, timezone } = req.body;
  if (!generate_time || !timezone) {
    return res.status(400).json({ error: 'generate_time and timezone are required' });
  }
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
  if (!timeRegex.test(generate_time)) {
    return res.status(400).json({ error: 'Invalid time format. Use HH:MM (e.g., 09:00)' });
  }
  const normalizedTime = generate_time.slice(0, 5);

  try {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_id', req.user.id)
      .single();

    if (!subscription || subscription.plan === 'free') {
      await supabase
        .from('onboarding_state')
        .update({ schedule_set: true, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', req.user.id);
      return res.json({ schedule: null, message: 'Free plan — onboarding complete.', redirectTo: '/dashboard' });
    }

    const nextRun = computeNextRun(normalizedTime, timezone);
    const upsertData = { user_id: req.user.id, generate_time: `${normalizedTime}:00`, timezone, is_active: true };
    if (nextRun) upsertData.next_run_at = nextRun;

    const { data: schedule, error } = await supabase
      .from('schedules')
      .upsert(upsertData, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    // ALWAYS mark complete — this is the last onboarding step
    await supabase
      .from('onboarding_state')
      .update({ schedule_set: true, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', req.user.id);

    return res.json({ schedule, message: 'Schedule saved', redirectTo: '/dashboard' });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Schedule save error:`, err.message);
    return res.status(500).json({ error: 'Failed to save schedule' });
  }
});

router.patch('/toggle', requireAuth, async (req, res) => {
  try {
    const { data: schedule } = await supabase
      .from('schedules').select('is_active').eq('user_id', req.user.id).single();
    if (!schedule) return res.status(404).json({ error: 'No schedule found. Please save a schedule first.' });
    const { data: updated } = await supabase
      .from('schedules')
      .update({ is_active: !schedule.is_active, updated_at: new Date().toISOString() })
      .eq('user_id', req.user.id).select().single();
    return res.json({ schedule: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to toggle schedule' });
  }
});

module.exports = router;
