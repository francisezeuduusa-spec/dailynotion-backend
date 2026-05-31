const computeNextRun = (timeStr, timezone) => {
  try {
    const [hoursStr, minutesStr] = timeStr.split(':');
    const hours = parseInt(hoursStr, 10);
    const minutes = parseInt(minutesStr, 10);
    if (isNaN(hours) || isNaN(minutes)) return null;
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
    const candidate = localDateToUTC(
      `${todayStr}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00`,
      timezone
    );
    if (!candidate || isNaN(candidate.getTime())) return null;
    if (candidate <= now) candidate.setUTCDate(candidate.getUTCDate() + 1);
    return candidate.toISOString();
  } catch (err) {
    console.error('[scheduleUtils] computeNextRun failed:', err.message);
    return null;
  }
};

const localDateToUTC = (localStr, timezone) => {
  try {
    const testDate = new Date(localStr + 'Z');
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const parts = formatter.formatToParts(testDate);
    const p = {};
    parts.forEach(({ type, value }) => { p[type] = value; });
    const utcApprox = new Date(`${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}Z`);
    const offsetMs = testDate.getTime() - utcApprox.getTime();
    const result = new Date(new Date(localStr + 'Z').getTime() + offsetMs);
    return isNaN(result.getTime()) ? null : result;
  } catch { return null; }
};

module.exports = { computeNextRun };
