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
  publicUrl: process.env.CLAWPM_PUBLIC_URL || '',  // 外部可访问地址，如 https://clawpm.example.com
  isDev: process.env.NODE_ENV !== 'production',
  // 存储引擎：'sqlite'（默认，文件 SQLite）| 'vault'（文本 vault，:memory: 镜像 + 落盘）
  storage: (process.env.CLAWPM_STORAGE || 'sqlite') as 'sqlite' | 'vault',
  vaultDir: process.env.CLAWPM_VAULT || '',        // vault 根目录（storage=vault 时必填）
  vaultProject: process.env.CLAWPM_VAULT_PROJECT || 'default', // vault 内容映射到的项目 slug
};
