import { LinearClient } from '@linear/sdk';
import { CONFIG } from './config.js';

let linearClient = null;
let cachedTeams = null;

/**
 * Get or create Linear client
 */
function getClient() {
  if (!linearClient) {
    linearClient = new LinearClient({
      apiKey: CONFIG.linearApiKey,
    });
  }
  return linearClient;
}

/**
 * Get available teams from Linear
 */
export async function getTeams() {
  if (cachedTeams) {
    return cachedTeams;
  }

  const client = getClient();
  const teams = await client.teams();
  cachedTeams = teams.nodes.map(team => ({
    id: team.id,
    name: team.name,
    key: team.key,
  }));

  return cachedTeams;
}

/**
 * Get team by ID or use configured default
 */
export async function getTeam(teamId = null) {
  const id = teamId || CONFIG.linearTeamId;
  const teams = await getTeams();

  if (id) {
    const team = teams.find(t => t.id === id);
    if (team) return team;
  }

  // Return first team if no specific team configured
  return teams[0];
}

/**
 * Map priority string to Linear priority number
 */
function mapPriority(priority) {
  const priorityMap = {
    'High': 1,      // Urgent
    'Medium': 2,    // High
    'Low': 3,       // Medium
  };
  return priorityMap[priority] || 3;
}

/**
 * Create a Linear issue from an action item
 */
export async function createIssue(actionItem, teamId = null) {
  const client = getClient();
  const team = await getTeam(teamId);

  if (!team) {
    throw new Error('No Linear team found. Please configure LINEAR_TEAM_ID in .env');
  }

  // Build issue description with meeting context
  let description = actionItem.description || '';
  description += '\n\n---\n';
  description += `📅 From meeting: **${actionItem.meetingTitle}**\n`;
  description += `📆 Meeting date: ${new Date(actionItem.meetingDate).toLocaleDateString()}\n`;

  if (actionItem.assignee && actionItem.assignee !== 'Unassigned') {
    description += `👤 Mentioned assignee: ${actionItem.assignee}\n`;
  }

  if (actionItem.deadline) {
    description += `⏰ Deadline: ${actionItem.deadline}\n`;
  }

  description += '\n*Created automatically from Granola meeting notes*';

  const issuePayload = {
    teamId: team.id,
    title: actionItem.title,
    description: description,
    priority: mapPriority(actionItem.priority),
  };

  try {
    const issue = await client.createIssue(issuePayload);

    // Wait for the issue to be created and get its details
    const createdIssue = await issue.issue;

    return {
      id: createdIssue.id,
      identifier: createdIssue.identifier,
      title: createdIssue.title,
      url: createdIssue.url,
      teamKey: team.key,
    };
  } catch (error) {
    console.error('Error creating Linear issue:', error.message);
    throw error;
  }
}

/**
 * Create multiple issues from action items
 */
export async function createIssues(actionItems, teamId = null) {
  const results = [];

  for (const item of actionItems) {
    try {
      const issue = await createIssue(item, teamId);
      results.push({
        actionItemId: item.id,
        success: true,
        issue,
      });
    } catch (error) {
      results.push({
        actionItemId: item.id,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Test Linear connection
 */
export async function testConnection() {
  try {
    const client = getClient();
    const viewer = await client.viewer;
    return {
      connected: true,
      user: {
        id: viewer.id,
        name: viewer.name,
        email: viewer.email,
      },
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
    };
  }
}
