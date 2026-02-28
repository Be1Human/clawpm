import { eq, and, desc, asc } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { backlogItems, domains, tasks } from '../db/schema.js';
import { generateBacklogId } from './id-generator.js';
import { TaskService } from './task-service.js';

export interface CreateBacklogParams {
  title: string;
  description?: string;
  domain?: string;
  priority?: string;
  source?: string;
  source_context?: string;
  estimated_scope?: string;
  tags?: string[];
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
    const backlogId = await generateBacklogId();

    let domainId: number | undefined;
    if (params.domain) {
      const d = db.select().from(domains).where(eq(domains.name, params.domain)).get();
      if (d) domainId = d.id;
    }

    db.insert(backlogItems).values({
      backlogId,
      title: params.title,
      description: params.description,
      domainId,
      priority: params.priority || 'P2',
      source: params.source,
      sourceContext: params.source_context,
      estimatedScope: params.estimated_scope,
      tags: JSON.stringify(params.tags || []),
      status: 'pool',
    }).run();

    return this.getByBacklogId(backlogId)!;
  },

  getByBacklogId(backlogId: string) {
    const db = getDb();
    const item = db.select().from(backlogItems).where(eq(backlogItems.backlogId, backlogId)).get();
    if (!item) return null;
    return this._enrich(item);
  },

  list(filters: { domain?: string; priority?: string; status?: string } = {}) {
    const db = getDb();
    const conditions: any[] = [];

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

    const domain = item.domainId
      ? db.select().from(domains).where(eq(domains.id, item.domainId)).get()
      : null;

    const task = await TaskService.create({
      title: item.title,
      description: item.description || undefined,
      domain: domain?.name,
      milestone: scheduleParams.milestone,
      owner: scheduleParams.owner,
      due_date: scheduleParams.due_date,
      priority: scheduleParams.priority || item.priority,
      source: 'backlog',
      tags: JSON.parse(item.tags || '[]'),
    });

    db.update(backlogItems).set({
      status: 'scheduled',
      scheduledTaskId: task.id,
      updatedAt: new Date().toISOString(),
    }).where(eq(backlogItems.backlogId, backlogId)).run();

    return task;
  },

  _enrich(item: any) {
    const db = getDb();
    let domain = null;
    if (item.domainId) {
      const d = db.select().from(domains).where(eq(domains.id, item.domainId)).get();
      if (d) domain = { id: d.id, name: d.name, color: d.color };
    }
    return { ...item, tags: JSON.parse(item.tags || '[]'), domain };
  },
};
