#!/usr/bin/env node
/**
 * Granola → Linear: File watcher with macOS notifications
 *
 * Watches Granola's cache file for changes, extracts action items,
 * and shows a macOS notification. Click the notification to open the web UI.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_DIR = join(__dirname, '..');

// Load environment BEFORE other imports
config({ path: join(PROJECT_DIR, '.env'), override: true });

const STATE_FILE = join(PROJECT_DIR, 'data', '.last-processed');
const PORT = process.env.PORT || 3847;

/**
 * Send macOS notification
 */
function notify(title, message, action = null) {
  // Escape quotes for osascript
  const safeMessage = message.replace(/"/g, '\\"').replace(/'/g, "'\\''");
  const safeTitle = title.replace(/"/g, '\\"');

  let script = `display notification "${safeMessage}" with title "${safeTitle}"`;
  if (action) {
    script += ` sound name "default"`;
  }

  try {
    execSync(`osascript -e '${script}'`);
  } catch (e) {
    console.error('Failed to send notification:', e.message);
  }
}

/**
 * Open the web UI
 */
function openWebUI() {
  // Check if server is running
  try {
    execSync(`curl -s http://localhost:${PORT}/api/health`, { timeout: 2000 });
    // Server is running, just open browser
    execSync(`open http://localhost:${PORT}`);
  } catch (e) {
    // Server not running, start it and open browser
    console.log('Starting server...');
    const server = spawn('node', ['src/server.js'], {
      cwd: PROJECT_DIR,
      detached: true,
      stdio: 'ignore',
      env: process.env
    });
    server.unref();

    // Wait a bit then open browser
    setTimeout(() => {
      execSync(`open http://localhost:${PORT}`);
    }, 2000);
  }
}

/**
 * Get last processed timestamp
 */
function getLastProcessed() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { timestamp: 0, meetingIds: [] };
}

/**
 * Save last processed state
 */
function saveLastProcessed(state) {
  const dir = dirname(STATE_FILE);
  if (!existsSync(dir)) {
    execSync(`mkdir -p "${dir}"`);
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Process new meetings
 */
async function processNewMeetings() {
  // Dynamic imports after env is loaded
  const { loadGranolaData } = await import('./granola.js');
  const { extractActionItems } = await import('./ai.js');
  const store = await import('./store.js');

  console.log(`[${new Date().toISOString()}] Checking for new meetings...`);

  const { meetings } = loadGranolaData();
  const lastProcessed = getLastProcessed();

  // Find meetings we haven't processed yet
  const newMeetings = meetings.filter(m =>
    !lastProcessed.meetingIds.includes(m.id) &&
    new Date(m.date).getTime() > lastProcessed.timestamp - 86400000 // Within last 24h
  );

  if (newMeetings.length === 0) {
    console.log('No new meetings to process');
    return;
  }

  console.log(`Found ${newMeetings.length} new meeting(s)`);

  let totalItems = 0;
  const processedIds = [...lastProcessed.meetingIds];

  for (const meeting of newMeetings) {
    try {
      console.log(`Processing: ${meeting.title}`);
      const actionItems = await extractActionItems(meeting);

      if (actionItems.length > 0) {
        store.saveActionItems(actionItems);
        totalItems += actionItems.length;
        console.log(`  → Extracted ${actionItems.length} action item(s)`);
      }

      processedIds.push(meeting.id);
    } catch (error) {
      console.error(`  → Error: ${error.message}`);
    }
  }

  // Save state
  saveLastProcessed({
    timestamp: Date.now(),
    meetingIds: processedIds.slice(-100) // Keep last 100 IDs
  });

  // Send notification if we found items
  if (totalItems > 0) {
    const meetingNames = newMeetings.map(m => m.title).join(', ');
    notify(
      'Granola → Linear',
      `${totalItems} action item(s) from: ${meetingNames.substring(0, 50)}${meetingNames.length > 50 ? '...' : ''}`,
      'open'
    );

    // Open web UI automatically
    openWebUI();
  } else {
    console.log('No action items found in new meetings');
  }
}

// Run
processNewMeetings().catch(console.error);
