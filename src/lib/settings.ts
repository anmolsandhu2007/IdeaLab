import { DEFAULT_MODEL } from './models';
import { accessConfig } from './auth';
import { databaseConfig } from './database-config';
export { DEFAULT_MODEL } from './models';
const state = globalThis as unknown as { ideaSettings?: { key: string; model: string } };
export function getSettings() {
  return { key: state.ideaSettings?.key || process.env.NVIDIA_API_KEY || '',
    model: state.ideaSettings?.model || process.env.NVIDIA_MODEL || DEFAULT_MODEL };
}
export function saveSettings(key: string, model: string) { state.ideaSettings = { key, model }; }
export function publicSettings() {
  const { key, model } = getSettings();
  return { configured: !!key, model, search: process.env.TAVILY_API_KEY ? 'tavily' : 'bing-rss',
    storage: databaseConfig().mode === 'turso' ? 'Turso' : 'Local SQLite',
    authRequired: accessConfig().enabled,
    mode: accessConfig().enabled ? 'Shared password-protected workspace' : 'Local single-user prototype' };
}
