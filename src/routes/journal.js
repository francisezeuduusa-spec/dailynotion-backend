const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { requireAuth, guardStatus } = require('../middleware/auth');
const { generateJournal } = require('../services/journalService');

// ─────────────────────────────────────────────
// POST /api/journal/generate
// Manual "Generate Now" button trigger
// Available to all plans (free = manual only)
// ─────────────────────────────────────────────
router.post('/generate', requireAuth, guardStatus, async (req, res) => {
  try {
    // Check if a journal was already generated today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: existingRun } = await supabase
      .from('journal_runs')
      .select('id, notion_page_url, status')
      .eq('user_id', req.user.id)
      .eq('status', 'success')
      .gte('run_at', todayStart.toISOString())
      .single();

    if (existingRun) {
      return res.status(409).json({
        error: "Today's journal has already been generated",
        existingPageUrl: existingRun.notion_page_url,
        code: 'ALREADY_GENERATED_TODAY'
      });
    }

    const result = await generateJournal(req.user.id, 'manual');

    return res.json({
      message: "Today's journal has been generated!",
      pageUrl: result.pageUrl,
      tasksCount: result.tasksCount,
      notesCount: result.notesCount
    });
  } catch (err) {
    console.error('Manual generate error:', err);
    return res.status(500).json({ error: err.message || 'Journal generation failed' });
  }
});

// ─────────────────────────────────────────────
// GET /api/journal/runs
// Returns journal run history (paginated)
// ─────────────────────────────────────────────
router.get('/runs', requireAuth, guardStatus, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  try {
    const { data: runs, count, error } = await supabase
      .from('journal_runs')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('run_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return res.json({
      runs: runs || [],
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch journal history' });
  }
});

// ─────────────────────────────────────────────
// GET /api/journal/runs/latest
// Returns the most recent run (for dashboard status card)
// ─────────────────────────────────────────────
router.get('/runs/latest', requireAuth, guardStatus, async (req, res) => {
  try {
    const { data: run } = await supabase
      .from('journal_runs')
      .select('*')
      .eq('user_id', req.user.id)
      .order('run_at', { ascending: false })
      .limit(1)
      .single();

    return res.json({ run: run || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch latest run' });
  }
});

// ─────────────────────────────────────────────
// GET /api/journal/stats
// Summary stats for dashboard (total runs, success rate, streak)
// ─────────────────────────────────────────────
router.get('/stats', requireAuth, guardStatus, async (req, res) => {
  try {
    const { data: runs } = await supabase
      .from('journal_runs')
      .select('status, run_at')
      .eq('user_id', req.user.id)
      .order('run_at', { ascending: false });

    if (!runs || runs.length === 0) {
      return res.json({ totalRuns: 0, successRate: 0, currentStreak: 0 });
    }

    const totalRuns = runs.length;
    const successRuns = runs.filter((r) => r.status === 'success').length;
    const successRate = Math.round((successRuns / totalRuns) * 100);

    // Calculate current streak (consecutive days with a successful run)
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const successDates = runs
      .filter((r) => r.status === 'success')
      .map((r) => {
        const d = new Date(r.run_at);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
      });

    const uniqueDates = [...new Set(successDates)].sort((a, b) => b - a);

    for (let i = 0; i < uniqueDates.length; i++) {
      const expected = today.getTime() - i * 86400000;
      if (uniqueDates[i] === expected) {
        streak++;
      } else {
        break;
      }
    }

    return res.json({ totalRuns, successRate, currentStreak: streak });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;
