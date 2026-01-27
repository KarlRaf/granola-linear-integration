import chokidar from 'chokidar';
import { CONFIG } from './config.js';
import { loadGranolaData } from './granola.js';
import { extractActionItems } from './ai.js';
import * as store from './store.js';

let watcher = null;
let pollInterval = null;
let isProcessing = false;

/**
 * Process new (unprocessed) meetings
 */
export async function processNewMeetings() {
  if (isProcessing) {
    console.log('⏳ Already processing, skipping...');
    return { skipped: true };
  }

  isProcessing = true;

  try {
    const { meetings } = loadGranolaData();
    const settings = store.getSettings();

    // Find unprocessed meetings
    const unprocessed = meetings.filter(m => !store.isMeetingProcessed(m.id));

    if (unprocessed.length === 0) {
      console.log('✓ No new meetings to process');
      return { processed: 0, actionItems: 0 };
    }

    console.log(`\n📋 Found ${unprocessed.length} new meeting(s) to process`);

    let totalActionItems = 0;
    const results = [];

    for (const meeting of unprocessed) {
      console.log(`  → Processing: ${meeting.title}`);

      try {
        const actionItems = await extractActionItems(meeting, settings.customPrompt);
        store.saveActionItems(actionItems);
        store.markMeetingProcessed(meeting.id, actionItems.map(i => i.id));

        console.log(`    ✓ Extracted ${actionItems.length} action item(s)`);
        totalActionItems += actionItems.length;

        results.push({
          meetingId: meeting.id,
          title: meeting.title,
          actionItems: actionItems.length,
          success: true,
        });
      } catch (error) {
        console.error(`    ✗ Error: ${error.message}`);
        results.push({
          meetingId: meeting.id,
          title: meeting.title,
          success: false,
          error: error.message,
        });
      }
    }

    if (totalActionItems > 0) {
      console.log(`\n🎉 Total: ${totalActionItems} new action item(s) ready for review`);
      console.log(`   Open http://localhost:${CONFIG.port} to review\n`);
    }

    return {
      processed: unprocessed.length,
      actionItems: totalActionItems,
      results,
    };
  } finally {
    isProcessing = false;
  }
}

/**
 * Start watching for changes
 */
export function startWatcher() {
  console.log(`👀 Starting file watcher for Granola data...`);
  console.log(`   Path: ${CONFIG.granolaCachePath}`);
  console.log(`   Poll interval: ${CONFIG.pollInterval / 1000}s\n`);

  // Watch the Granola cache file for changes
  watcher = chokidar.watch(CONFIG.granolaCachePath, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  watcher.on('change', async (path) => {
    console.log(`\n📝 Granola cache updated, checking for new meetings...`);
    await processNewMeetings();
  });

  watcher.on('error', (error) => {
    console.error('Watcher error:', error.message);
  });

  // Also poll periodically in case file events are missed
  pollInterval = setInterval(async () => {
    await processNewMeetings();
  }, CONFIG.pollInterval);

  // Process immediately on startup
  setTimeout(async () => {
    console.log('🔍 Checking for existing unprocessed meetings...');
    await processNewMeetings();
  }, 1000);
}

/**
 * Stop watching
 */
export function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  console.log('Watcher stopped');
}
