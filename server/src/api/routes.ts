import type { FastifyInstance } from 'fastify';
import { TaskService } from '../services/task-service.js';
import { BacklogService } from '../services/backlog-service.js';
import { RiskService } from '../services/risk-service.js';
import { MemberService } from '../services/member-service.js';
import { ReqLinkService } from '../services/req-link-service.js';
import { getDb } from '../db/connection.js';
import { domains, milestones, goals, objectives, objectiveTaskLinks, tasks, customFields, taskFieldValues, taskNotes, progressHistory } from '../db/schema.js';
import { eq, and, desc, asc } from 'drizzle-orm';

export async function registerRoutes(app: FastifyInstance) {

  // ── Tasks ──────────────────────────────────────────────────────────
  app.post('/api/v1/tasks', async (req, reply) => {
    const task = await TaskService.create(req.body as any);
    return reply.code(201).send(task);
  });

  app.get('/api/v1/tasks', async (req) => {
    const q = req.query as any;
    return TaskService.list({ status: q.status, domain: q.domain, milestone: q.milestone, owner: q.owner, priority: q.priority, label: q.label });
  });

  // 树形接口（必须在 /:taskId 之前注册，避免路由冲突）
  app.get('/api/v1/tasks/tree', async (req) => {
    const q = req.query as any;
    return TaskService.getTree(q.domain, { milestone: q.milestone, status: q.status, owner: q.owner, label: q.label });
  });

  // 节点迁移（换父节点）
  app.patch('/api/v1/tasks/:taskId/reparent', async (req, reply) => {
    const { taskId } = req.params as any;
    const { new_parent_task_id } = req.body as any;
    try {
      const task = TaskService.reparent(taskId, new_parent_task_id ?? null);
      if (!task) return reply.code(404).send({ error: 'Not found' });
      return task;
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.get('/api/v1/tasks/:taskId/children', async (req, reply) => {
    const { taskId } = req.params as any;
    return TaskService.getChildren(taskId);
  });

  app.get('/api/v1/tasks/:taskId', async (req, reply) => {
    const { taskId } = req.params as any;
    const task = TaskService.getByTaskId(taskId);
    if (!task) return reply.code(404).send({ error: 'Not found' });
    return task;
  });

  app.patch('/api/v1/tasks/:taskId', async (req, reply) => {
    const { taskId } = req.params as any;
    const task = TaskService.update(taskId, req.body as any);
    if (!task) return reply.code(404).send({ error: 'Not found' });
    return task;
  });

  app.delete('/api/v1/tasks/:taskId', async (req, reply) => {
    const { taskId } = req.params as any;
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return reply.code(404).send({ error: 'Not found' });

    const allTasks = db.select().from(tasks).all();
    const idsToDelete: number[] = [];
    function collectChildren(parentId: number) {
      idsToDelete.push(parentId);
      for (const t of allTasks) {
        if (t.parentTaskId === parentId) collectChildren(t.id);
      }
    }
    collectChildren(task.id);

    for (const id of idsToDelete) {
      db.delete(taskNotes).where(eq(taskNotes.taskId, id)).run();
      db.delete(progressHistory).where(eq(progressHistory.taskId, id)).run();
      db.delete(taskFieldValues).where(eq(taskFieldValues.taskId, id)).run();
      db.delete(tasks).where(eq(tasks.id, id)).run();
    }
    return { ok: true };
  });

  app.post('/api/v1/tasks/:taskId/progress', async (req, reply) => {
    const { taskId } = req.params as any;
    const { progress, summary } = req.body as any;
    const task = TaskService.updateProgress(taskId, progress, summary);
    if (!task) return reply.code(404).send({ error: 'Not found' });
    return task;
  });

  app.post('/api/v1/tasks/:taskId/complete', async (req, reply) => {
    const { taskId } = req.params as any;
    const { summary } = (req.body as any) || {};
    const task = TaskService.complete(taskId, summary);
    if (!task) return reply.code(404).send({ error: 'Not found' });
    return task;
  });

  app.post('/api/v1/tasks/:taskId/blocker', async (req, reply) => {
    const { taskId } = req.params as any;
    const { blocker } = req.body as any;
    const task = TaskService.reportBlocker(taskId, blocker);
    if (!task) return reply.code(404).send({ error: 'Not found' });
    return task;
  });

  app.post('/api/v1/tasks/:taskId/notes', async (req, reply) => {
    const { taskId } = req.params as any;
    const { content, author } = req.body as any;
    const note = TaskService.addNote(taskId, content, author);
    if (!note) return reply.code(404).send({ error: 'Not found' });
    return reply.code(201).send(note);
  });

  app.get('/api/v1/tasks/:taskId/history', async (req, reply) => {
    const { taskId } = req.params as any;
    return TaskService.getHistory(taskId);
  });

  app.get('/api/v1/tasks/:taskId/notes', async (req, reply) => {
    const { taskId } = req.params as any;
    return TaskService.getNotes(taskId);
  });

  // ── Backlog ────────────────────────────────────────────────────────
  app.post('/api/v1/backlog', async (req, reply) => {
    const item = await BacklogService.create(req.body as any);
    return reply.code(201).send(item);
  });

  app.get('/api/v1/backlog', async (req) => {
    const q = req.query as any;
    return BacklogService.list({ domain: q.domain, priority: q.priority, status: q.status });
  });

  app.patch('/api/v1/backlog/:backlogId', async (req, reply) => {
    const { backlogId } = req.params as any;
    const item = BacklogService.update(backlogId, req.body as any);
    if (!item) return reply.code(404).send({ error: 'Not found' });
    return item;
  });

  app.post('/api/v1/backlog/:backlogId/schedule', async (req, reply) => {
    const { backlogId } = req.params as any;
    const task = await BacklogService.schedule(backlogId, req.body as any);
    if (!task) return reply.code(404).send({ error: 'Not found' });
    return task;
  });

  // ── Domains ────────────────────────────────────────────────────────
  app.get('/api/v1/domains', async () => {
    return getDb().select().from(domains).all();
  });

  app.post('/api/v1/domains', async (req, reply) => {
    const db = getDb();
    const { name, task_prefix, keywords, color } = req.body as any;
    db.insert(domains).values({
      name, taskPrefix: task_prefix,
      keywords: JSON.stringify(keywords || []),
      color: color || '#6366f1',
    }).run();
    const d = db.select().from(domains).where(eq(domains.name, name)).get();
    return reply.code(201).send(d);
  });

  app.patch('/api/v1/domains/:id', async (req, reply) => {
    const db = getDb();
    const { id } = req.params as any;
    const { name, task_prefix, keywords, color } = req.body as any;
    const domainId = parseInt(id);
    const oldDomain = db.select().from(domains).where(eq(domains.id, domainId)).get();
    if (!oldDomain) return reply.code(404).send({ error: 'Not found' });

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (task_prefix !== undefined) updates.taskPrefix = task_prefix;
    if (keywords !== undefined) updates.keywords = JSON.stringify(keywords);
    if (color !== undefined) updates.color = color;
    db.update(domains).set(updates).where(eq(domains.id, domainId)).run();

    if (task_prefix !== undefined && task_prefix !== oldDomain.taskPrefix) {
      const domainTasks = db.select().from(tasks).where(eq(tasks.domainId, domainId)).all();
      for (const t of domainTasks) {
        const dashIdx = t.taskId.lastIndexOf('-');
        if (dashIdx >= 0) {
          const numPart = t.taskId.slice(dashIdx);
          const newTaskId = `${task_prefix}${numPart}`;
          db.update(tasks).set({ taskId: newTaskId } as any).where(eq(tasks.id, t.id)).run();
        }
      }
    }

    const d = db.select().from(domains).where(eq(domains.id, domainId)).get();
    return d;
  });

  app.delete('/api/v1/domains/:id', async (req, reply) => {
    const db = getDb();
    const { id } = req.params as any;
    const d = db.select().from(domains).where(eq(domains.id, parseInt(id))).get();
    if (!d) return reply.code(404).send({ error: 'Not found' });
    db.update(tasks).set({ domainId: null }).where(eq(tasks.domainId, parseInt(id))).run();
    db.delete(domains).where(eq(domains.id, parseInt(id))).run();
    return { ok: true };
  });

  // ── Milestones ─────────────────────────────────────────────────────
  app.get('/api/v1/milestones', async () => {
    const db = getDb();
    const ms = db.select().from(milestones).all();
    return ms.map(m => {
      const allTasks = db.select().from(tasks).where(eq(tasks.milestoneId, m.id)).all();
      const done = allTasks.filter(t => t.status === 'done').length;
      return {
        ...m,
        taskCount: allTasks.length,
        doneCount: done,
        progress: allTasks.length > 0 ? Math.round((done / allTasks.length) * 100) : 0,
      };
    });
  });

  app.post('/api/v1/milestones', async (req, reply) => {
    const db = getDb();
    const { name, target_date, description } = req.body as any;
    db.insert(milestones).values({ name, targetDate: target_date, description }).run();
    const m = db.select().from(milestones).where(eq(milestones.name, name)).get();
    return reply.code(201).send(m);
  });

  app.patch('/api/v1/milestones/:id', async (req, reply) => {
    const db = getDb();
    const { id } = req.params as any;
    const body = req.body as any;
    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.target_date !== undefined) updates.targetDate = body.target_date;
    if (body.status !== undefined) updates.status = body.status;
    if (body.description !== undefined) updates.description = body.description;
    db.update(milestones).set(updates).where(eq(milestones.id, parseInt(id))).run();
    const m = db.select().from(milestones).where(eq(milestones.id, parseInt(id))).get();
    if (!m) return reply.code(404).send({ error: 'Not found' });
    return m;
  });

  app.delete('/api/v1/milestones/:id', async (req, reply) => {
    const db = getDb();
    const { id } = req.params as any;
    const m = db.select().from(milestones).where(eq(milestones.id, parseInt(id))).get();
    if (!m) return reply.code(404).send({ error: 'Not found' });
    db.update(tasks).set({ milestoneId: null }).where(eq(tasks.milestoneId, parseInt(id))).run();
    db.delete(milestones).where(eq(milestones.id, parseInt(id))).run();
    return { ok: true };
  });

  // ── Goals ──────────────────────────────────────────────────────────
  app.get('/api/v1/goals', async () => {
    const db = getDb();
    const goalList = db.select().from(goals).all();
    return goalList.map(g => {
      const objs = db.select().from(objectives).where(eq(objectives.goalId, g.id)).all();
      return { ...g, objectives: objs };
    });
  });

  app.post('/api/v1/goals', async (req, reply) => {
    const db = getDb();
    const { title, description, target_date, set_by, objectives: objList } = req.body as any;
    db.insert(goals).values({ title, description, targetDate: target_date, setBy: set_by }).run();
    const goal = db.select().from(goals).orderBy(desc(goals.id)).limit(1).get()!;

    if (objList?.length) {
      for (const obj of objList) {
        db.insert(objectives).values({ goalId: goal.id, title: obj.title, weight: obj.weight || 1.0 }).run();
      }
    }

    return reply.code(201).send(goal);
  });

  app.post('/api/v1/goals/:goalId/link-task', async (req, reply) => {
    const db = getDb();
    const { goalId } = req.params as any;
    const { objective_id, task_id } = req.body as any;

    const task = TaskService.getByTaskId(task_id);
    if (!task) return reply.code(404).send({ error: 'Task not found' });

    db.insert(objectiveTaskLinks).values({ objectiveId: objective_id, taskId: task.id }).run();
    return { ok: true };
  });

  // ── Dashboard ──────────────────────────────────────────────────────
  app.get('/api/v1/dashboard/overview', async () => {
    return RiskService.getProjectStatus();
  });

  app.get('/api/v1/dashboard/risks', async () => {
    return RiskService.analyze();
  });

  app.get('/api/v1/dashboard/resources', async () => {
    const db = getDb();
    const activeTasks = db.select().from(tasks)
      .where(and(eq(tasks.status, 'active'))).all();

    const byOwner: Record<string, any> = {};
    for (const t of activeTasks) {
      const owner = t.owner || 'unassigned';
      if (!byOwner[owner]) byOwner[owner] = { tasks: 0, p0: 0, p1: 0, avgProgress: 0 };
      byOwner[owner].tasks++;
      byOwner[owner].avgProgress += t.progress;
      if (t.priority === 'P0') byOwner[owner].p0++;
      if (t.priority === 'P1') byOwner[owner].p1++;
    }
    for (const k of Object.keys(byOwner)) {
      byOwner[k].avgProgress = Math.round(byOwner[k].avgProgress / byOwner[k].tasks);
    }

    return { byOwner };
  });

  // ── Members ────────────────────────────────────────────────────────
  app.get('/api/v1/members', async (req) => {
    const q = req.query as any;
    return MemberService.list(q.type);
  });

  app.post('/api/v1/members', async (req, reply) => {
    const m = MemberService.create(req.body as any);
    return reply.code(201).send(m);
  });

  app.get('/api/v1/members/:identifier', async (req, reply) => {
    const { identifier } = req.params as any;
    const m = MemberService.getByIdentifier(identifier);
    if (!m) return reply.code(404).send({ error: 'Not found' });
    return m;
  });

  app.patch('/api/v1/members/:identifier', async (req, reply) => {
    const { identifier } = req.params as any;
    const m = MemberService.update(identifier, req.body as any);
    if (!m) return reply.code(404).send({ error: 'Not found' });
    return m;
  });

  app.delete('/api/v1/members/:identifier', async (req, reply) => {
    const { identifier } = req.params as any;
    return MemberService.delete(identifier);
  });

  // ── Req Links（需求关联） ────────────────────────────────────────────
  app.get('/api/v1/req-links', async () => {
    const links = ReqLinkService.getAll();
    return ReqLinkService.enrichLinks(links);
  });

  app.post('/api/v1/req-links', async (req, reply) => {
    const { source_task_id, target_task_id, link_type } = req.body as any;
    try {
      const link = ReqLinkService.create(source_task_id, target_task_id, link_type || 'relates');
      return reply.code(201).send(ReqLinkService.enrichLinks([link])[0]);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.delete('/api/v1/req-links/:linkId', async (req, reply) => {
    const { linkId } = req.params as any;
    return ReqLinkService.delete(parseInt(linkId));
  });

  // ── Custom Fields ────────────────────────────────────────────────
  app.get('/api/v1/custom-fields', async () => {
    const db = getDb();
    return db.select().from(customFields).orderBy(asc(customFields.sortOrder), asc(customFields.id)).all();
  });

  app.post('/api/v1/custom-fields', async (req, reply) => {
    const db = getDb();
    const { name, field_type, options, color, sort_order } = req.body as any;
    db.insert(customFields).values({
      name,
      fieldType: field_type || 'text',
      options: JSON.stringify(options || []),
      color: color || null,
      sortOrder: sort_order ?? 0,
    }).run();
    const f = db.select().from(customFields).orderBy(desc(customFields.id)).limit(1).get();
    return reply.code(201).send(f);
  });

  app.patch('/api/v1/custom-fields/:id', async (req, reply) => {
    const db = getDb();
    const { id } = req.params as any;
    const body = req.body as any;
    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.field_type !== undefined) updates.fieldType = body.field_type;
    if (body.options !== undefined) updates.options = JSON.stringify(body.options);
    if (body.color !== undefined) updates.color = body.color;
    if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;
    db.update(customFields).set(updates).where(eq(customFields.id, parseInt(id))).run();
    const f = db.select().from(customFields).where(eq(customFields.id, parseInt(id))).get();
    if (!f) return reply.code(404).send({ error: 'Not found' });
    return f;
  });

  app.delete('/api/v1/custom-fields/:id', async (req, reply) => {
    const db = getDb();
    const { id } = req.params as any;
    const f = db.select().from(customFields).where(eq(customFields.id, parseInt(id))).get();
    if (!f) return reply.code(404).send({ error: 'Not found' });
    db.delete(taskFieldValues).where(eq(taskFieldValues.fieldId, parseInt(id))).run();
    db.delete(customFields).where(eq(customFields.id, parseInt(id))).run();
    return { ok: true };
  });

  app.get('/api/v1/tasks/:taskId/fields', async (req, reply) => {
    const db = getDb();
    const { taskId } = req.params as any;
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return reply.code(404).send({ error: 'Not found' });
    const values = db.select().from(taskFieldValues).where(eq(taskFieldValues.taskId, task.id)).all();
    const fields = db.select().from(customFields).all();
    return values.map(v => {
      const field = fields.find(f => f.id === v.fieldId);
      return { ...v, fieldName: field?.name, fieldType: field?.fieldType };
    });
  });

  app.put('/api/v1/tasks/:taskId/fields', async (req, reply) => {
    const db = getDb();
    const { taskId } = req.params as any;
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return reply.code(404).send({ error: 'Not found' });
    const body = req.body as Record<string, string>;
    for (const [fieldIdStr, value] of Object.entries(body)) {
      const fieldId = parseInt(fieldIdStr);
      const existing = db.select().from(taskFieldValues)
        .where(and(eq(taskFieldValues.taskId, task.id), eq(taskFieldValues.fieldId, fieldId))).get();
      if (value === '' || value === null || value === undefined) {
        if (existing) db.delete(taskFieldValues).where(eq(taskFieldValues.id, existing.id)).run();
      } else if (existing) {
        db.update(taskFieldValues).set({ value: String(value) }).where(eq(taskFieldValues.id, existing.id)).run();
      } else {
        db.insert(taskFieldValues).values({ taskId: task.id, fieldId, value: String(value) }).run();
      }
    }
    const updated = db.select().from(taskFieldValues).where(eq(taskFieldValues.taskId, task.id)).all();
    return updated;
  });

  // ── Gantt ──────────────────────────────────────────────────────────
  app.get('/api/v1/gantt', async (req) => {
    const db = getDb();
    const q = req.query as any;
    let allTasks = db.select().from(tasks).all();

    if (q.domain) {
      const d = db.select().from(domains).where(eq(domains.name, q.domain)).get();
      if (d) allTasks = allTasks.filter(t => t.domainId === d.id);
    }
    if (q.owner) allTasks = allTasks.filter(t => t.owner === q.owner);

    const allMilestones = db.select().from(milestones).all();
    const allDomains = db.select().from(domains).all();

    return {
      tasks: allTasks.map(t => {
        const domain = allDomains.find(d => d.id === t.domainId);
        return { ...t, domain: domain ? { name: domain.name, color: domain.color } : null };
      }),
      milestones: allMilestones,
    };
  });
}
