import { readFileSync, existsSync } from 'fs';
import { CONFIG } from './config.js';

/**
 * Parse Granola's cache file and extract meetings
 */
export function loadGranolaData() {
  if (!existsSync(CONFIG.granolaCachePath)) {
    console.error(`Granola cache not found at: ${CONFIG.granolaCachePath}`);
    return { meetings: [], lastModified: null };
  }

  try {
    const raw = readFileSync(CONFIG.granolaCachePath, 'utf-8');
    const data = JSON.parse(raw);

    // Extract meetings from the cache structure
    const meetings = extractMeetings(data);

    return {
      meetings,
      lastModified: new Date(),
    };
  } catch (error) {
    console.error('Error reading Granola cache:', error.message);
    return { meetings: [], lastModified: null };
  }
}

/**
 * Extract and normalize meetings from Granola cache structure
 */
function extractMeetings(data) {
  const meetings = [];

  // Granola stores documents in various places in the cache
  // The structure includes documents, panels, transcripts, etc.

  // Try to find documents/meetings in common locations
  const docs = data.documents || data.docs || data.meetings || [];

  // Also check for a flat structure with document entries
  if (Array.isArray(docs)) {
    for (const doc of docs) {
      const meeting = normalizeMeeting(doc);
      if (meeting) {
        meetings.push(meeting);
      }
    }
  }

  // Check if data itself is an array of meetings
  if (Array.isArray(data)) {
    for (const item of data) {
      const meeting = normalizeMeeting(item);
      if (meeting) {
        meetings.push(meeting);
      }
    }
  }

  // Check for nested document structure
  if (data.data && typeof data.data === 'object') {
    for (const key of Object.keys(data.data)) {
      const item = data.data[key];
      if (item && typeof item === 'object') {
        const meeting = normalizeMeeting(item);
        if (meeting) {
          meetings.push(meeting);
        }
      }
    }
  }

  // Sort by date, newest first
  meetings.sort((a, b) => new Date(b.date) - new Date(a.date));

  return meetings;
}

/**
 * Normalize a meeting object to a consistent structure
 */
function normalizeMeeting(doc) {
  if (!doc || typeof doc !== 'object') {
    return null;
  }

  // Skip non-meeting items
  if (doc.type && !['document', 'meeting', 'note'].includes(doc.type)) {
    return null;
  }

  const id = doc.id || doc.documentId || doc.uuid || generateId();
  const title = doc.title || doc.name || doc.subject || 'Untitled Meeting';
  const date = doc.createdAt || doc.created_at || doc.date || doc.startTime || new Date().toISOString();

  // Extract notes/content from panels or direct content
  let notes = '';
  if (doc.panels && Array.isArray(doc.panels)) {
    notes = doc.panels
      .map(p => p.content || p.text || p.notes || '')
      .filter(Boolean)
      .join('\n\n');
  } else if (doc.notes) {
    notes = typeof doc.notes === 'string' ? doc.notes : JSON.stringify(doc.notes);
  } else if (doc.content) {
    notes = typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content);
  } else if (doc.enhancedNotes) {
    notes = doc.enhancedNotes;
  }

  // Extract transcript if available
  let transcript = '';
  if (doc.transcript) {
    if (typeof doc.transcript === 'string') {
      transcript = doc.transcript;
    } else if (Array.isArray(doc.transcript)) {
      transcript = doc.transcript
        .map(t => `${t.speaker || 'Speaker'}: ${t.text || t.content || ''}`)
        .join('\n');
    }
  } else if (doc.transcripts && Array.isArray(doc.transcripts)) {
    transcript = doc.transcripts
      .map(t => `${t.speaker || 'Speaker'}: ${t.text || t.content || ''}`)
      .join('\n');
  }

  // Extract participants
  let participants = [];
  if (doc.participants && Array.isArray(doc.participants)) {
    participants = doc.participants.map(p => p.name || p.email || p);
  } else if (doc.attendees && Array.isArray(doc.attendees)) {
    participants = doc.attendees.map(p => p.name || p.email || p);
  } else if (doc.people && Array.isArray(doc.people)) {
    participants = doc.people.map(p => p.name || p.email || p);
  }

  // Only include if there's meaningful content
  if (!notes && !transcript) {
    return null;
  }

  return {
    id,
    title,
    date,
    notes,
    transcript,
    participants,
    raw: doc, // Keep raw data for debugging
  };
}

function generateId() {
  return `meeting_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get a specific meeting by ID
 */
export function getMeetingById(meetingId) {
  const { meetings } = loadGranolaData();
  return meetings.find(m => m.id === meetingId);
}

/**
 * Get meetings after a certain date
 */
export function getMeetingsSince(date) {
  const { meetings } = loadGranolaData();
  const sinceDate = new Date(date);
  return meetings.filter(m => new Date(m.date) > sinceDate);
}
