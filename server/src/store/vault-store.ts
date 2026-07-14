// VaultStore —— 文本 vault 作为持久化真源，:memory: SQLite 作为查询引擎。
//
// 数据流：
//   启动  vault 分片 JSON ──insertVaultData──> :memory: 完整 schema（service 层零改动）
//   读    service/drizzle 查询内存库
//   写    service 写内存库 → markDirty() → debounce → dump 内存库回 vault 分片（差量落盘）
//
// 取舍：内存库与文本文件存在防抖窗口内的漂移，进程退出前 flush()，崩溃后以文本为准重载。
// vault 只承载需求树（tasks/domains/milestones/fields/links + notes/history/attachments）；
// 运行时创建的协作数据（members/notifications 等）仅存于内存，重启即失——这些正是 Step 3 将裁剪的功能。

import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { runMigrations } from '../db/connection.js';
import { collectVaultData } from './export-vault.js';
import { insertVaultData } from './import-vault.js';
import { isVaultDir, loadVault, syncVault, CONFIG_FILE, atomicWriteFile } from './files.js';
import { stringifyConfig } from './canonical.js';
import { DEFAULT_WORKFLOW, VAULT_FORMAT, type VaultConfig } from './types.js';

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

const FLUSH_DEBOUNCE_MS = 300;

export class VaultStore {
  readonly sqlite: Database.Database;
  readonly db: DrizzleDb;
  private readonly dir: string;
  private readonly slug: string;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  private constructor(sqlite: Database.Database, dir: string, slug: string) {
    this.sqlite = sqlite;
    this.dir = dir;
    this.slug = slug;
    this.db = drizzle(sqlite, { schema });
  }

  /**
   * 打开 vault：建 :memory: 完整 schema，从 vault 文件加载数据。
   * vault 不存在则初始化一个空 vault（写入 clawpm.json）。
   */
  static open(dir: string, slug: string): VaultStore {
    if (!dir) throw new Error('storage=vault 需要 CLAWPM_VAULT 指定 vault 目录');
    const absDir = path.resolve(dir);

    if (!isVaultDir(absDir)) {
      // 初始化空 vault：仅写标识文件，其余文件在首次落盘时生成
      const config: VaultConfig = {
        format: VAULT_FORMAT,
        name: slug === 'default' ? 'ClawPM' : slug,
        workflow: DEFAULT_WORKFLOW,
      };
      atomicWriteFile(path.join(absDir, CONFIG_FILE), stringifyConfig(config));
      console.log(`[vault] 初始化新 vault: ${absDir}`);
    }

    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);

    const warnings: string[] = [];
    const vault = loadVault(absDir);
    warnings.push(...vault.warnings);
    insertVaultData(sqlite, vault, slug, warnings);
    for (const w of warnings) console.warn(`[vault] ⚠ ${w}`);
    console.log(
      `[vault] 已加载 ${vault.tasks.length} 个任务 / ${vault.domains.length} 域 / ${vault.links.length} 关联（来自 ${absDir}）`
    );

    return new VaultStore(sqlite, absDir, slug);
  }

  /** 标记有写入，安排一次防抖落盘 */
  markDirty(): void {
    if (this.closed) return;
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, FLUSH_DEBOUNCE_MS);
    // 防抖计时器不应阻止进程退出（退出钩子会主动 flush）
    if (typeof this.timer === 'object' && this.timer && 'unref' in this.timer) {
      (this.timer as { unref: () => void }).unref();
    }
  }

  /** 立即把内存库 dump 回 vault（差量落盘）。进程退出/切 vault 前调用 */
  flush(): void {
    if (this.closed || !this.dirty) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      const { data } = collectVaultData(this.sqlite, this.slug);
      const { changed, removed } = syncVault(this.dir, data);
      this.dirty = false;
      if (changed.length || removed.length) {
        console.log(`[vault] 落盘: 更新 ${changed.length} 个文件, 删除 ${removed.length} 个孤儿分片`);
      }
    } catch (e) {
      // 落盘失败保留 dirty，下次写入或退出时重试；不因落盘错误影响请求
      console.error(`[vault] 落盘失败（将在下次写入时重试）: ${(e as Error).message}`);
    }
  }

  close(): void {
    this.flush();
    this.closed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.sqlite.close();
  }
}

// ── 单例（供 connection.ts 与落盘钩子共享） ─────────────────────
let _store: VaultStore | null = null;

export function openVaultStore(dir: string, slug: string): VaultStore {
  if (_store) return _store;
  _store = VaultStore.open(dir, slug);
  return _store;
}

export function getVaultStore(): VaultStore | null {
  return _store;
}

/** 有写操作后调用，触发防抖落盘（storage=sqlite 时无副作用） */
export function markVaultDirty(): void {
  _store?.markDirty();
}

/** 进程退出/切换前立即落盘 */
export function flushVaultStore(): void {
  _store?.flush();
}
