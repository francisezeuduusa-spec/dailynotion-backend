// Computes the next run timestamp for a given local HH:MM time in a timezone
const computeNextRun = (timeStr, timezone) => {
  try {
    const [hoursStr, minutesStr] = timeStr.split(':');
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);

    if (isNaN(hours) || isNaN(minutes)) return null;

    const now = new Date();

    // Get today's date string in the target timezone e.g. "2026-05-30"
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone });

    // Build a UTC date that represents the target local time
    // by using Intl to find the UTC offset at that moment
    const localTimeStr = `${todayStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;

    // Parse this as a local time in the given timezone
    const candidate = localDateToUTC(localTimeStr, timezone);

    if (!candidate || isNaN(candidate.getTime())) return null;

    // If that time has already passed, add one day
    if (candidate <= now) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }

    return candidate.toISOString();
  } catch (err) {
    console.error(`[scheduleUtils] computeNextRun failed:`, err.message);
    return null;
  }
};

// Converts a local datetime string "YYYY-MM-DDTHH:MM:SS" in a given timezone
// to a UTC Date object
const localDateToUTC = (localStr, timezone) => {
  try {
    // Use Intl to get the UTC offset for this timezone at this moment
    const testDate = new Date(localStr + 'Z'); // treat as UTC first
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(testDate);
    const p = {};
    parts.forEach(({ type, value }) => { p[type] = value; });

    const utcApprox = new Date(`${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}Z`);
    const offsetMs = testDate.getTime() - utcApprox.getTime();

    // The actual target time as UTC = local time string treated as UTC minus the offset
    const result = new Date(new Date(localStr + 'Z').getTime() + offsetMs);
    return isNaN(result.getTime()) ? null : result;
  } catch {
    return null;
  }
};

module.exports = { computeNextRun };
