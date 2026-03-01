import { eq, and, desc, asc, like, or, isNull, lt, lte, sql } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { tasks, taskNotes, progressHistory, domains, milestones } from '../db/schema.js';
import { generateTaskId } from './id-generator.js';

export interface CreateTaskParams {
  title: string;
  description?: string;
  labels?: string[];
  domain?: string;
  priority?: string;
  milestone?: string;
  owner?: string;
  due_date?: string;
  start_date?: string;
  parent_task_id?: string;
  tags?: string[];
  source?: string;
  status?: string;
}

export interface UpdateTaskParams {
  title?: string;
  description?: string;
  labels?: string[];
  parent_task_id?: string | null;
  status?: string;
  priority?: string;
  owner?: string;
  due_date?: string;
  start_date?: string;
  milestone?: string;
  domain?: string;
  tags?: string[];
  blocker?: string;
  pos_x?: number;
  pos_y?: number;
}

export interface TaskFilters {
  status?: string;
  domain?: string;
  milestone?: string;
  owner?: string;
  priority?: string;
  search?: string;
  label?: string;
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

    let parentTaskId: number | undefined;
    if (params.parent_task_id) {
      const parent = db.select().from(tasks).where(eq(tasks.taskId, params.parent_task_id)).get();
      if (parent) parentTaskId = parent.id;
    }

    const taskId = await generateTaskId(domainId);

    db.insert(tasks).values({
      taskId,
      title: params.title,
      description: params.description,
      domainId,
      milestoneId,
      parentTaskId: parentTaskId ?? null,
      priority: params.priority || 'P2',
      owner: params.owner,
      dueDate: params.due_date,
      startDate: params.start_date || null,
      source: params.source || 'planned',
      tags: JSON.stringify(params.tags || []),
      labels: JSON.stringify(params.labels || []),
      status: params.status || 'backlog',
      type: 'task',
    } as any).run();

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
    if (filters.label) {
      const label = filters.label;
      const allRows = db.select().from(tasks).all();
      const matchIds = allRows.filter(t => {
        try { return JSON.parse((t as any).labels || '[]').includes(label); } catch { return false; }
      }).map(t => t.id);
      if (matchIds.length) conditions.push(sql`${tasks.id} IN (${sql.raw(matchIds.join(','))})`);
      else conditions.push(sql`0`);
    }

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

    if (params.labels !== undefined) updates.labels = JSON.stringify(params.labels);
    if (params.pos_x !== undefined) updates.posX = params.pos_x;
    if (params.pos_y !== undefined) updates.posY = params.pos_y;
    if (params.parent_task_id !== undefined) {
      if (params.parent_task_id === null || params.parent_task_id === '') {
        updates.parentTaskId = null;
      } else {
        const parent = db.select().from(tasks).where(eq(tasks.taskId, params.parent_task_id as string)).get();
        if (parent) updates.parentTaskId = parent.id;
      }
    }
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

    const status = progress >= 100 ? 'done' : (task.status === 'planned' || task.status === 'backlog') ? 'active' : task.status;
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
      or(eq(tasks.status, 'backlog'), eq(tasks.status, 'planned'), eq(tasks.status, 'active')),
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

  getTree(domainName?: string, filters: { milestone?: string; status?: string; owner?: string; label?: string } = {}) {
    const db = getDb();
    let allTasks = db.select().from(tasks).all();

    if (domainName) {
      const d = db.select().from(domains).where(eq(domains.name, domainName)).get();
      if (d) allTasks = allTasks.filter(t => t.domainId === d.id);
    }
    if (filters.milestone) {
      const m = db.select().from(milestones).where(eq(milestones.name, filters.milestone)).get();
      if (m) allTasks = allTasks.filter(t => t.milestoneId === m.id);
    }
    if (filters.status) {
      allTasks = allTasks.filter(t => t.status === filters.status);
    }
    if (filters.owner) {
      allTasks = allTasks.filter(t => t.owner === filters.owner);
    }
    if (filters.label) {
      const label = filters.label;
      allTasks = allTasks.filter(t => {
        try {
          const labels: string[] = JSON.parse((t as any).labels || '[]');
          return labels.includes(label) || (t as any).type === label;
        } catch { return false; }
      });
    }

    // 过滤后保留命中节点的祖先（保持树路径完整）
    const hitIds = new Set(allTasks.map(t => t.id));
    if (filters.milestone || filters.status || filters.owner || filters.label) {
      const allTasksFull = db.select().from(tasks).all();
      const idMap = new Map(allTasksFull.map(t => [t.id, t]));
      // 向上补全祖先
      for (const t of [...allTasks]) {
        let cur = t;
        while (cur.parentTaskId) {
          const parent = idMap.get(cur.parentTaskId);
          if (!parent || hitIds.has(parent.id)) break;
          hitIds.add(parent.id);
          allTasks.push(parent);
          cur = parent;
        }
      }
    }

    const enriched = allTasks.map(t => this._enrichTask(t));
    const roots = enriched.filter(t => !t.parentTaskId);
    return roots.map(r => this._buildSubtree(r, enriched));
  },

  getChildren(taskId: string) {
    const db = getDb();
    const parent = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!parent) return [];
    const children = db.select().from(tasks).where(eq(tasks.parentTaskId, parent.id)).all();
    return children.map(t => this._enrichTask(t));
  },

  _buildSubtree(node: any, allTasks: any[]): any {
    const children = allTasks
      .filter(t => t.parentTaskId === node.id)
      .map(c => this._buildSubtree(c, allTasks));
    return { ...node, children };
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

  // 节点迁移：将节点（及其子树）移到新父节点
  reparent(taskId: string, newParentTaskId: string | null) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return null;

    let newParentId: number | null = null;
    if (newParentTaskId) {
      const parent = db.select().from(tasks).where(eq(tasks.taskId, newParentTaskId)).get();
      if (!parent) return null;
      // 检测是否会形成循环（新父节点不能是当前节点的子孙）
      if (this._isDescendant(parent.id, task.id)) {
        throw new Error('循环引用：不能将节点移入自己的子树');
      }
      newParentId = parent.id;
    }

    db.update(tasks).set({ parentTaskId: newParentId, updatedAt: new Date().toISOString() } as any)
      .where(eq(tasks.taskId, taskId)).run();
    return this.getByTaskId(taskId)!;
  },

  // 检查 candidateId 是否是 ancestorId 的子孙
  _isDescendant(candidateId: number, ancestorId: number): boolean {
    const db = getDb();
    const visited = new Set<number>();
    const queue = [candidateId];
    while (queue.length) {
      const cur = queue.pop()!;
      if (cur === ancestorId) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const children = db.select().from(tasks).where(eq(tasks.parentTaskId, cur)).all();
      for (const c of children) queue.push(c.id);
    }
    return false;
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

    let labels: string[] = [];
    try { labels = JSON.parse(task.labels || '[]'); } catch {}
    // 兼容旧数据：如果 labels 为空且 type 不是默认值 'task'，回退到 type
    if (!labels.length && task.type && task.type !== 'task') labels = [task.type];

    return {
      ...task,
      tags: JSON.parse(task.tags || '[]'),
      labels,
      domain: domain ? { id: domain.id, name: domain.name, color: domain.color } : null,
      milestone: milestone ? { id: milestone.id, name: milestone.name } : null,
    };
  },
};
