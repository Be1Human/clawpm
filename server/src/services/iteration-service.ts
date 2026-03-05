import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { iterations, taskIterations, tasks } from '../db/schema.js';
import { TaskService } from './task-service.js';

export interface CreateIterationParams {
  name: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  projectId: number;
}

export const IterationService = {
  create(params: CreateIterationParams) {
    const db = getDb();
    db.insert(iterations).values({
      projectId: params.projectId,
      name: params.name,
      description: params.description || null,
      startDate: params.startDate || null,
      endDate: params.endDate || null,
      status: 'planned',
    } as any).run();

    const rows = db.select().from(iterations)
      .where(and(eq(iterations.projectId, params.projectId), eq(iterations.name, params.name)))
      .orderBy(desc(iterations.id))
      .limit(1).all();
    return rows[0] || null;
  },

  list(projectId: number, status?: string) {
    const db = getDb();
    const conditions: any[] = [eq(iterations.projectId, projectId)];
    if (status) conditions.push(eq(iterations.status, status));

    const rows = db.select().from(iterations)
      .where(and(...conditions))
      .orderBy(desc(iterations.createdAt))
      .all();

    return rows.map(iter => {
      const links = db.select().from(taskIterations)
        .where(eq(taskIterations.iterationId, iter.id)).all();
      const taskCount = links.length;
      let completedCount = 0;
      if (taskCount > 0) {
        for (const link of links) {
          const t = db.select().from(tasks).where(eq(tasks.id, link.taskId)).get();
          if (t && t.status === 'done') completedCount++;
        }
      }
      return {
        ...iter,
        taskCount,
        completedCount,
        completionRate: taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0,
      };
    });
  },

  getById(id: number) {
    const db = getDb();
    const iter = db.select().from(iterations).where(eq(iterations.id, id)).get();
    if (!iter) return null;

    const links = db.select().from(taskIterations)
      .where(eq(taskIterations.iterationId, id)).all();

    const iterTasks = links.map(link => {
      return TaskService.getById(link.taskId);
    }).filter(Boolean);

    const totalTasks = iterTasks.length;
    const completedTasks = iterTasks.filter((t: any) => t.status === 'done').length;
    const statusBreakdown: Record<string, number> = {};
    for (const t of iterTasks) {
      const st = (t as any).status;
      statusBreakdown[st] = (statusBreakdown[st] || 0) + 1;
    }

    return {
      ...iter,
      tasks: iterTasks,
      stats: {
        totalTasks,
        completedTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
        statusBreakdown,
      },
    };
  },

  update(id: number, params: Partial<Omit<CreateIterationParams, 'projectId'>> & { status?: string }) {
    const db = getDb();
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (params.name !== undefined) updates.name = params.name;
    if (params.description !== undefined) updates.description = params.description;
    if (params.startDate !== undefined) updates.startDate = params.startDate;
    if (params.endDate !== undefined) updates.endDate = params.endDate;
    if (params.status !== undefined) updates.status = params.status;

    db.update(iterations).set(updates as any).where(eq(iterations.id, id)).run();
    return db.select().from(iterations).where(eq(iterations.id, id)).get();
  },

  delete(id: number) {
    const db = getDb();
    db.delete(taskIterations).where(eq(taskIterations.iterationId, id)).run();
    db.delete(iterations).where(eq(iterations.id, id)).run();
  },

  addTask(iterationId: number, taskId: string) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) throw new Error('Task not found: ' + taskId);

    // 避免重复
    const existing = db.select().from(taskIterations)
      .where(and(eq(taskIterations.iterationId, iterationId), eq(taskIterations.taskId, task.id)))
      .get();
    if (existing) return;

    db.insert(taskIterations).values({
      iterationId,
      taskId: task.id,
    } as any).run();
  },

  removeTask(iterationId: number, taskId: string) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return;

    db.delete(taskIterations)
      .where(and(eq(taskIterations.iterationId, iterationId), eq(taskIterations.taskId, task.id)))
      .run();
  },
};
