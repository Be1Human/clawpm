/**
 * 需求关联服务
 * 支持三种关联类型：
 *   blocks   - 阻塞依赖（单向，B blocks A → B 必须先完成）
 *   precedes - 顺序依赖（单向，推荐先做 B 再做 A）
 *   relates  - 弱关联（双向，主题相关）
 */
import { eq, or, and } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { reqLinks, tasks } from '../db/schema.js';

export const ReqLinkService = {
  /** 获取某任务（数字 id）相关的所有关联 */
  getLinksForTask(taskId: number) {
    const db = getDb();
    return db.select().from(reqLinks)
      .where(or(eq(reqLinks.sourceTaskId, taskId), eq(reqLinks.targetTaskId, taskId)))
      .all();
  },

  /** 获取全部关联（用于思维导图） */
  getAll() {
    const db = getDb();
    return db.select().from(reqLinks).all();
  },

  /** 创建关联，同时检测循环依赖 */
  create(sourceTaskId: string, targetTaskId: string, linkType: string) {
    const db = getDb();
    const src = db.select().from(tasks).where(eq(tasks.taskId, sourceTaskId)).get();
    const tgt = db.select().from(tasks).where(eq(tasks.taskId, targetTaskId)).get();
    if (!src || !tgt) throw new Error('节点不存在');
    if (src.id === tgt.id) throw new Error('不能关联自己');

    // 对 blocks / precedes 检测循环依赖
    if (linkType === 'blocks' || linkType === 'precedes') {
      if (this._hasCycle(src.id, tgt.id, linkType)) {
        throw new Error('循环依赖：该关联会形成环路，已拒绝');
      }
    }

    // 避免重复
    const existing = db.select().from(reqLinks)
      .where(and(
        eq(reqLinks.sourceTaskId, src.id),
        eq(reqLinks.targetTaskId, tgt.id),
        eq(reqLinks.linkType, linkType),
      )).get();
    if (existing) return existing;

    db.insert(reqLinks).values({
      sourceTaskId: src.id,
      targetTaskId: tgt.id,
      linkType,
    }).run();

    return db.select().from(reqLinks)
      .where(and(
        eq(reqLinks.sourceTaskId, src.id),
        eq(reqLinks.targetTaskId, tgt.id),
        eq(reqLinks.linkType, linkType),
      )).get()!;
  },

  delete(linkId: number) {
    const db = getDb();
    db.delete(reqLinks).where(eq(reqLinks.id, linkId)).run();
    return { ok: true };
  },

  /** DFS 循环依赖检测：从 targetId 出发，看能否到达 sourceId */
  _hasCycle(sourceId: number, targetId: number, linkType: string): boolean {
    const db = getDb();
    const visited = new Set<number>();
    const stack = [targetId];

    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === sourceId) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);

      const nextLinks = db.select().from(reqLinks)
        .where(and(eq(reqLinks.sourceTaskId, cur), eq(reqLinks.linkType, linkType)))
        .all();
      for (const l of nextLinks) stack.push(l.targetTaskId);
    }
    return false;
  },

  /** 将关联数据转为前端友好的格式（包含 taskId 字符串） */
  enrichLinks(links: any[]) {
    const db = getDb();
    const taskIds = new Map<number, string>();
    const allTasks = db.select().from(tasks).all();
    for (const t of allTasks) taskIds.set(t.id, t.taskId);

    return links.map(l => ({
      ...l,
      sourceTaskStrId: taskIds.get(l.sourceTaskId) || String(l.sourceTaskId),
      targetTaskStrId: taskIds.get(l.targetTaskId) || String(l.targetTaskId),
    }));
  },
};
