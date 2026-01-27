import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { CONFIG, validateConfig } from './config.js';
import { loadGranolaData, getMeetingById } from './granola.js';
import { extractActionItems, getDefaultPrompt } from './ai.js';
import { createIssue, createIssues, getTeams, testConnection } from './linear.js';
import * as store from './store.js';
import { startWatcher, stopWatcher, processNewMeetings } from './watcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// Validate configuration on startup
validateConfig();

// ========== API Routes ==========

// Health check
app.get('/api/health', async (req, res) => {
  const linearStatus = await testConnection();
  res.json({
    status: 'ok',
    linear: linearStatus,
    granolaCachePath: CONFIG.granolaCachePath,
    stats: store.getStats(),
  });
});

// Get all meetings from Granola
app.get('/api/meetings', (req, res) => {
  try {
    const { meetings } = loadGranolaData();
    const processed = store.getStats().totalMeetingsProcessed;

    res.json({
      meetings: meetings.map(m => ({
        id: m.id,
        title: m.title,
        date: m.date,
        participants: m.participants,
        hasNotes: !!m.notes,
        hasTranscript: !!m.transcript,
        processed: store.isMeetingProcessed(m.id),
      })),
      total: meetings.length,
      processed,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific meeting
app.get('/api/meetings/:id', (req, res) => {
  try {
    const meeting = getMeetingById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    res.json(meeting);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process a specific meeting (extract action items)
app.post('/api/meetings/:id/process', async (req, res) => {
  try {
    const meeting = getMeetingById(req.params.id);
    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const settings = store.getSettings();
    const actionItems = await extractActionItems(meeting, settings.customPrompt);

    // Save to store
    store.saveActionItems(actionItems);
    store.markMeetingProcessed(meeting.id, actionItems.map(i => i.id));

    res.json({
      meetingId: meeting.id,
      actionItems,
      count: actionItems.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all action items
app.get('/api/action-items', (req, res) => {
  try {
    const status = req.query.status;
    let items = store.getAllActionItems();

    if (status) {
      items = items.filter(i => i.status === status);
    }

    // Sort by extraction date, newest first
    items.sort((a, b) => new Date(b.extractedAt) - new Date(a.extractedAt));

    res.json({ actionItems: items, total: items.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pending review items
app.get('/api/action-items/pending', (req, res) => {
  try {
    const items = store.getPendingReview();
    res.json({ actionItems: items, total: items.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update an action item
app.patch('/api/action-items/:id', (req, res) => {
  try {
    const updated = store.updateActionItem(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve an action item
app.post('/api/action-items/:id/approve', (req, res) => {
  try {
    const updated = store.approveActionItem(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reject an action item
app.post('/api/action-items/:id/reject', (req, res) => {
  try {
    const updated = store.rejectActionItem(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: 'Action item not found' });
    }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk approve
app.post('/api/action-items/bulk-approve', (req, res) => {
  try {
    const { ids } = req.body;
    const results = ids.map(id => ({
      id,
      success: !!store.approveActionItem(id),
    }));
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk reject
app.post('/api/action-items/bulk-reject', (req, res) => {
  try {
    const { ids } = req.body;
    const results = ids.map(id => ({
      id,
      success: !!store.rejectActionItem(id),
    }));
    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create Linear issue from an action item
app.post('/api/action-items/:id/create-issue', async (req, res) => {
  try {
    const item = store.getActionItem(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Action item not found' });
    }

    const teamId = req.body.teamId || store.getSettings().linearTeamId;
    const issue = await createIssue(item, teamId);

    store.markAsCreated(item.id, issue);

    res.json({ success: true, issue });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create Linear issues from all approved items
app.post('/api/action-items/create-all', async (req, res) => {
  try {
    const items = store.getAllActionItems().filter(i => i.status === 'approved');
    if (items.length === 0) {
      return res.json({ message: 'No approved items to create', results: [] });
    }

    const teamId = req.body.teamId || store.getSettings().linearTeamId;
    const results = await createIssues(items, teamId);

    // Mark successful ones as created
    for (const result of results) {
      if (result.success) {
        store.markAsCreated(result.actionItemId, result.issue);
      }
    }

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Linear teams
app.get('/api/linear/teams', async (req, res) => {
  try {
    const teams = await getTeams();
    res.json({ teams });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get settings
app.get('/api/settings', (req, res) => {
  try {
    const settings = store.getSettings();
    res.json({
      ...settings,
      defaultPrompt: getDefaultPrompt(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update settings
app.patch('/api/settings', (req, res) => {
  try {
    const updated = store.updateSettings(req.body);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get stats
app.get('/api/stats', (req, res) => {
  try {
    res.json(store.getStats());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manually trigger processing
app.post('/api/process', async (req, res) => {
  try {
    const results = await processNewMeetings();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset store (for testing)
app.post('/api/reset', (req, res) => {
  store.clearStore();
  res.json({ success: true });
});

// ========== Start Server ==========

app.listen(CONFIG.port, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║        Granola → Linear Integration                       ║
╠═══════════════════════════════════════════════════════════╣
║  🌐 Web UI:     http://localhost:${CONFIG.port}                  ║
║  📁 Watching:   ${CONFIG.granolaCachePath.substring(0, 40)}...  ║
║  ⏱️  Interval:   ${CONFIG.pollInterval / 1000}s                                  ║
╚═══════════════════════════════════════════════════════════╝
  `);

  // Start the file watcher
  startWatcher();
});
