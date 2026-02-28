import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: parseInt(process.env.CLAWPM_PORT || '3210'),
  dbPath: process.env.CLAWPM_DB_PATH || path.join(__dirname, '../../data/clawpm.db'),
  apiToken: process.env.CLAWPM_API_TOKEN || 'dev-token',
  logLevel: (process.env.CLAWPM_LOG_LEVEL || 'info') as 'trace' | 'debug' | 'info' | 'warn' | 'error',
  webDistPath: path.join(__dirname, '../../web/dist'),
  isDev: process.env.NODE_ENV !== 'production',
};
