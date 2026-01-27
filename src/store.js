import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { CONFIG } from './config.js';

const DATA_FILE = join(CONFIG.dataDir, 'store.json');

// Ensure data directory exists
if (!existsSync(CONFIG.dataDir)) {
  mkdirSync(CONFIG.dataDir, { recursive: true });
}

/**
 * Load data from persistent store
 */
function loadStore() {
  if (!existsSync(DATA_FILE)) {
    return {
      processedMeetings: {},  // meetingId -> { processedAt, actionItemIds }
      actionItems: {},        // actionItemId -> action item data
      createdIssues: {},      // actionItemId -> Linear issue data
      settings: {
        customPrompt: null,
        linearTeamId: null,
      },
      lastProcessedTime: null,
    };
  }

  try {
    const raw = readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Error loading store:', error.message);
    return {
      processedMeetings: {},
      actionItems: {},
      createdIssues: {},
      settings: {},
      lastProcessedTime: null,
    };
  }
}

/**
 * Save data to persistent store
 */
function saveStore(data) {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving store:', error.message);
  }
}

// In-memory cache
let store = loadStore();

/**
 * Check if a meeting has been processed
 */
export function isMeetingProcessed(meetingId) {
  return !!store.processedMeetings[meetingId];
}

/**
 * Mark a meeting as processed
 */
export function markMeetingProcessed(meetingId, actionItemIds) {
  store.processedMeetings[meetingId] = {
    processedAt: new Date().toISOString(),
    actionItemIds,
  };
  store.lastProcessedTime = new Date().toISOString();
  saveStore(store);
}

/**
 * Save extracted action items
 */
export function saveActionItems(actionItems) {
  for (const item of actionItems) {
    store.actionItems[item.id] = item;
  }
  saveStore(store);
}

/**
 * Get all action items pending review
 */
export function getPendingReview() {
  return Object.values(store.actionItems).filter(
    item => item.status === 'pending_review'
  );
}

/**
 * Get all action items
 */
export function getAllActionItems() {
  return Object.values(store.actionItems);
}

/**
 * Get action item by ID
 */
export function getActionItem(id) {
  return store.actionItems[id];
}

/**
 * Update action item status
 */
export function updateActionItem(id, updates) {
  if (store.actionItems[id]) {
    store.actionItems[id] = { ...store.actionItems[id], ...updates };
    saveStore(store);
    return store.actionItems[id];
  }
  return null;
}

/**
 * Approve an action item
 */
export function approveActionItem(id) {
  return updateActionItem(id, { status: 'approved', approvedAt: new Date().toISOString() });
}

/**
 * Reject an action item
 */
export function rejectActionItem(id) {
  return updateActionItem(id, { status: 'rejected', rejectedAt: new Date().toISOString() });
}

/**
 * Mark an action item as created in Linear
 */
export function markAsCreated(id, issueData) {
  store.createdIssues[id] = issueData;
  return updateActionItem(id, {
    status: 'created',
    createdAt: new Date().toISOString(),
    linearIssue: issueData,
  });
}

/**
 * Get created issues
 */
export function getCreatedIssues() {
  return Object.values(store.actionItems).filter(
    item => item.status === 'created'
  );
}

/**
 * Get settings
 */
export function getSettings() {
  return store.settings || {};
}

/**
 * Update settings
 */
export function updateSettings(updates) {
  store.settings = { ...store.settings, ...updates };
  saveStore(store);
  return store.settings;
}

/**
 * Get stats
 */
export function getStats() {
  const actionItems = Object.values(store.actionItems);
  return {
    totalMeetingsProcessed: Object.keys(store.processedMeetings).length,
    totalActionItems: actionItems.length,
    pendingReview: actionItems.filter(i => i.status === 'pending_review').length,
    approved: actionItems.filter(i => i.status === 'approved').length,
    rejected: actionItems.filter(i => i.status === 'rejected').length,
    created: actionItems.filter(i => i.status === 'created').length,
    lastProcessedTime: store.lastProcessedTime,
  };
}

/**
 * Clear all data (for testing/reset)
 */
export function clearStore() {
  store = {
    processedMeetings: {},
    actionItems: {},
    createdIssues: {},
    settings: store.settings, // Preserve settings
    lastProcessedTime: null,
  };
  saveStore(store);
}
