import { getDb } from '../db/connection.js';
import { tasks, backlogItems, domains } from '../db/schema.js';
import { eq, and, like, desc, sql } from 'drizzle-orm';

/** 互斥锁：确保同一时间只有一个请求在生成 ID */
let _idLock: Promise<void> = Promise.resolve();

export async function generateTaskId(domainId?: number, _projectId?: number): Promise<string> {
  // 串行化 ID 生成，避免并发竞态产生重复 ID
  let resolve: () => void;
  const prev = _idLock;
  _idLock = new Promise<void>(r => { resolve = r; });
  await prev;

  try {
    return _doGenerateTaskId(domainId);
  } finally {
    resolve!();
  }
}

function _doGenerateTaskId(domainId?: number): string {
  const db = getDb();
  let prefix = 'T';

  if (domainId) {
    const domain = db.select().from(domains).where(eq(domains.id, domainId)).get();
    if (domain) prefix = domain.taskPrefix;
  }

  // 全局（跨项目）查找该前缀下的最大编号
  // task_id 的 UNIQUE 约束是全局的，所以必须在全局范围内查找最大编号
  const rows = db
    .select({ taskId: tasks.taskId })
    .from(tasks)
    .where(like(tasks.taskId, `${prefix}-%`))
    .all();

  let maxNum = 0;
  for (const row of rows) {
    const dashIdx = row.taskId.lastIndexOf('-');
    if (dashIdx >= 0) {
      const num = parseInt(row.taskId.slice(dashIdx + 1) || '0', 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }

  const newId = `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;

  // 安全检查：确认生成的 ID 确实不存在（防御性编程）
  const existing = db.select({ taskId: tasks.taskId }).from(tasks).where(eq(tasks.taskId, newId)).get();
  if (existing) {
    // 极端情况：如果还是冲突了（比如数据不一致），继续递增直到找到可用 ID
    let num = maxNum + 2;
    while (true) {
      const candidateId = `${prefix}-${String(num).padStart(3, '0')}`;
      const dup = db.select({ taskId: tasks.taskId }).from(tasks).where(eq(tasks.taskId, candidateId)).get();
      if (!dup) return candidateId;
      num++;
      if (num > maxNum + 100) throw new Error(`ID 生成失败：前缀 ${prefix} 下连续 100 个编号都被占用`);
    }
  }

  return newId;
}

export async function generateBacklogId(_projectId?: number): Promise<string> {
  // 同样串行化
  let resolve: () => void;
  const prev = _idLock;
  _idLock = new Promise<void>(r => { resolve = r; });
  await prev;

  try {
    return _doGenerateBacklogId();
  } finally {
    resolve!();
  }
}

function _doGenerateBacklogId(): string {
  const db = getDb();

  // 全局查找，backlog_id 同样有 UNIQUE 约束
  const rows = db.select({ backlogId: backlogItems.backlogId }).from(backlogItems).all();

  let maxNum = 0;
  for (const row of rows) {
    const num = parseInt(row.backlogId.split('-')[1] || '0', 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }

  const newId = `BL-${String(maxNum + 1).padStart(3, '0')}`;

  // 防御性检查
  const existing = db.select({ backlogId: backlogItems.backlogId }).from(backlogItems).where(eq(backlogItems.backlogId, newId)).get();
  if (existing) {
    let num = maxNum + 2;
    while (true) {
      const candidateId = `BL-${String(num).padStart(3, '0')}`;
      const dup = db.select({ backlogId: backlogItems.backlogId }).from(backlogItems).where(eq(backlogItems.backlogId, candidateId)).get();
      if (!dup) return candidateId;
      num++;
      if (num > maxNum + 100) throw new Error('Backlog ID 生成失败：连续 100 个编号都被占用');
    }
  }

  return newId;
}
