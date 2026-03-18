import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { backlogItems, domains, tasks } from '../db/schema.js';
import { generateBacklogId } from './id-generator.js';
import { TaskService } from './task-service.js';

export interface CreateBacklogParams {
  title: string;
  description?: string;
  domain?: string;
  parent_backlog_id?: string;
  priority?: string;
  source?: string;
  source_context?: string;
  estimated_scope?: string;
  tags?: string[];
  projectId?: number;
}

export interface ScheduleParams {
  milestone?: string;
  owner?: string;
  due_date?: string;
  priority?: string;
}

export const BacklogService = {
  async create(params: CreateBacklogParams) {
    const db = getDb();
    const projectId = params.projectId || 1;
    const backlogId = await generateBacklogId(projectId);

    let domainId: number | undefined;
    if (params.domain) {
      const d = db.select().from(domains).where(eq(domains.name, params.domain)).get();
      if (d) domainId = d.id;
    }

    let parentBacklogItemId: number | undefined;
    if (params.parent_backlog_id) {
      const parent = db.select().from(backlogItems).where(eq(backlogItems.backlogId, params.parent_backlog_id)).get();
      if (parent) parentBacklogItemId = parent.id;
    }

    const siblings = db.select().from(backlogItems).all()
      .filter(item => item.projectId === projectId && (item as any).parentBacklogItemId === (parentBacklogItemId ?? null));
    const maxSort = siblings.reduce((max, item) => Math.max(max, (item as any).sortOrder ?? 0), -1);

    db.insert(backlogItems).values({
      backlogId,
      projectId,
      title: params.title,
      description: params.description,
      domainId,
      parentBacklogItemId: parentBacklogItemId ?? null,
      priority: params.priority || 'P2',
      source: params.source,
      sourceContext: params.source_context,
      estimatedScope: params.estimated_scope,
      tags: JSON.stringify(params.tags || []),
      status: 'pool',
      sortOrder: maxSort + 1,
    } as any).run();

    return this.getByBacklogId(backlogId)!;
  },

  getByBacklogId(backlogId: string) {
    const db = getDb();
    const item = db.select().from(backlogItems).where(eq(backlogItems.backlogId, backlogId)).get();
    if (!item) return null;
    return this._enrich(item);
  },

  list(filters: { domain?: string; priority?: string; status?: string; projectId?: number } = {}) {
    const db = getDb();
    const conditions: any[] = [];

    if (filters.projectId) conditions.push(eq(backlogItems.projectId, filters.projectId));
    if (filters.status) conditions.push(eq(backlogItems.status, filters.status));
    if (filters.priority) conditions.push(eq(backlogItems.priority, filters.priority));
    if (filters.domain) {
      const d = db.select().from(domains).where(eq(domains.name, filters.domain)).get();
      if (d) conditions.push(eq(backlogItems.domainId, d.id));
    }

    const rows = conditions.length
      ? db.select().from(backlogItems).where(and(...conditions)).orderBy(desc(backlogItems.createdAt)).all()
      : db.select().from(backlogItems).orderBy(desc(backlogItems.createdAt)).all();

    return rows.map(i => this._enrich(i));
  },

  listTree(filters: { domain?: string; priority?: string; status?: string; projectId?: number } = {}) {
    const db = getDb();
    const projectRows = filters.projectId
      ? db.select().from(backlogItems).where(eq(backlogItems.projectId, filters.projectId)).all()
      : db.select().from(backlogItems).all();

    let matched = projectRows;
    if (filters.status) matched = matched.filter(item => item.status === filters.status);
    if (filters.priority) matched = matched.filter(item => item.priority === filters.priority);
    if (filters.domain) {
      const d = db.select().from(domains).where(eq(domains.name, filters.domain)).get();
      if (d) matched = matched.filter(item => item.domainId === d.id);
    }

    const hitIds = new Set(matched.map(item => item.id));
    for (const item of [...matched]) {
      let cur = item;
      while ((cur as any).parentBacklogItemId) {
        const parent = projectRows.find(row => row.id === (cur as any).parentBacklogItemId);
        if (!parent || hitIds.has(parent.id)) break;
        hitIds.add(parent.id);
        matched.push(parent);
        cur = parent;
      }
    }

    const enriched = matched.map(item => this._enrich(item));
    const roots = enriched
      .filter(item => !item.parentBacklogItemId)
      .sort((a, b) => this._compareSiblings(a, b));
    return roots.map(root => this._buildSubtree(root, enriched));
  },

  update(backlogId: string, params: Partial<CreateBacklogParams>) {
    const db = getDb();
    const item = db.select().from(backlogItems).where(eq(backlogItems.backlogId, backlogId)).get();
    if (!item) return null;

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (params.title !== undefined) updates.title = params.title;
    if (params.description !== undefined) updates.description = params.description;
    if (params.priority !== undefined) updates.priority = params.priority;
    if (params.source !== undefined) updates.source = params.source;
    if (params.estimated_scope !== undefined) updates.estimatedScope = params.estimated_scope;
    if (params.tags !== undefined) updates.tags = JSON.stringify(params.tags);
    if (params.parent_backlog_id !== undefined) {
      if (!params.parent_backlog_id) {
        updates.parentBacklogItemId = null;
      } else {
        const parent = db.select().from(backlogItems).where(eq(backlogItems.backlogId, params.parent_backlog_id)).get();
        if (parent) updates.parentBacklogItemId = parent.id;
      }
    }
    if (params.domain !== undefined) {
      const d = db.select().from(domains).where(eq(domains.name, params.domain)).get();
      if (d) updates.domainId = d.id;
    }

    db.update(backlogItems).set(updates as any).where(eq(backlogItems.backlogId, backlogId)).run();
    return this.getByBacklogId(backlogId)!;
  },

  async schedule(backlogId: string, scheduleParams: ScheduleParams) {
    const db = getDb();
    const item = db.select().from(backlogItems).where(eq(backlogItems.backlogId, backlogId)).get();
    if (!item) return null;
    return this._ensureScheduled(item, scheduleParams, new Set<number>());
  },

  async _ensureScheduled(item: any, scheduleParams: ScheduleParams, visiting: Set<number>): Promise<any> {
    const db = getDb();
    if (visiting.has(item.id)) throw new Error('需求池存在循环父子关系');
    visiting.add(item.id);

    if (item.scheduledTaskId) {
      const existingTask = db.select().from(tasks).where(eq(tasks.id, item.scheduledTaskId)).get();
      if (existingTask) return TaskService.getByTaskId(existingTask.taskId);
    }

    const domain = item.domainId
      ? db.select().from(domains).where(eq(domains.id, item.domainId)).get()
      : null;

    let parentTaskId: string | undefined;
    if (item.parentBacklogItemId) {
      const parentItem = db.select().from(backlogItems).where(eq(backlogItems.id, item.parentBacklogItemId)).get();
      if (parentItem) {
        const parentTask = await this._ensureScheduled(parentItem, scheduleParams, visiting);
        if (parentTask?.taskId) parentTaskId = parentTask.taskId;
      }
    }

    const task = await TaskService.create({
      title: item.title,
      description: item.description || undefined,
      domain: domain?.name,
      milestone: scheduleParams.milestone,
      owner: scheduleParams.owner,
      due_date: scheduleParams.due_date,
      priority: scheduleParams.priority || item.priority,
      source: 'backlog',
      status: 'planned',
      tags: JSON.parse(item.tags || '[]'),
      parent_task_id: parentTaskId,
      projectId: (item as any).projectId || 1,
    });

    db.update(backlogItems).set({
      status: 'scheduled',
      scheduledTaskId: task.id,
      updatedAt: new Date().toISOString(),
    }).where(eq(backlogItems.id, item.id)).run();

    return task;
  },

  _buildSubtree(node: any, allItems: any[]): any {
    const children = allItems
      .filter(item => item.parentBacklogItemId === node.id)
      .sort((a, b) => this._compareSiblings(a, b))
      .map(item => this._buildSubtree(item, allItems));
    return { ...node, children };
  },

  _compareSiblings(a: any, b: any) {
    const order: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return (order[a.priority] ?? 99) - (order[b.priority] ?? 99)
      || ((a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      || String(a.title || '').localeCompare(String(b.title || ''));
  },

  _enrich(item: any) {
    const db = getDb();
    let domain = null;
    let parentBacklogIdStr: string | null = null;
    if (item.domainId) {
      const d = db.select().from(domains).where(eq(domains.id, item.domainId)).get();
      if (d) domain = { id: d.id, name: d.name, color: d.color };
    }
    if (item.parentBacklogItemId) {
      const parent = db.select().from(backlogItems).where(eq(backlogItems.id, item.parentBacklogItemId)).get();
      if (parent) parentBacklogIdStr = parent.backlogId;
    }
    return { ...item, tags: JSON.parse(item.tags || '[]'), domain, parentBacklogIdStr };
  },
};
