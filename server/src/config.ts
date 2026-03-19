import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function normalizeBasePath(input?: string) {
  if (!input || input === '/') return '';
  let value = input.trim();
  if (!value || value === '/') return '';
  if (!value.startsWith('/')) value = `/${value}`;
  if (value.endsWith('/')) value = value.slice(0, -1);
  return value;
}

export const config = {
  port: parseInt(process.env.CLAWPM_PORT || '3210'),
  dbPath: process.env.CLAWPM_DB_PATH || path.join(__dirname, '../../data/clawpm.db'),
  apiToken: process.env.CLAWPM_API_TOKEN || 'dev-token',
  logLevel: (process.env.CLAWPM_LOG_LEVEL || 'info') as 'trace' | 'debug' | 'info' | 'warn' | 'error',
  webDistPath: path.join(__dirname, '../../web/dist'),
  basePath: normalizeBasePath(process.env.CLAWPM_BASE_PATH),
  isDev: process.env.NODE_ENV !== 'production',
};
