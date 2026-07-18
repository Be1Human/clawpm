import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 编译为单 exe（bun build --compile）时 __dirname 是不存在于磁盘的虚拟路径；
// 此时资源（web、data）位于 exe 同级目录，开发时相对源码目录
const isBunRuntime = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined';
const isCompiled = isBunRuntime && !fs.existsSync(__dirname);
const assetBase =
  process.env.CLAWPM_HOME || (isCompiled ? path.dirname(process.execPath) : path.join(__dirname, '../..'));

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
  dataDir: process.env.CLAWPM_DATA_DIR || path.join(assetBase, 'data'),
  apiToken: process.env.CLAWPM_API_TOKEN || 'dev-token',
  logLevel: (process.env.CLAWPM_LOG_LEVEL || 'info') as 'trace' | 'debug' | 'info' | 'warn' | 'error',
  webDistPath: process.env.CLAWPM_WEB_DIST || path.join(assetBase, isCompiled ? 'web' : 'web/dist'),
  basePath: normalizeBasePath(process.env.CLAWPM_BASE_PATH),
  publicUrl: process.env.CLAWPM_PUBLIC_URL || '',  // 外部可访问地址，如 https://clawpm.example.com
  isDev: process.env.NODE_ENV !== 'production',
  // 文本 Vault 是唯一的持久化真源；内存 SQLite 只用作查询引擎。
  vaultDir: process.env.CLAWPM_VAULT || path.join(assetBase, 'data', 'vault'),
  vaultProject: process.env.CLAWPM_VAULT_PROJECT || 'default', // vault 内容映射到的项目 slug
};
