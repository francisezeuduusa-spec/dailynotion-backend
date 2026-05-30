const { Client } = require('@notionhq/client');
const supabase = require('../db/supabase');

// ─────────────────────────────────────────────
// generateJournal
// Main function — fetches data from Notion,
// fills the template, creates the journal page
// ─────────────────────────────────────────────
const generateJournal = async (userId, trigger = 'manual') => {
  let runId;

  try {
    // Create a pending run record
    const { data: run } = await supabase
      .from('journal_runs')
      .insert({ user_id: userId, trigger, status: 'pending' })
      .select()
      .single();

    runId = run.id;

    // Fetch all needed config
    const { data: config } = await supabase
      .from('notion_configs')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!config) throw new Error('Notion not connected');

    // Get the default template — use limit to avoid crash on duplicates
    // If somehow multiple defaults exist, just take the first one
    const { data: templateRows } = await supabase
      .from('templates')
      .select('body')
      .eq('user_id', userId)
      .eq('is_default', true)
      .order('created_at', { ascending: false })
      .limit(1);

    const templateRow = templateRows?.[0] || null;

    if (!templateRow) throw new Error('No default template found. Please complete onboarding and select a template.');

    const notion = new Client({ auth: config.access_token });

    const today = new Date();
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const dateFormatted = today.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Fetch tasks due today
    const { tasks, count: tasksCount } = await fetchTasksToday(notion, config.tasks_db_id, dateStr);

    // Fetch notes from last 24h (if notes db is configured)
    let notes = [];
    let notesCount = 0;
    if (config.notes_db_id) {
      const result = await fetchRecentNotes(notion, config.notes_db_id);
      notes = result.notes;
      notesCount = result.count;
    }

    // Fill template placeholders
    const filledBody = fillTemplate(templateRow.body, {
      date: dateFormatted,
      tasks_today: tasks,
      notes_last_24h: notes,
      meetings_today: [],
      habit_tracker: []
    });

    // Create the journal page in Notion
    const page = await createNotionPage(notion, config.journal_db_id, dateStr, filledBody);

    // Mark run as success
    await supabase
      .from('journal_runs')
      .update({
        status: 'success',
        notion_page_id: page.id,
        notion_page_url: page.url,
        tasks_count: tasksCount,
        notes_count: notesCount,
        completed_at: new Date().toISOString()
      })
      .eq('id', runId);

    // Update last_run_at on schedule if this was scheduled
    if (trigger === 'scheduled') {
      await supabase
        .from('schedules')
        .update({ last_run_at: new Date().toISOString() })
        .eq('user_id', userId);
    }

    return {
      success: true,
      pageId: page.id,
      pageUrl: page.url,
      tasksCount,
      notesCount
    };

  } catch (err) {
    console.error(`Journal generation failed for user ${userId}:`, err.message);

    if (runId) {
      await supabase
        .from('journal_runs')
        .update({
          status: 'failed',
          error_message: err.message,
          completed_at: new Date().toISOString()
        })
        .eq('id', runId);
    }

    throw err;
  }
};

// ─────────────────────────────────────────────
// fetchTasksToday
// Queries the tasks database for items due today
// ─────────────────────────────────────────────
const fetchTasksToday = async (notion, taskDbId, dateStr) => {
  try {
    // First get the database schema to find the date property name
    const db = await notion.databases.retrieve({ database_id: taskDbId });
    const props = db.properties;
    
    // Find a date-type property (Due Date, Date, Due, etc.)
    const datePropName = Object.keys(props).find(
      (name) => props[name].type === 'date'
    );

    const filter = datePropName
      ? {
          property: datePropName,
          date: { equals: dateStr }
        }
      : undefined;

    const sort = datePropName
      ? [{ property: datePropName, direction: 'ascending' }]
      : undefined;

    const response = await notion.databases.query({
      database_id: taskDbId,
      ...(filter ? { filter } : {}),
      ...(sort ? { sorts: sort } : {}),
      page_size: 50
    });

    const tasks = response.results.map((page) => {
      const nameProperty = Object.values(page.properties).find(
        (p) => p.type === 'title'
      );
      return nameProperty?.title?.[0]?.plain_text || 'Untitled task';
    });

    return { tasks, count: tasks.length };
  } catch (err) {
    console.error('Fetch tasks error:', err.message);
    return { tasks: [], count: 0 };
  }
};

// ─────────────────────────────────────────────
// fetchRecentNotes
// Queries the notes database for items created in last 24h
// ─────────────────────────────────────────────
const fetchRecentNotes = async (notion, notesDbId) => {
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const response = await notion.databases.query({
      database_id: notesDbId,
      filter: {
        property: 'Created time',
        created_time: { after: yesterday }
      },
      page_size: 20
    });

    const notes = response.results.map((page) => {
      const nameProperty = Object.values(page.properties).find(
        (p) => p.type === 'title'
      );
      return nameProperty?.title?.[0]?.plain_text || 'Untitled note';
    });

    return { notes, count: notes.length };
  } catch (err) {
    console.error('Fetch notes error:', err.message);
    return { notes: [], count: 0 };
  }
};

// ─────────────────────────────────────────────
// fillTemplate
// Replaces {{placeholders}} with actual content
// ─────────────────────────────────────────────
const fillTemplate = (templateBody, data) => {
  let filled = templateBody;

  filled = filled.replace('{{date}}', data.date || new Date().toDateString());

  // Tasks
  const tasksContent = data.tasks_today?.length
    ? data.tasks_today.map((t) => `- [ ] ${t}`).join('\n')
    : '_No tasks due today_';
  filled = filled.replace('{{tasks_today}}', tasksContent);

  // Notes
  const notesContent = data.notes_last_24h?.length
    ? data.notes_last_24h.map((n) => `- ${n}`).join('\n')
    : '_No recent notes_';
  filled = filled.replace('{{notes_last_24h}}', notesContent);

  // Meetings (Phase 2 placeholder)
  const meetingsContent = data.meetings_today?.length
    ? data.meetings_today.map((m) => `- ${m}`).join('\n')
    : '_No meetings today_';
  filled = filled.replace('{{meetings_today}}', meetingsContent);

  // Habits (placeholder)
  filled = filled.replace('{{habit_tracker}}', '_Habit tracker not configured_');

  return filled;
};

// ─────────────────────────────────────────────
// createNotionPage
// Creates a new page in the journal database
// ─────────────────────────────────────────────
const createNotionPage = async (notion, journalDbId, dateStr, content) => {
  // Convert markdown-ish content to Notion blocks
  const blocks = contentToNotionBlocks(content);

  // Only set properties that exist in the database
  // We'll fetch the database schema to check, but for simplicity
  // we just set the title since that's always required
  const pageProperties = {
    title: {
      title: [{ text: { content: `Journal ${dateStr}` } }]
    }
  };

  const page = await notion.pages.create({
    parent: { database_id: journalDbId },
    properties: pageProperties,
    children: blocks
  });

  return page;
};

// ─────────────────────────────────────────────
// contentToNotionBlocks
// Converts plain text/markdown to Notion block objects
// ─────────────────────────────────────────────
const contentToNotionBlocks = (content) => {
  const lines = content.split('\n');
  const blocks = [];

  for (const line of lines) {
    if (!line.trim()) {
      // Empty line — paragraph break
      blocks.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [] } });
      continue;
    }

    if (line.startsWith('# ')) {
      blocks.push({
        object: 'block', type: 'heading_1',
        heading_1: { rich_text: [{ text: { content: line.slice(2) } }] }
      });
    } else if (line.startsWith('## ')) {
      blocks.push({
        object: 'block', type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: line.slice(3) } }] }
      });
    } else if (line.startsWith('### ')) {
      blocks.push({
        object: 'block', type: 'heading_3',
        heading_3: { rich_text: [{ text: { content: line.slice(4) } }] }
      });
    } else if (line.startsWith('- [ ] ')) {
      blocks.push({
        object: 'block', type: 'to_do',
        to_do: {
          rich_text: [{ text: { content: line.slice(6) } }],
          checked: false
        }
      });
    } else if (line.startsWith('- ')) {
      blocks.push({
        object: 'block', type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ text: { content: line.slice(2) } }] }
      });
    } else if (line.startsWith('---')) {
      blocks.push({ object: 'block', type: 'divider', divider: {} });
    } else {
      blocks.push({
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ text: { content: line } }] }
      });
    }
  }

  // Notion API max 100 blocks per request
  return blocks.slice(0, 100);
};

module.exports = { generateJournal };
