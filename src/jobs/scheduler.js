const cron = require('node-cron');
const supabase = require('../db/supabase');
const { generateJournal } = require('../services/journalService');
const { cleanExpiredTokens } = require('../utils/jwt');

const log = (msg) => console.log(`[${new Date().toISOString()}] [Scheduler] ${msg}`);
const logError = (msg, err) => console.error(`[${new Date().toISOString()}] [Scheduler] ${msg}`, err?.message || err);

// ─────────────────────────────────────────────
// startScheduler
// Two jobs:
// 1. Every minute — check who needs a journal generated
// 2. Every day at 3 AM UTC — clean expired refresh tokens
// ─────────────────────────────────────────────
const startScheduler = () => {

  // ── Job 1: Journal generation (every minute) ──
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const currentUTCMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

    try {
      const { data: schedules, error } = await supabase
        .from('schedules')
        .select('user_id, generate_time, timezone, last_run_at')
        .eq('is_active', true);

      if (error) {
        logError('Failed to fetch schedules', error);
        return;
      }

      if (!schedules || schedules.length === 0) return;

      for (const schedule of schedules) {
        try {
          const userMinutes = getUTCMinutesForTime(schedule.generate_time, schedule.timezone);
          if (userMinutes !== currentUTCMinutes) continue;

          // Don't run twice in the same day for this user
          if (schedule.last_run_at) {
            const lastRunLocalDate = new Date(schedule.last_run_at)
              .toLocaleDateString('en-CA', { timeZone: schedule.timezone });
            const todayLocalDate = now
              .toLocaleDateString('en-CA', { timeZone: schedule.timezone });
            if (lastRunLocalDate === todayLocalDate) continue;
          }

          log(`Triggering journal for user ${schedule.user_id}`);

          // Fire and forget — don't await, don't block the loop
          generateJournal(schedule.user_id, 'scheduled').catch((err) => {
            logError(`Journal failed for user ${schedule.user_id}`, err);
          });

        } catch (userErr) {
          logError(`Error processing schedule for user ${schedule.user_id}`, userErr);
        }
      }
    } catch (err) {
      logError('Scheduler tick crashed', err);
    }
  });

  // ── Job 2: Clean expired tokens (every day at 3 AM UTC) ──
  cron.schedule('0 3 * * *', async () => {
    try {
      await cleanExpiredTokens();
      log('Cleaned expired refresh tokens');
    } catch (err) {
      logError('Token cleanup failed', err);
    }
  });

  log('Started — journal check every minute, token cleanup daily at 3 AM UTC');
};

// ─────────────────────────────────────────────
// getUTCMinutesForTime
// Converts a local HH:MM:SS time in a timezone to
// UTC minutes from midnight for comparison
// ─────────────────────────────────────────────
const getUTCMinutesForTime = (timeStr, timezone) => {
  try {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    const localDateStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
    const localDT = new Date(`${localDateStr}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00`);
    const utcOffset = getTimezoneOffsetMinutes(timezone, localDT);
    return ((hours * 60 + minutes) - utcOffset + 1440) % 1440;
  } catch {
    return -1;
  }
};

const getTimezoneOffsetMinutes = (timezone, date) => {
  try {
    const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const local = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    return (local - utc) / 60000;
  } catch {
    return 0;
  }
};

module.exports = { startScheduler };
