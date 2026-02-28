import { eq, and, desc, asc, like, or, isNull, lt, lte, sql } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { tasks, taskNotes, progressHistory, domains, milestones } from '../db/schema.js';
import { generateTaskId } from './id-generator.js';

export interface CreateTaskParams {
  title: string;
  description?: string;
  domain?: string;
  priority?: string;
  milestone?: string;
  owner?: string;
  due_date?: string;
  start_date?: string;
  parent_task_id?: string;
  tags?: string[];
  source?: string;
}

export interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  owner?: string;
  due_date?: string;
  start_date?: string;
  milestone?: string;
  domain?: string;
  tags?: string[];
  blocker?: string;
}

export interface TaskFilters {
  status?: string;
  domain?: string;
  milestone?: string;
  owner?: string;
  priority?: string;
  search?: string;
}

export const TaskService = {
  async create(params: CreateTaskParams) {
    const db = getDb();

    let domainId: number | undefined;
    if (params.domain) {
      const d = db.select().from(domains).where(eq(domains.name, params.domain)).get();
      if (d) domainId = d.id;
    }

    let milestoneId: number | undefined;
    if (params.milestone) {
      const m = db.select().from(milestones).where(eq(milestones.name, params.milestone)).get();
      if (m) milestoneId = m.id;
    }

    const taskId = await generateTaskId(domainId);

    db.insert(tasks).values({
      taskId,
      title: params.title,
      description: params.description,
      domainId,
      milestoneId,
      priority: params.priority || 'P2',
      owner: params.owner,
      dueDate: params.due_date,
      startDate: params.start_date || new Date().toISOString().split('T')[0],
      source: params.source || 'planned',
      tags: JSON.stringify(params.tags || []),
      status: 'planned',
    }).run();

    return this.getByTaskId(taskId)!;
  },

  getByTaskId(taskId: string) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return null;
    return this._enrichTask(task);
  },

  getById(id: number) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!task) return null;
    return this._enrichTask(task);
  },

  list(filters: TaskFilters = {}) {
    const db = getDb();
    let query = db.select().from(tasks).$dynamic();

    const conditions = [];

    if (filters.status) conditions.push(eq(tasks.status, filters.status));
    if (filters.owner) conditions.push(eq(tasks.owner, filters.owner));
    if (filters.priority) conditions.push(eq(tasks.priority, filters.priority));

    if (filters.domain) {
      const d = db.select().from(domains).where(eq(domains.name, filters.domain)).get();
      if (d) conditions.push(eq(tasks.domainId, d.id));
    }

    if (filters.milestone) {
      const m = db.select().from(milestones).where(eq(milestones.name, filters.milestone)).get();
      if (m) conditions.push(eq(tasks.milestoneId, m.id));
    }

    if (conditions.length > 0) query = query.where(and(...conditions));

    const rows = query.orderBy(
      asc(sql`CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END`),
      desc(tasks.updatedAt)
    ).all();

    return rows.map(t => this._enrichTask(t));
  },

  listByOwner(owner: string, status?: string) {
    const db = getDb();
    const conditions = [eq(tasks.owner, owner)];
    if (status) conditions.push(eq(tasks.status, status));

    return db.select().from(tasks)
      .where(and(...conditions))
      .orderBy(asc(sql`CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END`))
      .all()
      .map(t => this._enrichTask(t));
  },

  update(taskId: string, params: UpdateTaskParams) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return null;

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

    if (params.title !== undefined) updates.title = params.title;
    if (params.description !== undefined) updates.description = params.description;
    if (params.status !== undefined) updates.status = params.status;
    if (params.priority !== undefined) updates.priority = params.priority;
    if (params.owner !== undefined) updates.owner = params.owner;
    if (params.due_date !== undefined) updates.dueDate = params.due_date;
    if (params.start_date !== undefined) updates.startDate = params.start_date;
    if (params.blocker !== undefined) updates.blocker = params.blocker;
    if (params.tags !== undefined) updates.tags = JSON.stringify(params.tags);

    if (params.domain !== undefined) {
      const d = db.select().from(domains).where(eq(domains.name, params.domain)).get();
      if (d) updates.domainId = d.id;
    }
    if (params.milestone !== undefined) {
      const m = db.select().from(milestones).where(eq(milestones.name, params.milestone)).get();
      if (m) updates.milestoneId = m.id;
    }

    db.update(tasks).set(updates as any).where(eq(tasks.taskId, taskId)).run();
    return this.getByTaskId(taskId)!;
  },

  updateProgress(taskId: string, progress: number, summary?: string) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return null;

    const status = progress >= 100 ? 'done' : task.status === 'planned' ? 'active' : task.status;
    const healthScore = this._calcHealthScore(task, progress);

    db.update(tasks).set({
      progress,
      status,
      healthScore,
      blocker: progress > task.progress ? null : task.blocker,
      updatedAt: new Date().toISOString(),
    } as any).where(eq(tasks.taskId, taskId)).run();

    db.insert(progressHistory).values({
      taskId: task.id,
      progress,
      summary,
    }).run();

    return this.getByTaskId(taskId)!;
  },

  complete(taskId: string, summary?: string) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return null;

    db.update(tasks).set({
      status: 'done',
      progress: 100,
      blocker: null,
      healthScore: 100,
      updatedAt: new Date().toISOString(),
    } as any).where(eq(tasks.taskId, taskId)).run();

    db.insert(progressHistory).values({
      taskId: task.id,
      progress: 100,
      summary: summary || '任务完成',
    }).run();

    return this.getByTaskId(taskId)!;
  },

  reportBlocker(taskId: string, blocker: string) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return null;

    db.update(tasks).set({
      blocker,
      status: 'blocked',
      updatedAt: new Date().toISOString(),
    }).where(eq(tasks.taskId, taskId)).run();

    return this.getByTaskId(taskId)!;
  },

  addNote(taskId: string, content: string, author?: string) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return null;

    db.insert(taskNotes).values({ taskId: task.id, content, author }).run();
    return db.select().from(taskNotes).where(eq(taskNotes.taskId, task.id))
      .orderBy(desc(taskNotes.createdAt)).limit(1).get();
  },

  getHistory(taskId: string) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return [];
    return db.select().from(progressHistory)
      .where(eq(progressHistory.taskId, task.id))
      .orderBy(asc(progressHistory.recordedAt)).all();
  },

  getNotes(taskId: string) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return [];
    return db.select().from(taskNotes)
      .where(eq(taskNotes.taskId, task.id))
      .orderBy(desc(taskNotes.createdAt)).all();
  },

  recommendNext(owner?: string, domainName?: string) {
    const db = getDb();
    const conditions: any[] = [
      or(eq(tasks.status, 'planned'), eq(tasks.status, 'active')),
    ];

    if (owner) {
      conditions.push(or(eq(tasks.owner, owner), isNull(tasks.owner)));
    }
    if (domainName) {
      const d = db.select().from(domains).where(eq(domains.name, domainName)).get();
      if (d) conditions.push(eq(tasks.domainId, d.id));
    }

    const candidates = db.select().from(tasks)
      .where(and(...conditions))
      .orderBy(
        asc(sql`CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END`),
        asc(tasks.dueDate),
      ).limit(10).all();

    return candidates.length > 0 ? this._enrichTask(candidates[0]) : null;
  },

  _calcHealthScore(task: any, progress?: number): number {
    let score = 100;
    const now = new Date();
    const p = progress ?? task.progress;

    if (task.dueDate) {
      const due = new Date(task.dueDate);
      const diffDays = Math.floor((due.getTime() - now.getTime()) / 86400000);
      if (diffDays < 0) score -= Math.min(40, Math.abs(diffDays) * 5);
      else if (diffDays <= 3 && p < 80) score -= 20;
    }
    if (task.blocker) score -= 30;
    return Math.max(0, score);
  },

  _enrichTask(task: any) {
    const db = getDb();
    let domain = null;
    let milestone = null;

    if (task.domainId) {
      domain = db.select().from(domains).where(eq(domains.id, task.domainId)).get();
    }
    if (task.milestoneId) {
      milestone = db.select().from(milestones).where(eq(milestones.id, task.milestoneId)).get();
    }

    return {
      ...task,
      tags: JSON.parse(task.tags || '[]'),
      domain: domain ? { id: domain.id, name: domain.name, color: domain.color } : null,
      milestone: milestone ? { id: milestone.id, name: milestone.name } : null,
    };
  },
};
