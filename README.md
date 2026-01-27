# Granola → Linear Integration

Automatically extract action items from your Granola meeting notes and create Linear issues.

## Features

- **Auto-detection**: Watches Granola's local cache for new meetings
- **AI extraction**: Uses GPT-4o to identify action items, assignees, priorities, and deadlines
- **Review UI**: Local web interface to approve/reject items before creating issues
- **Bulk operations**: Approve or reject multiple items at once
- **Customizable**: Configure the AI extraction prompt via the web UI

## How It Works

```
Granola Meeting → AI Extraction → Review UI → Linear Issues
```

1. The tool watches Granola's local cache file for new meetings
2. When a new meeting is detected, GPT-4o extracts action items
3. Items appear in the local web UI for your review
4. Approve items and create Linear issues with one click

## Setup

### Prerequisites

- Node.js 18+
- [Granola](https://granola.ai) installed with at least one meeting recorded
- OpenAI API key
- Linear API key

### Installation

```bash
# Clone or download this project
cd granola-linear-integration

# Install dependencies
npm install

# Copy the example environment file
cp .env.example .env

# Edit .env with your API keys
```

### Configuration

Edit `.env` with your credentials:

```env
# Required
OPENAI_API_KEY=sk-...
LINEAR_API_KEY=lin_api_...

# Optional
LINEAR_TEAM_ID=          # Set to skip team selection
PORT=3847                # Web UI port
POLL_INTERVAL=30         # Check for new meetings every N seconds
```

### Getting API Keys

**OpenAI:**
1. Go to https://platform.openai.com/api-keys
2. Create a new API key

**Linear:**
1. Go to https://linear.app/settings/api
2. Create a "Personal API key"

## Usage

### Start the Service

```bash
npm start
```

This will:
- Start watching Granola for new meetings
- Launch the review web UI at http://localhost:3847
- Automatically process any unprocessed meetings

### Web Interface

Open http://localhost:3847 in your browser:

- **Pending Review**: New action items waiting for your approval
- **Approved**: Items ready to be created in Linear
- **Created**: Items that have been turned into Linear issues
- **Meetings**: View all detected meetings from Granola

### Workflow

1. Have a meeting with Granola running
2. The tool will automatically detect and process the meeting
3. Review extracted action items in the web UI
4. Approve relevant items and reject irrelevant ones
5. Click "Create All Approved Issues in Linear"

## Customization

### AI Extraction Prompt

You can customize the AI prompt used to extract action items:

1. Click "Settings" in the web UI
2. Edit the "AI Extraction Prompt" field
3. Click "Save Settings"

The default prompt looks for:
- Explicit commitments ("I will...", "Let's...")
- Assigned tasks ("Can you...", "[Name] will...")
- Follow-ups and next steps
- Decisions requiring implementation

### Manual Processing

To manually process a specific meeting:
1. Go to the "Meetings" tab
2. Click "Process" on any unprocessed meeting

## Data Storage

- **Granola data**: Read from `~/Library/Application Support/Granola/cache-v3.json`
- **Local data**: Stored in `./data/store.json` (processed meetings, action items, settings)

## Troubleshooting

### "Granola cache not found"

Make sure:
- Granola is installed
- You've recorded at least one meeting
- The cache file exists at `~/Library/Application Support/Granola/cache-v3.json`

### No action items extracted

- Check that the meeting has notes or a transcript
- Try customizing the AI prompt in Settings
- Verify your OpenAI API key is valid

### Linear issues not creating

- Verify your Linear API key is valid
- Check that you've selected a team in Settings

## API Endpoints

The server exposes a REST API for programmatic access:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check and connection status |
| `/api/meetings` | GET | List all Granola meetings |
| `/api/meetings/:id/process` | POST | Process a specific meeting |
| `/api/action-items` | GET | List all action items |
| `/api/action-items/pending` | GET | Get items pending review |
| `/api/action-items/:id/approve` | POST | Approve an item |
| `/api/action-items/:id/reject` | POST | Reject an item |
| `/api/action-items/:id/create-issue` | POST | Create Linear issue |
| `/api/action-items/create-all` | POST | Create all approved issues |
| `/api/settings` | GET/PATCH | View/update settings |

## License

MIT
