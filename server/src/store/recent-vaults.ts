// 最近打开的需求库列表（应用私有数据，存用户目录，不入任何 git 仓库）。
//
// 用途：
// - 双击 exe（无参数）时打开上次的库，而不是把程序目录当成库
// - 应用内「切换项目」下拉列表的数据源

import fs from 'fs';
import os from 'os';
import path from 'path';
import { isVaultDir } from './files.js';

export interface RecentVault {
  path: string;
  name: string;
  lastOpenedAt: string;
}

function appDataDir(): string {
  const base =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'clawpm');
}

function listFile(): string {
  return path.join(appDataDir(), 'vaults.json');
}

/** 读取最近列表；自动剔除已被删除/不再是库的条目 */
export function listRecentVaults(): RecentVault[] {
  try {
    const raw = JSON.parse(fs.readFileSync(listFile(), 'utf8')) as RecentVault[];
    if (!Array.isArray(raw)) return [];
    return raw.filter((v) => v && typeof v.path === 'string' && isVaultDir(v.path));
  } catch {
    return [];
  }
}

/** 记录一次打开（置顶、去重，最多保留 10 条） */
export function rememberVault(dir: string, name: string): void {
  try {
    const abs = path.resolve(dir);
    const rest = listRecentVaults().filter(
      (v) => path.resolve(v.path).toLowerCase() !== abs.toLowerCase()
    );
    const next: RecentVault[] = [
      { path: abs, name, lastOpenedAt: new Date().toISOString() },
      ...rest,
    ].slice(0, 10);
    fs.mkdirSync(appDataDir(), { recursive: true });
    fs.writeFileSync(listFile(), JSON.stringify(next, null, 2), 'utf8');
  } catch {
    /* 最近列表只是便利功能，写不了不应影响启动 */
  }
}

/** 最近一次打开且仍有效的库 */
export function lastVault(): RecentVault | null {
  return listRecentVaults()[0] ?? null;
}
