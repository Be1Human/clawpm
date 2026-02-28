import type { FastifyInstance } from 'fastify';
import { TaskService } from '../services/task-service.js';
import { BacklogService } from '../services/backlog-service.js';
import { RiskService } from '../services/risk-service.js';
import { getDb } from '../db/connection.js';
import { domains, milestones, goals, objectives, objectiveTaskLinks, tasks } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export async function registerRoutes(app: FastifyInstance) {

  // ── Tasks ──────────────────────────────────────────────────────────
  app.post('/api/v1/tasks', async (req, reply) => {
    const task = await TaskService.create(req.body as any);
    return reply.code(201).send(task);
  });

  app.get('/api/v1/tasks', async (req) => {
    const q = req.query as any;
    return TaskService.list({ status: q.status, domain: q.domain, milestone: q.milestone, owner: q.owner, priority: q.priority, type: q.type });
  });

  // 树形接口（必须在 /:taskId 之前注册，避免路由冲突）
  app.get('/api/v1/tasks/tree', async (req) => {
    const q = req.query as any;
    return TaskService.getTree(q.domain);
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
    const { name, target_date, status, description } = req.body as any;
    const updates: any = {};
    if (name) updates.name = name;
    if (target_date) updates.targetDate = target_date;
    if (status) updates.status = status;
    if (description) updates.description = description;
    db.update(milestones).set(updates).where(eq(milestones.id, parseInt(id))).run();
    return db.select().from(milestones).where(eq(milestones.id, parseInt(id))).get();
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
}
