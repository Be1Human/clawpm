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
  // CLAWPM_APPDATA 让测试/临时实例把最近列表写到别处：
  // 否则跑一次测试就会把临时库顶到列表首位，用户双击 exe 打开的就成了测试库。
  const override = process.env.CLAWPM_APPDATA;
  if (override) return override;
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(base, 'clawpm');
}

/**
 * 临时目录下的库不进最近列表：它们是测试/一次性产物，
 * 混进来会顶掉用户的真实项目（双击 exe 打开的是最近一个）。
 */
function isTransientVault(dir: string): boolean {
  const abs = path.resolve(dir).toLowerCase();
  const tmp = path.resolve(os.tmpdir()).toLowerCase();
  return abs.startsWith(tmp);
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

/** 记录一次打开（置顶、去重，最多保留 10 条）。临时目录下的库不记录 */
export function rememberVault(dir: string, name: string): void {
  try {
    const abs = path.resolve(dir);
    if (isTransientVault(abs)) return;
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
