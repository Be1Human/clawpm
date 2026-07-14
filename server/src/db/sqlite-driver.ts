// SQLite 驱动封装。
//
// 打包说明：目标平台为 Windows 本地 exe。原计划用 bun build --compile 单文件打包，但实测
// Fastify 5.7.4 在 Bun 1.3.14 (Windows) 下 listen 后无法接受连接（bun 自身 fetch 亦连不上，
// 同代码在 Node 下正常），故服务端走 Node 运行时 + better-sqlite3。打包见 scripts/build-exe。
//
// 这里保留最小 SqliteDb 接口抽象：export/import/vault-store 通过它操作原始句柄，
// 便于未来更换驱动，不与具体实现耦合。

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

/** 两个驱动共有的最小 SQLite 接口（结构兼容 better-sqlite3） */
export interface SqliteStmt {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}
export interface SqliteDb {
  prepare(sql: string): SqliteStmt;
  exec(sql: string): unknown;
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;
  close(): void;
}

export interface OpenOptions {
  readonly?: boolean;
}

export type DrizzleDb = BetterSQLite3Database<typeof schema>;

/** 打开数据库（文件路径或 ':memory:'） */
export function openDatabase(path: string, opts?: OpenOptions): SqliteDb {
  return new Database(
    path,
    opts?.readonly ? { readonly: true, fileMustExist: true } : {}
  ) as unknown as SqliteDb;
}

/** 用 drizzle 适配器包裹句柄 */
export function createDrizzle(db: SqliteDb): DrizzleDb {
  return drizzle(db as never, { schema });
}
