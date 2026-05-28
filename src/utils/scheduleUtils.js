// Computes the next run timestamp for a given local time + timezone
const computeNextRun = (timeStr, timezone) => {
  try {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();

    const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone });
    const candidate = new Date(`${todayStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);

    // If that time has already passed today, schedule for tomorrow
    const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const localCandidate = new Date(candidate.toLocaleString('en-US', { timeZone: timezone }));

    if (localCandidate <= localNow) {
      candidate.setDate(candidate.getDate() + 1);
    }

    return candidate.toISOString();
  } catch (err) {
    return null;
  }
};

module.exports = { computeNextRun };
