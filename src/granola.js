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

  // Granola v3 cache structure: { cache: JSON string with { state: { documents: {...}, transcripts: {...} } } }
  let docs = {};
  let transcripts = {};

  // Handle nested cache string structure (Granola v3)
  if (data.cache && typeof data.cache === 'string') {
    try {
      const inner = JSON.parse(data.cache);
      if (inner.state) {
        if (inner.state.documents) {
          docs = inner.state.documents;
        }
        if (inner.state.transcripts) {
          transcripts = inner.state.transcripts;
        }
      }
    } catch (e) {
      console.error('Failed to parse inner cache:', e.message);
    }
  }

  // Fallback: Try direct locations
  if (Object.keys(docs).length === 0) {
    docs = data.documents || data.docs || data.meetings || {};
  }

  // Handle docs as object (keyed by ID) or array
  const docList = Array.isArray(docs) ? docs : Object.values(docs);

  for (const doc of docList) {
    // Merge transcript if available (transcripts are keyed by document_id)
    const docTranscript = transcripts[doc.id];
    const meeting = normalizeMeeting(doc, docTranscript);
    if (meeting) {
      meetings.push(meeting);
    }
  }

  // Sort by date, newest first
  meetings.sort((a, b) => new Date(b.date) - new Date(a.date));

  return meetings;
}

/**
 * Normalize a meeting object to a consistent structure
 * @param {Object} doc - The document object
 * @param {Array} externalTranscript - Transcript array from state.transcripts (optional)
 */
function normalizeMeeting(doc, externalTranscript = null) {
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

  // Extract notes - prefer markdown/plain versions over structured JSON
  let notes = '';
  if (doc.notes_markdown) {
    notes = doc.notes_markdown;
  } else if (doc.notes_plain) {
    notes = doc.notes_plain;
  } else if (doc.panels && Array.isArray(doc.panels)) {
    notes = doc.panels
      .map(p => p.content || p.text || p.notes || '')
      .filter(Boolean)
      .join('\n\n');
  } else if (doc.notes && typeof doc.notes === 'string') {
    notes = doc.notes;
  } else if (doc.content) {
    notes = typeof doc.content === 'string' ? doc.content : '';
  } else if (doc.enhancedNotes) {
    notes = doc.enhancedNotes;
  }

  // Extract transcript - check external transcript first (from state.transcripts)
  let transcript = '';
  if (externalTranscript && Array.isArray(externalTranscript)) {
    transcript = externalTranscript
      .map(t => t.text || '')
      .filter(Boolean)
      .join(' ');
  } else if (doc.transcript) {
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

  // Extract participants from calendar event or people
  let participants = [];
  if (doc.google_calendar_event?.attendees) {
    participants = doc.google_calendar_event.attendees
      .map(a => a.email || a.displayName || '')
      .filter(Boolean);
  } else if (doc.participants && Array.isArray(doc.participants)) {
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
