const cron = require('node-cron');
const supabase = require('../db/supabase');
const { generateJournal } = require('../services/journalService');

// ─────────────────────────────────────────────
// startScheduler
// Runs every minute. Checks for users whose
// scheduled generate_time matches the current
// minute in their local timezone.
// ─────────────────────────────────────────────
const startScheduler = () => {
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const currentMinute = now.getUTCHours() * 60 + now.getUTCMinutes();

    try {
      // Get all active schedules
      const { data: schedules, error } = await supabase
        .from('schedules')
        .select('user_id, generate_time, timezone, last_run_at')
        .eq('is_active', true);

      if (error || !schedules) return;

      for (const schedule of schedules) {
        try {
          // Convert user's generate_time to UTC minutes
          const userMinutes = getUTCMinutesForTime(schedule.generate_time, schedule.timezone);

          if (userMinutes !== currentMinute) continue;

          // Make sure we haven't already run today for this user
          if (schedule.last_run_at) {
            const lastRun = new Date(schedule.last_run_at);
            const lastRunDate = lastRun.toLocaleDateString('en-US', { timeZone: schedule.timezone });
            const todayDate = now.toLocaleDateString('en-US', { timeZone: schedule.timezone });

            if (lastRunDate === todayDate) continue; // Already ran today
          }

          console.log(`⏰ Triggering scheduled journal for user ${schedule.user_id}`);

          // Run async without blocking the loop
          generateJournal(schedule.user_id, 'scheduled').catch((err) => {
            console.error(`Scheduled journal failed for user ${schedule.user_id}:`, err.message);
          });

        } catch (userErr) {
          console.error(`Scheduler error for user ${schedule.user_id}:`, userErr.message);
        }
      }
    } catch (err) {
      console.error('Scheduler tick error:', err.message);
    }
  });

  console.log('✅ Scheduler started — checking every minute');
};

// ─────────────────────────────────────────────
// getUTCMinutesForTime
// Converts a HH:MM:SS time string in a given timezone
// to UTC minutes from midnight for comparison
// ─────────────────────────────────────────────
const getUTCMinutesForTime = (timeStr, timezone) => {
  try {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();

    // Build a date in the target timezone at the specified local time
    const localDateStr = now.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
    const localDateTimeStr = `${localDateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

    // Parse as local time in that timezone by using Intl
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit', minute: '2-digit', hour12: false
    });

    // Create a UTC date from the local time representation
    const targetDate = new Date(localDateTimeStr);
    const utcOffset = getTimezoneOffsetMinutes(timezone, targetDate);
    const utcMinutes = (hours * 60 + minutes - utcOffset + 1440) % 1440;

    return utcMinutes;
  } catch (err) {
    return -1;
  }
};

const getTimezoneOffsetMinutes = (timezone, date) => {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const localDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  return (localDate - utcDate) / 60000;
};

module.exports = { startScheduler };
