import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { intakeItems, projects } from '../db/schema.js';
import { TaskService } from './task-service.js';

export const IntakeService = {
  /** 生成 Intake 业务 ID (IN-001, IN-002, ...) */
  async generateIntakeId(projectId: number): Promise<string> {
    const db = getDb();
    const last = db.select()
      .from(intakeItems)
      .where(eq(intakeItems.projectId, projectId))
      .orderBy(desc(intakeItems.id))
      .limit(1)
      .get();

    if (!last) return 'IN-001';
    const match = last.intakeId.match(/IN-(\d+)/);
    const next = match ? parseInt(match[1]) + 1 : 1;
    return `IN-${String(next).padStart(3, '0')}`;
  },

  /** 提交 Intake（公开接口） */
  async submit(params: {
    title: string;
    description?: string;
    category?: 'bug' | 'feature' | 'feedback';
    submitter: string;
    priority?: string;
    projectId: number;
  }) {
    const db = getDb();
    const intakeId = await this.generateIntakeId(params.projectId);

    db.insert(intakeItems).values({
      intakeId,
      projectId: params.projectId,
      title: params.title,
      description: params.description || null,
      category: params.category || 'feedback',
      submitter: params.submitter,
      priority: params.priority || 'P2',
    } as any).run();

    return db.select().from(intakeItems).where(eq(intakeItems.intakeId, intakeId)).get()!;
  },

  /** 列表查询 */
  list(projectId: number, filters?: { status?: string; category?: string }) {
    const db = getDb();
    const conditions: any[] = [eq(intakeItems.projectId, projectId)];

    if (filters?.status) conditions.push(eq(intakeItems.status, filters.status));
    if (filters?.category) conditions.push(eq(intakeItems.category, filters.category));

    return db.select()
      .from(intakeItems)
      .where(and(...conditions))
      .orderBy(desc(intakeItems.createdAt))
      .all();
  },

  /** 获取单条 */
  getByIntakeId(intakeId: string, projectId: number) {
    const db = getDb();
    return db.select()
      .from(intakeItems)
      .where(and(eq(intakeItems.intakeId, intakeId), eq(intakeItems.projectId, projectId)))
      .get() || null;
  },

  /** 状态统计 */
  getStats(projectId: number): Record<string, number> {
    const db = getDb();
    const all = db.select()
      .from(intakeItems)
      .where(eq(intakeItems.projectId, projectId))
      .all();

    const stats: Record<string, number> = {
      pending: 0,
      accepted: 0,
      rejected: 0,
      deferred: 0,
      duplicate: 0,
      total: all.length,
    };
    for (const item of all) {
      if (stats[item.status] !== undefined) stats[item.status]++;
    }
    return stats;
  },

  /** 审核操作 */
  async review(intakeId: string, params: {
    action: 'accept' | 'reject' | 'defer' | 'duplicate';
    reviewedBy: string;
    reviewNote?: string;
    parentTaskId?: string;
    owner?: string;
    priority?: string;
    extraLabels?: string[];
    projectId: number;
  }) {
    const db = getDb();
    const item = this.getByIntakeId(intakeId, params.projectId);
    if (!item) throw new Error('Intake 条目不存在');
    if (item.status !== 'pending') throw new Error('只能审核 pending 状态的条目');

    if (params.action === 'accept') {
      // 根据 category 确定自动标签
      const categoryLabelMap: Record<string, string> = { bug: 'bug', feature: 'feature', feedback: 'feedback' };
      const labels = [categoryLabelMap[item.category] || 'feedback', ...(params.extraLabels || [])];

      // 创建 Task 节点
      const task = await TaskService.create({
        title: item.title,
        description: item.description || undefined,
        labels,
        priority: params.priority || item.priority,
        owner: params.owner,
        parent_task_id: params.parentTaskId,
        projectId: params.projectId,
        source: 'intake',
      });

      // 更新 Intake 状态
      db.update(intakeItems)
        .set({
          status: 'accepted',
          reviewedBy: params.reviewedBy,
          reviewNote: params.reviewNote || null,
          taskId: task.taskId,
          updatedAt: new Date().toISOString(),
        } as any)
        .where(eq(intakeItems.intakeId, intakeId))
        .run();

      return { ...this.getByIntakeId(intakeId, params.projectId)!, task };
    }

    // reject / defer / duplicate
    const statusMap: Record<string, string> = { reject: 'rejected', defer: 'deferred', duplicate: 'duplicate' };
    db.update(intakeItems)
      .set({
        status: statusMap[params.action],
        reviewedBy: params.reviewedBy,
        reviewNote: params.reviewNote || null,
        updatedAt: new Date().toISOString(),
      } as any)
      .where(eq(intakeItems.intakeId, intakeId))
      .run();

    return this.getByIntakeId(intakeId, params.projectId)!;
  },

  /** 暂缓恢复为 pending */
  reopen(intakeId: string, projectId: number) {
    const db = getDb();
    const item = this.getByIntakeId(intakeId, projectId);
    if (!item) throw new Error('Intake 条目不存在');
    if (item.status !== 'deferred') throw new Error('只能恢复 deferred 状态的条目');

    db.update(intakeItems)
      .set({
        status: 'pending',
        reviewedBy: null,
        reviewNote: null,
        updatedAt: new Date().toISOString(),
      } as any)
      .where(eq(intakeItems.intakeId, intakeId))
      .run();

    return this.getByIntakeId(intakeId, projectId)!;
  },
};
