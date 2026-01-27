import Anthropic from '@anthropic-ai/sdk';
import { CONFIG } from './config.js';

const anthropic = new Anthropic({
  apiKey: CONFIG.anthropicApiKey,
});

const DEFAULT_PROMPT = `You are an expert at analyzing meeting notes and transcripts to extract actionable items.

Analyze the following meeting content and extract all action items, tasks, and commitments.

For each action item, provide:
1. A clear, concise title (suitable for a Linear issue title)
2. A description with context from the meeting
3. The assignee if mentioned (or "Unassigned" if not clear)
4. Priority (High, Medium, Low) based on urgency signals in the conversation
5. Any mentioned deadline or timeframe

Focus on:
- Explicit commitments ("I will...", "Let's...", "We need to...")
- Assigned tasks ("Can you...", "Please...", "[Name] will...")
- Follow-ups and next steps
- Decisions that require implementation

Ignore:
- General discussion points without clear actions
- Questions without resolution
- Past completed items

Return your response as a JSON array of action items with this structure:
{
  "actionItems": [
    {
      "title": "string",
      "description": "string",
      "assignee": "string",
      "priority": "High" | "Medium" | "Low",
      "deadline": "string or null"
    }
  ]
}

If no action items are found, return: { "actionItems": [] }`;

/**
 * Extract action items from meeting content using Claude
 */
export async function extractActionItems(meeting, customPrompt = null) {
  const prompt = customPrompt || DEFAULT_PROMPT;

  // Combine notes and transcript for analysis
  let content = `Meeting: ${meeting.title}\n`;
  content += `Date: ${new Date(meeting.date).toLocaleDateString()}\n`;

  if (meeting.participants && meeting.participants.length > 0) {
    content += `Participants: ${meeting.participants.join(', ')}\n`;
  }

  content += '\n--- MEETING NOTES ---\n';
  content += meeting.notes || '(No notes available)';

  if (meeting.transcript) {
    content += '\n\n--- TRANSCRIPT ---\n';
    content += meeting.transcript;
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        { role: 'user', content: `${prompt}\n\n${content}` },
      ],
    });

    // Extract JSON from Claude's response
    const responseText = response.content[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const result = JSON.parse(jsonMatch[0]);

    // Add meeting context to each action item
    const actionItems = (result.actionItems || []).map((item, index) => ({
      ...item,
      id: `${meeting.id}_action_${index}`,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      meetingDate: meeting.date,
      extractedAt: new Date().toISOString(),
      status: 'pending_review', // pending_review, approved, rejected, created
    }));

    return actionItems;
  } catch (error) {
    console.error('Error extracting action items:', error.message);
    throw error;
  }
}

/**
 * Get the default extraction prompt
 */
export function getDefaultPrompt() {
  return DEFAULT_PROMPT;
}
