import { eq, and, asc, desc } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { taskAttachments, tasks } from '../db/schema.js';

export interface CreateAttachmentParams {
  type: 'doc' | 'link' | 'tapd';
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  created_by?: string;
}

export interface UpdateAttachmentParams {
  title?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  sort_order?: number;
}

export const AttachmentService = {
  /** 根据 task_id (字符串如 U-001) 查找内部 id */
  _resolveTaskId(taskId: string): number | null {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    return task ? task.id : null;
  },

  /** 为节点添加附件 */
  add(taskId: string, params: CreateAttachmentParams) {
    const db = getDb();
    const tid = this._resolveTaskId(taskId);
    if (tid === null) return null;

    // 获取当前最大 sort_order
    const last = db.select()
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, tid))
      .orderBy(desc(taskAttachments.sortOrder))
      .limit(1)
      .get();
    const sortOrder = last ? last.sortOrder + 1 : 0;

    db.insert(taskAttachments).values({
      taskId: tid,
      type: params.type,
      title: params.title,
      content: params.content,
      metadata: JSON.stringify(params.metadata || {}),
      sortOrder,
      createdBy: params.created_by,
    }).run();

    return db.select()
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, tid))
      .orderBy(desc(taskAttachments.id))
      .limit(1)
      .get();
  },

  /** 获取节点的附件列表 */
  list(taskId: string, type?: string) {
    const db = getDb();
    const tid = this._resolveTaskId(taskId);
    if (tid === null) return [];

    const conditions = [eq(taskAttachments.taskId, tid)];
    if (type) conditions.push(eq(taskAttachments.type, type));

    return db.select()
      .from(taskAttachments)
      .where(and(...conditions))
      .orderBy(asc(taskAttachments.sortOrder), asc(taskAttachments.id))
      .all()
      .map(a => ({ ...a, metadata: JSON.parse(a.metadata || '{}') }));
  },

  /** 获取单个附件 */
  getById(id: number) {
    const db = getDb();
    const a = db.select().from(taskAttachments).where(eq(taskAttachments.id, id)).get();
    if (!a) return null;
    return { ...a, metadata: JSON.parse(a.metadata || '{}') };
  },

  /** 更新附件 */
  update(id: number, params: UpdateAttachmentParams) {
    const db = getDb();
    const a = db.select().from(taskAttachments).where(eq(taskAttachments.id, id)).get();
    if (!a) return null;

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (params.title !== undefined) updates.title = params.title;
    if (params.content !== undefined) updates.content = params.content;
    if (params.metadata !== undefined) updates.metadata = JSON.stringify(params.metadata);
    if (params.sort_order !== undefined) updates.sortOrder = params.sort_order;

    db.update(taskAttachments).set(updates as any).where(eq(taskAttachments.id, id)).run();
    return this.getById(id);
  },

  /** 删除附件 */
  delete(id: number) {
    const db = getDb();
    const a = db.select().from(taskAttachments).where(eq(taskAttachments.id, id)).get();
    if (!a) return false;
    db.delete(taskAttachments).where(eq(taskAttachments.id, id)).run();
    return true;
  },

  /** 批量更新排序 */
  reorder(taskId: string, orderedIds: number[]) {
    const db = getDb();
    const tid = this._resolveTaskId(taskId);
    if (tid === null) return false;

    for (let i = 0; i < orderedIds.length; i++) {
      db.update(taskAttachments)
        .set({ sortOrder: i, updatedAt: new Date().toISOString() } as any)
        .where(and(eq(taskAttachments.id, orderedIds[i]), eq(taskAttachments.taskId, tid)))
        .run();
    }
    return true;
  },

  /** 获取节点附件计数（用于思维导图等场景） */
  countByTaskId(internalId: number): number {
    const db = getDb();
    return db.select().from(taskAttachments).where(eq(taskAttachments.taskId, internalId)).all().length;
  },
};
