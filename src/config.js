import { config } from 'dotenv';
import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

config();

// Auto-detect Granola cache path based on platform
function getGranolaCachePath() {
  if (process.env.GRANOLA_CACHE_PATH) {
    return process.env.GRANOLA_CACHE_PATH;
  }

  const platform = process.platform;
  let cachePath;

  if (platform === 'darwin') {
    cachePath = join(homedir(), 'Library', 'Application Support', 'Granola', 'cache-v3.json');
  } else if (platform === 'win32') {
    cachePath = join(process.env.APPDATA || '', 'Granola', 'cache-v3.json');
  } else {
    cachePath = join(homedir(), '.config', 'Granola', 'cache-v3.json');
  }

  return cachePath;
}

export const CONFIG = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  linearApiKey: process.env.LINEAR_API_KEY,
  linearTeamId: process.env.LINEAR_TEAM_ID || null,
  port: parseInt(process.env.PORT || '3847', 10),
  granolaCachePath: getGranolaCachePath(),
  pollInterval: parseInt(process.env.POLL_INTERVAL || '30', 10) * 1000,
  dataDir: join(process.cwd(), 'data'),
};

export function validateConfig() {
  const errors = [];

  if (!CONFIG.openaiApiKey) {
    errors.push('OPENAI_API_KEY is required');
  }

  if (!CONFIG.linearApiKey) {
    errors.push('LINEAR_API_KEY is required');
  }

  if (!existsSync(CONFIG.granolaCachePath)) {
    console.warn(`⚠️  Granola cache not found at: ${CONFIG.granolaCachePath}`);
    console.warn('   Make sure Granola is installed and has recorded at least one meeting.');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(e => console.error(`  - ${e}`));
    console.error('\nPlease copy .env.example to .env and fill in the required values.');
    process.exit(1);
  }

  return true;
}
