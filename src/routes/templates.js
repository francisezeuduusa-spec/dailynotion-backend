const express = require('express');
const router = express.Router();
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { requirePlan } = require('../middleware/auth');

const DEFAULT_TEMPLATES = [
  {
    name: 'Simple Daily',
    body: `# Journal — {{date}}

## ✅ Today's Tasks
{{tasks_today}}

## 📝 Recent Notes
{{notes_last_24h}}

---
*My reflections:*

`
  },
  {
    name: 'Full Daily Review',
    body: `# Daily Journal — {{date}}

## 🗓 Today's Schedule
{{meetings_today}}

## ✅ Tasks Due Today
{{tasks_today}}

## 📝 Notes from Yesterday
{{notes_last_24h}}

## 🔄 Habits
{{habit_tracker}}

---
## 💭 Reflections
**What went well:**

**What was challenging:**

**Tomorrow's focus:**

`
  },
  {
    name: 'Minimal',
    body: `# {{date}}

{{tasks_today}}

---
`
  }
];

// ─────────────────────────────────────────────
// GET /api/templates
// Returns all templates for the user + default ones
// ─────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { data: templates, error } = await supabase
      .from('templates')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return res.json({
      templates: templates || [],
      defaultTemplates: DEFAULT_TEMPLATES
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// ─────────────────────────────────────────────
// POST /api/templates
// Creates a new template (Pro: up to 10, Free: not allowed)
// ─────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { name, body, is_default = false } = req.body;

  if (!name || !body) {
    return res.status(400).json({ error: 'Name and body are required' });
  }

  try {
    // Check plan limits
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_id', req.user.id)
      .single();

    if (!subscription || subscription.plan === 'free') {
      return res.status(403).json({
        error: 'Custom templates require a Pro or Team plan',
        code: 'PLAN_REQUIRED',
        requiredPlans: ['pro', 'team']
      });
    }

    // Enforce 10 template limit on Pro
    if (subscription.plan === 'pro') {
      const { count } = await supabase
        .from('templates')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id);

      if (count >= 10) {
        return res.status(403).json({ error: 'Pro plan allows up to 10 templates' });
      }
    }

    // If setting as default, unset all others first
    if (is_default) {
      await supabase
        .from('templates')
        .update({ is_default: false })
        .eq('user_id', req.user.id);
    }

    const { data: template, error } = await supabase
      .from('templates')
      .insert({ user_id: req.user.id, name, body, is_default })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ template });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create template' });
  }
});

// ─────────────────────────────────────────────
// PUT /api/templates/:id
// Updates an existing template
// ─────────────────────────────────────────────
router.put('/:id', requireAuth, async (req, res) => {
  const { name, body, is_default } = req.body;

  try {
    // Verify ownership
    const { data: existing } = await supabase
      .from('templates')
      .select('id')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (is_default) {
      await supabase
        .from('templates')
        .update({ is_default: false })
        .eq('user_id', req.user.id);
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (body !== undefined) updates.body = body;
    if (is_default !== undefined) updates.is_default = is_default;

    const { data: template, error } = await supabase
      .from('templates')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    return res.json({ template });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update template' });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/templates/:id
// ─────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;

    return res.json({ message: 'Template deleted' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ─────────────────────────────────────────────
// POST /api/templates/onboarding-select
// User picks a template during onboarding (can use default)
// ─────────────────────────────────────────────
router.post('/onboarding-select', requireAuth, async (req, res) => {
  const { template_id, use_default, default_template_name } = req.body;

  try {
    if (use_default && default_template_name) {
      const defaultTemplate = DEFAULT_TEMPLATES.find(t => t.name === default_template_name);
      if (!defaultTemplate) {
        return res.status(400).json({ error: 'Default template not found' });
      }

      // Unset all existing defaults first to prevent duplicates
      await supabase.from('templates').update({ is_default: false }).eq('user_id', req.user.id);
      // Check if this template already exists for this user
      const { data: existing } = await supabase
        .from('templates').select('id').eq('user_id', req.user.id).eq('name', defaultTemplate.name).single();
      if (existing) {
        await supabase.from('templates').update({ is_default: true }).eq('id', existing.id);
      } else {
        await supabase.from('templates').insert({
          user_id: req.user.id, name: defaultTemplate.name, body: defaultTemplate.body, is_default: true
        });
      }
    } else if (template_id) {
      await supabase
        .from('templates')
        .update({ is_default: false })
        .eq('user_id', req.user.id);

      await supabase
        .from('templates')
        .update({ is_default: true })
        .eq('id', template_id)
        .eq('user_id', req.user.id);
    } else {
      return res.status(400).json({ error: 'Must provide template_id or use_default' });
    }

    // Mark template step complete in onboarding
    await supabase
      .from('onboarding_state')
      .update({ template_chosen: true })
      .eq('user_id', req.user.id);

    return res.json({
      message: 'Template selected',
      redirectTo: '/onboarding/set-schedule'
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to select template' });
  }
});

module.exports = router;
