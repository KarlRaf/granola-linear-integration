# Quick Setup Guide

## 1. Push to GitHub

Run these commands in your terminal:

```bash
# Navigate to the project folder (after downloading from Cowork)
cd granola-linear-integration

# Initialize and push to GitHub
git init
git add .
git commit -m "Initial commit: Granola to Linear integration"
git branch -M main

# Create repo and push (requires GitHub CLI)
gh repo create granola-linear-integration --public --source=. --push

# Or if you prefer to create the repo manually on github.com:
# git remote add origin https://github.com/KarlRaf/granola-linear-integration.git
# git push -u origin main
```

## 2. Get Your OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)

## 3. Configure and Run

```bash
# Install dependencies
npm install

# Create your .env file
cp .env.example .env

# Edit .env and add your keys:
# OPENAI_API_KEY=sk-...
# LINEAR_API_KEY=lin_api_...

# Start the service
npm start
```

## 4. Test It

1. Open http://localhost:3847
2. Make sure Granola has at least one meeting recorded
3. Check the "Meetings" tab to see detected meetings
4. Click "Process" on any meeting to extract action items
