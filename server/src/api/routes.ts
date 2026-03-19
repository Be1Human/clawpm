import type { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { TaskService } from '../services/task-service.js';
import { BacklogService } from '../services/backlog-service.js';
import { RiskService } from '../services/risk-service.js';
import { MemberService } from '../services/member-service.js';
import { ReqLinkService } from '../services/req-link-service.js';
import { IterationService } from '../services/iteration-service.js';
import { NotificationService } from '../services/notification-service.js';
import { AttachmentService } from '../services/attachment-service.js';
import { IntakeService } from '../services/intake-service.js';
import { PermissionService } from '../services/permission-service.js';
import { ProjectService } from '../services/project-service.js';
import { AuthService } from '../services/auth-service.js';
import { config } from '../config.js';
import { getDb } from '../db/connection.js';
import { domains, milestones, goals, objectives, objectiveTaskLinks, tasks, customFields, taskFieldValues, taskNotes, progressHistory, taskAttachments, members } from '../db/schema.js';
import { eq, and, desc, asc } from 'drizzle-orm';

/** 从请求中解析项目 slug → projectId */
function getProjectId(req: any): number {
  const slug = (req.query as any)?.project || (req.body as any)?.project;
  return ProjectService.resolveProjectId(slug);
}

function getBaseUrl(req: any) {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || `localhost:${config.port}`;
  return `${proto}://${host}`;
}

export async function registerRoutes(app: FastifyInstance) {

  function requireAccountPrincipal(req: any, reply?: any) {
    const principal = req.clawpmPrincipal;
    if (!principal || principal.type !== 'account') {
      if (reply) return reply.code(401).send({ error: '需要账号登录' });
      const err: any = new Error('需要账号登录');
      err.statusCode = 401;
      throw err;
    }
    return principal;
  }

  /** 权限校验：要求当前用户对指定任务有 edit 权限 */
  async function requireEditPermission(req: any, taskId: string) {
    const user = req.clawpmMember as string | null;
    if (!user) return; // 未设身份 → 兼容模式，不拦截
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return; // 任务不存在由后续业务逻辑处理
    const perm = PermissionService.getEffectivePermission(task.id, task.owner, user);
    if (perm === 'none' || perm === 'view') {
      const err: any = new Error('无编辑权限：你对此节点仅有查看权限或无权限');
      err.statusCode = 403;
      throw err;
    }
  }

  /** 权限校验：要求当前用户是指定任务的 Owner */
  async function requireOwner(req: any, taskId: string) {
    const user = req.clawpmMember as string | null;
    if (!user) return;
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return;
    if (task.owner !== user) {
      const err: any = new Error('仅 Owner 可执行此操作');
      err.statusCode = 403;
      throw err;
    }
  }

  // ── Auth（v5.0）──────────────────────────────────────────────────────
  app.post('/api/v1/auth/register', async (req, reply) => {
    try {
      const body = req.body as any;
      const result = AuthService.register({
        username: body.username,
        password: body.password,
        displayName: body.display_name || body.displayName || body.username,
        projectSlug: body.project,
        autoCreateMember: body.auto_create_member !== false,
      });
      return reply.code(201).send(result);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post('/api/v1/auth/login', async (req, reply) => {
    try {
      const body = req.body as any;
      const result = AuthService.login({
        username: body.username,
        password: body.password,
      });
      return result;
    } catch (e: any) {
      return reply.code(401).send({ error: e.message });
    }
  });

  app.post('/api/v1/auth/logout', async (req, reply) => {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token) AuthService.logout(token);
    return { ok: true };
  });

  app.get('/api/v1/auth/me', async (req, reply) => {
    const principal = requireAccountPrincipal(req, reply);
    if (!principal) return;
    return {
      account: {
        id: principal.accountId,
        username: principal.username,
        displayName: principal.displayName,
      },
      ...AuthService.getAccountSnapshot(principal.accountId, principal.memberIdentifier),
    };
  });

  app.post('/api/v1/auth/select-member', async (req, reply) => {
    const principal = requireAccountPrincipal(req, reply);
    if (!principal) return;
    const body = req.body as any;
    const projectId = getProjectId(req);
    try {
      let memberIdentifier = body.member_identifier as string | undefined;
      if (!memberIdentifier && body.create_member) {
        const created = MemberService.create({
          name: body.create_member.name,
          identifier: body.create_member.identifier,
          type: 'human',
          color: body.create_member.color,
          description: body.create_member.description,
          role: body.create_member.role,
          projectId,
        });
        memberIdentifier = created.identifier;
      }
      if (!memberIdentifier) return reply.code(400).send({ error: 'member_identifier is required' });
      const currentMember = AuthService.bindMember(principal.accountId, projectId, memberIdentifier, true);
      return {
        account: {
          id: principal.accountId,
          username: principal.username,
          displayName: principal.displayName,
        },
        currentMember,
        bindings: AuthService.listBindings(principal.accountId),
      };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ── Projects（v2.1 新增）────────────────────────────────────────────
  app.get('/api/v1/projects', async () => {
    return ProjectService.list();
  });

  app.post('/api/v1/projects', async (req, reply) => {
    const { name, slug, description } = req.body as any;
    if (!name) return reply.code(400).send({ error: 'name is required' });
    const p = ProjectService.create({ name, slug, description });
    return reply.code(201).send(p);
  });

  app.get('/api/v1/projects/:slug', async (req, reply) => {
    const { slug } = req.params as any;
    const p = ProjectService.getBySlug(slug);
    if (!p) return reply.code(404).send({ error: 'Not found' });
    return p;
  });

  app.patch('/api/v1/projects/:slug', async (req, reply) => {
    const { slug } = req.params as any;
    const p = ProjectService.update(slug, req.body as any);
    if (!p) return reply.code(404).send({ error: 'Not found' });
    return p;
  });

  app.delete('/api/v1/projects/:slug', async (req, reply) => {
    const { slug } = req.params as any;
    const ok = ProjectService.delete(slug);
    if (!ok) return reply.code(400).send({ error: 'Cannot delete default project' });
    return { ok: true };
  });

  // ── Tasks ──────────────────────────────────────────────────────────
  app.post('/api/v1/tasks', async (req, reply) => {
    const projectId = getProjectId(req);
    const body = req.body as any;
    // 创建子任务时校验父节点权限
    if (body.parent_task_id) {
      await requireEditPermission(req, body.parent_task_id);
    }
    // 未指定 owner 时，自动设为当前登录用户
    const user = req.clawpmUser as string | null;
    if (!body.owner && user) {
      body.owner = user;
    }
    try {
      const task = await TaskService.create({ ...body, projectId });
      return reply.code(201).send(task);
    } catch (e: any) {
      const msg = e.message || '创建节点失败';
      const code = msg.includes('UNIQUE') || msg.includes('unique') ? 409 : 500;
      return reply.code(code).send({ error: msg });
    }
  });

  app.get('/api/v1/tasks', async (req) => {
    const q = req.query as any;
    const projectId = getProjectId(req);
    return TaskService.list({ status: q.status, domain: q.domain, milestone: q.milestone, owner: q.owner, priority: q.priority, label: q.label, projectId });
  });

  // 树形接口（必须在 /:taskId 之前注册，避免路由冲突）
  app.get('/api/v1/tasks/tree', async (req) => {
    const q = req.query as any;
    const projectId = getProjectId(req);
    return TaskService.getTree(q.domain, { milestone: q.milestone, status: q.status, owner: q.owner, label: q.label, projectId });
  });

  // 节点迁移（换父节点）
  app.patch('/api/v1/tasks/:taskId/reparent', async (req, reply) => {
    const { taskId } = req.params as any;
    const { new_parent_task_id } = req.body as any;
    await requireEditPermission(req, taskId);
    if (new_parent_task_id) {
      await requireEditPermission(req, new_parent_task_id);
    }
    try {
      const task = TaskService.reparent(taskId, new_parent_task_id ?? null);
      if (!task) return reply.code(404).send({ error: 'Not found' });
      return task;
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // 同级子节点排序
  app.patch('/api/v1/tasks/reorder-children', async (req, reply) => {
    const { parent_task_id, ordered_child_ids } = req.body as any;
    if (!Array.isArray(ordered_child_ids)) return reply.code(400).send({ error: 'ordered_child_ids must be an array' });
    const ok = TaskService.reorderChildren(parent_task_id ?? null, ordered_child_ids);
    if (!ok) return reply.code(404).send({ error: 'Parent not found' });
    return { ok: true };
  });

  // ── Batch Operations（批量操作 v3.0）— 必须在 :taskId 路由之前 ──
  app.patch('/api/v1/tasks/batch', async (req, reply) => {
    const { task_ids, updates } = req.body as any;
    if (!Array.isArray(task_ids) || !task_ids.length) return reply.code(400).send({ error: 'task_ids array is required' });
    if (!updates || typeof updates !== 'object') return reply.code(400).send({ error: 'updates object is required' });
    const results = TaskService.batchUpdate(task_ids, updates);
    return results;
  });

  // ── Archive 列表（v3.0）— 必须在 :taskId 路由之前 ──
  app.get('/api/v1/tasks/archived', async (req) => {
    const projectId = getProjectId(req);
    return TaskService.listArchived(projectId);
  });

  app.get('/api/v1/tasks/:taskId/children', async (req, reply) => {
    const { taskId } = req.params as any;
    return TaskService.getChildren(taskId);
  });

  app.get('/api/v1/tasks/:taskId/context', async (req, reply) => {
    const { taskId } = req.params as any;
    const ctx = TaskService.getTaskContext(taskId);
    if (!ctx) return reply.code(404).send({ error: 'Not found' });
    return ctx;
  });

  app.get('/api/v1/tasks/:taskId', async (req, reply) => {
    const { taskId } = req.params as any;
    const task = TaskService.getByTaskId(taskId);
    if (!task) return reply.code(404).send({ error: 'Not found' });
    const user = (req as any).clawpmUser as string | null;
    if (user) {
      (task as any)._myPermission = PermissionService.getEffectivePermission(task.id, task.owner, user);
    }
    return task;
  });

  app.patch('/api/v1/tasks/:taskId', async (req, reply) => {
    const { taskId } = req.params as any;
    await requireEditPermission(req, taskId);
    const task = TaskService.update(taskId, req.body as any);
    if (!task) return reply.code(404).send({ error: 'Not found' });
    return task;
  });

  app.delete('/api/v1/tasks/:taskId', async (req, reply) => {
    const { taskId } = req.params as any;
    await requireOwner(req, taskId);
    const ok = TaskService.deleteTask(taskId);
    if (!ok) return reply.code(404).send({ error: 'Not found' });
    return { ok: true };
  });

  app.post('/api/v1/tasks/:taskId/progress', async (req, reply) => {
    const { taskId } = req.params as any;
    await requireEditPermission(req, taskId);
    const { progress, summary } = req.body as any;
    const task = TaskService.updateProgress(taskId, progress, summary);
    if (!task) return reply.code(404).send({ error: 'Not found' });
    return task;
  });

  app.post('/api/v1/tasks/:taskId/complete', async (req, reply) => {
    const { taskId } = req.params as any;
    await requireEditPermission(req, taskId);
    const { summary } = (req.body as any) || {};
    const task = TaskService.complete(taskId, summary);
    if (!task) return reply.code(404).send({ error: 'Not found' });
    return task;
  });

  app.post('/api/v1/tasks/:taskId/blocker', async (req, reply) => {
    const { taskId } = req.params as any;
    await requireEditPermission(req, taskId);
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
    const projectId = getProjectId(req);
    const item = await BacklogService.create({ ...(req.body as any), projectId });
    return reply.code(201).send(item);
  });

  app.get('/api/v1/backlog', async (req) => {
    const q = req.query as any;
    const projectId = getProjectId(req);
    return BacklogService.list({ domain: q.domain, priority: q.priority, status: q.status, projectId });
  });

  app.get('/api/v1/backlog/tree', async (req) => {
    const q = req.query as any;
    const projectId = getProjectId(req);
    return BacklogService.listTree({ domain: q.domain, priority: q.priority, status: q.status, projectId });
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
  app.get('/api/v1/domains', async (req) => {
    const projectId = getProjectId(req);
    return getDb().select().from(domains).where(eq(domains.projectId, projectId)).all();
  });

  app.post('/api/v1/domains', async (req, reply) => {
    const db = getDb();
    const projectId = getProjectId(req);
    const { name, task_prefix, keywords, color } = req.body as any;
    try {
      db.insert(domains).values({
        name, taskPrefix: task_prefix,
        keywords: JSON.stringify(keywords || []),
        color: color || '#6366f1',
        projectId,
      } as any).run();
      const d = db.select().from(domains).where(eq(domains.name, name)).get();
      return reply.code(201).send(d);
    } catch (e: any) {
      const msg = e.message || '创建域名失败';
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        return reply.code(409).send({ error: `域名或前缀已存在: ${msg}` });
      }
      return reply.code(500).send({ error: msg });
    }
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
  app.get('/api/v1/milestones', async (req) => {
    const db = getDb();
    const projectId = getProjectId(req);
    const ms = db.select().from(milestones).where(eq(milestones.projectId, projectId)).all();
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
    const projectId = getProjectId(req);
    const { name, target_date, description } = req.body as any;
    db.insert(milestones).values({ name, targetDate: target_date, description, projectId } as any).run();
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
  app.get('/api/v1/goals', async (req) => {
    const db = getDb();
    const projectId = getProjectId(req);
    const goalList = db.select().from(goals).where(eq(goals.projectId, projectId)).all();
    return goalList.map(g => {
      const objs = db.select().from(objectives).where(eq(objectives.goalId, g.id)).all();
      return { ...g, objectives: objs };
    });
  });

  app.post('/api/v1/goals', async (req, reply) => {
    const db = getDb();
    const projectId = getProjectId(req);
    const { title, description, target_date, set_by, objectives: objList } = req.body as any;
    db.insert(goals).values({ title, description, targetDate: target_date, setBy: set_by, projectId } as any).run();
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
  app.get('/api/v1/dashboard/overview', async (req) => {
    const projectId = getProjectId(req);
    return RiskService.getProjectStatus(projectId);
  });

  app.get('/api/v1/dashboard/risks', async (req) => {
    const projectId = getProjectId(req);
    return RiskService.analyze(projectId);
  });

  app.get('/api/v1/dashboard/resources', async (req) => {
    const db = getDb();
    const projectId = getProjectId(req);
    const activeTasks = db.select().from(tasks)
      .where(and(eq(tasks.status, 'active'), eq(tasks.projectId, projectId))).all();

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
    const projectId = getProjectId(req);
    return MemberService.list(q.type, projectId);
  });

  app.get('/api/v1/members/check-identifier', async (req) => {
    const q = req.query as any;
    const identifier = q.identifier as string;
    if (!identifier) return { available: false, reason: 'empty' };
    const existing = MemberService.getByIdentifier(identifier);
    return existing ? { available: false, reason: 'already_taken' } : { available: true };
  });

  app.post('/api/v1/members', async (req, reply) => {
    const projectId = getProjectId(req);
    const m = MemberService.create({ ...(req.body as any), projectId });
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

  // ── Agent Tokens / OpenClaw（v5.0）─────────────────────────────────
  app.post('/api/v1/agents', async (req, reply) => {
    const projectId = getProjectId(req);
    try {
      const body = req.body as any;
      const member = MemberService.create({
        ...body,
        type: 'agent',
        projectId,
      });
      return reply.code(201).send(member);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.get('/api/v1/agents/:identifier/tokens', async (req, reply) => {
    const { identifier } = req.params as any;
    const projectId = getProjectId(req);
    return AuthService.listAgentTokens(identifier, projectId).map((row: any) => ({
      id: row.id,
      name: row.name,
      clientType: row.clientType,
      tokenPrefix: row.tokenPrefix,
      status: row.status,
      expiresAt: row.expiresAt,
      lastUsedAt: row.lastUsedAt,
      createdAt: row.createdAt,
    }));
  });

  app.post('/api/v1/agents/:identifier/tokens', async (req, reply) => {
    const { identifier } = req.params as any;
    const projectId = getProjectId(req);
    try {
      const body = req.body as any;
      const result = AuthService.createAgentToken({
        memberIdentifier: identifier,
        projectId,
        clientType: body.client_type,
        name: body.name,
        expiresAt: body.expires_at,
      });
      return reply.code(201).send({
        id: result.row.id,
        token: result.token,
        tokenPrefix: result.row.tokenPrefix,
        clientType: result.row.clientType,
        name: result.row.name,
        status: result.row.status,
        expiresAt: result.row.expiresAt,
      });
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post('/api/v1/agents/:identifier/tokens/:id/rotate', async (req, reply) => {
    const { identifier, id } = req.params as any;
    const projectId = getProjectId(req);
    try {
      const body = req.body as any;
      const result = AuthService.rotateAgentToken(parseInt(id, 10), identifier, projectId, body.client_type, body.name);
      return {
        id: result.row.id,
        token: result.token,
        tokenPrefix: result.row.tokenPrefix,
        clientType: result.row.clientType,
        name: result.row.name,
        status: result.row.status,
        expiresAt: result.row.expiresAt,
      };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post('/api/v1/agents/:identifier/tokens/:id/revoke', async (req, reply) => {
    const { identifier, id } = req.params as any;
    const projectId = getProjectId(req);
    AuthService.revokeAgentToken(parseInt(id, 10), identifier, projectId);
    return { ok: true };
  });

  app.get('/api/v1/agents/:identifier/openclaw-config', async (req, reply) => {
    const { identifier } = req.params as any;
    const projectId = getProjectId(req);
    try {
      const configBundle = AuthService.buildOpenClawConfig({
        memberIdentifier: identifier,
        projectId,
        baseUrl: getBaseUrl(req),
      });
      return configBundle;
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
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

  // ── Attachments（节点附件 v2.2）─────────────────────────────────
  app.get('/api/v1/tasks/:taskId/attachments', async (req, reply) => {
    const { taskId } = req.params as any;
    const { type } = req.query as any;
    return AttachmentService.list(taskId, type);
  });

  app.post('/api/v1/tasks/:taskId/attachments', async (req, reply) => {
    const { taskId } = req.params as any;
    const body = req.body as any;
    const attachment = AttachmentService.add(taskId, {
      type: body.type,
      title: body.title,
      content: body.content,
      metadata: body.metadata,
      created_by: body.created_by,
    });
    if (!attachment) return reply.code(404).send({ error: 'Task not found' });
    return reply.code(201).send(attachment);
  });

  app.get('/api/v1/attachments/:id', async (req, reply) => {
    const { id } = req.params as any;
    const a = AttachmentService.getById(parseInt(id));
    if (!a) return reply.code(404).send({ error: 'Not found' });
    return a;
  });

  app.patch('/api/v1/attachments/:id', async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;
    const a = AttachmentService.update(parseInt(id), {
      title: body.title,
      content: body.content,
      metadata: body.metadata,
      sort_order: body.sort_order,
    });
    if (!a) return reply.code(404).send({ error: 'Not found' });
    return a;
  });

  app.delete('/api/v1/attachments/:id', async (req, reply) => {
    const { id } = req.params as any;
    const ok = AttachmentService.delete(parseInt(id));
    if (!ok) return reply.code(404).send({ error: 'Not found' });
    return { ok: true };
  });

  app.patch('/api/v1/tasks/:taskId/attachments/reorder', async (req, reply) => {
    const { taskId } = req.params as any;
    const { ordered_ids } = req.body as any;
    const ok = AttachmentService.reorder(taskId, ordered_ids);
    if (!ok) return reply.code(404).send({ error: 'Task not found' });
    return { ok: true };
  });

  // ── Image Upload（v3.4 图片上传）────────────────────────────────────
  app.post('/api/v1/upload/image', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: 'No file provided' });

    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowed.includes(data.mimetype)) {
      return reply.code(400).send({ error: `Unsupported file type: ${data.mimetype}. Allowed: ${allowed.join(', ')}` });
    }

    const ext = data.filename?.split('.').pop()?.toLowerCase() || 'png';
    const safeExt = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? ext : 'png';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

    const uploadPath = path.join(path.dirname(config.dbPath), 'uploads');
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

    const filePath = path.join(uploadPath, filename);
    await pipeline(data.file, fs.createWriteStream(filePath));

    return reply.code(201).send({ url: `/uploads/${filename}`, filename });
  });

  // ── My Overview（个人概览 v2.4）────────────────────────────────────
  app.get('/api/v1/my/overview', async (req, reply) => {
    const user = (req as any).clawpmUser as string | null;
    if (!user) return reply.code(400).send({ error: 'No identity set. Send X-ClawPM-User header.' });

    const projectId = getProjectId(req);
    const userTasks = TaskService.list({ owner: user, projectId });

    const now = new Date().toISOString().slice(0, 10);
    return {
      active: userTasks.filter((t: any) => t.status === 'active').length,
      review: userTasks.filter((t: any) => t.status === 'review').length,
      planned: userTasks.filter((t: any) => t.status === 'planned').length,
      overdue: userTasks.filter((t: any) => t.dueDate && t.dueDate < now && t.status !== 'done').length,
      total: userTasks.length,
    };
  });

  // ── Permissions（节点权限控制 v2.5）────────────────────────────────
  app.get('/api/v1/tasks/:taskId/permissions', async (req, reply) => {
    const db = getDb();
    const { taskId } = req.params as any;
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return reply.code(404).send({ error: 'Task not found' });

    const permissions = PermissionService.listForTask(task.id);
    // 附加当前用户的有效权限
    const user = (req as any).clawpmUser as string | null;
    const myPermission = user ? PermissionService.getEffectivePermission(task.id, task.owner, user) : null;
    return { taskId: task.taskId, owner: task.owner, permissions, myPermission };
  });

  app.post('/api/v1/tasks/:taskId/permissions', async (req, reply) => {
    const db = getDb();
    const { taskId } = req.params as any;
    const { grantee, level } = req.body as any;

    if (!grantee || !level) return reply.code(400).send({ error: 'grantee and level are required' });
    if (!['edit', 'view'].includes(level)) return reply.code(400).send({ error: 'level must be "edit" or "view"' });

    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return reply.code(404).send({ error: 'Task not found' });

    // 仅 Owner 可管理权限
    const user = (req as any).clawpmUser as string | null;
    if (user && task.owner !== user) {
      return reply.code(403).send({ error: '仅 Owner 可管理权限' });
    }

    // 验证被授权人是项目成员
    const projectId = getProjectId(req);
    const allMembers = db.select().from(members).where(eq(members.projectId, projectId)).all();
    if (!allMembers.find(m => m.identifier === grantee)) {
      return reply.code(400).send({ error: `被授权人 "${grantee}" 不是项目成员` });
    }

    // 不能给自己授权
    if (grantee === task.owner) {
      return reply.code(400).send({ error: 'Owner 无需授权自己' });
    }

    const perm = PermissionService.grant(task.id, grantee, level, user || task.owner || 'system');
    return reply.code(200).send({ taskId: task.taskId, grantee: perm.grantee, level: perm.level, grantedBy: perm.grantedBy });
  });

  app.delete('/api/v1/tasks/:taskId/permissions/:grantee', async (req, reply) => {
    const db = getDb();
    const { taskId, grantee } = req.params as any;
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return reply.code(404).send({ error: 'Task not found' });

    const user = (req as any).clawpmUser as string | null;
    if (user && task.owner !== user) {
      return reply.code(403).send({ error: '仅 Owner 可管理权限' });
    }

    const ok = PermissionService.revoke(task.id, grantee);
    if (!ok) return reply.code(404).send({ error: 'Permission not found' });
    return reply.code(204).send();
  });

  // ── Archive（归档 v3.0）────────────────────────────────────────────
  app.post('/api/v1/tasks/:taskId/archive', async (req, reply) => {
    const { taskId } = req.params as any;
    await requireEditPermission(req, taskId);
    const task = TaskService.archive(taskId);
    if (!task) return reply.code(404).send({ error: 'Not found' });
    return task;
  });

  app.post('/api/v1/tasks/:taskId/unarchive', async (req, reply) => {
    const { taskId } = req.params as any;
    const task = TaskService.unarchive(taskId);
    if (!task) return reply.code(404).send({ error: 'Not found' });
    return task;
  });

  // ── Iterations（迭代管理 v3.0）────────────────────────────────────
  app.get('/api/v1/iterations', async (req) => {
    const projectId = getProjectId(req);
    const q = req.query as any;
    return IterationService.list(projectId, q.status);
  });

  app.post('/api/v1/iterations', async (req, reply) => {
    const projectId = getProjectId(req);
    const { name, description, start_date, end_date } = req.body as any;
    if (!name) return reply.code(400).send({ error: 'name is required' });
    const iter = IterationService.create({ name, description, startDate: start_date, endDate: end_date, projectId });
    return reply.code(201).send(iter);
  });

  app.get('/api/v1/iterations/:id', async (req, reply) => {
    const { id } = req.params as any;
    const iter = IterationService.getById(parseInt(id));
    if (!iter) return reply.code(404).send({ error: 'Not found' });
    return iter;
  });

  app.patch('/api/v1/iterations/:id', async (req, reply) => {
    const { id } = req.params as any;
    const body = req.body as any;
    const iter = IterationService.update(parseInt(id), {
      name: body.name,
      description: body.description,
      startDate: body.start_date,
      endDate: body.end_date,
      status: body.status,
    });
    if (!iter) return reply.code(404).send({ error: 'Not found' });
    return iter;
  });

  app.delete('/api/v1/iterations/:id', async (req, reply) => {
    const { id } = req.params as any;
    IterationService.delete(parseInt(id));
    return { ok: true };
  });

  app.post('/api/v1/iterations/:id/tasks', async (req, reply) => {
    const { id } = req.params as any;
    const { task_id } = req.body as any;
    if (!task_id) return reply.code(400).send({ error: 'task_id is required' });
    try {
      IterationService.addTask(parseInt(id), task_id);
      return { ok: true };
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  app.delete('/api/v1/iterations/:id/tasks/:taskId', async (req, reply) => {
    const { id, taskId } = req.params as any;
    IterationService.removeTask(parseInt(id), taskId);
    return { ok: true };
  });

  // ── Notifications（通知 v3.0）──────────────────────────────────────
  app.get('/api/v1/notifications', async (req, reply) => {
    const user = (req as any).clawpmUser as string | null;
    if (!user) return reply.code(400).send({ error: 'No identity set. Send X-ClawPM-User header.' });
    const projectId = getProjectId(req);
    const q = req.query as any;
    return NotificationService.listByRecipient(user, projectId, { unreadOnly: q.unread_only === 'true' });
  });

  app.get('/api/v1/notifications/unread-count', async (req, reply) => {
    const user = (req as any).clawpmUser as string | null;
    if (!user) return { count: 0 };
    const projectId = getProjectId(req);
    return { count: NotificationService.getUnreadCount(user, projectId) };
  });

  app.patch('/api/v1/notifications/:id/read', async (req, reply) => {
    const { id } = req.params as any;
    NotificationService.markAsRead(parseInt(id));
    return { ok: true };
  });

  app.post('/api/v1/notifications/read-all', async (req, reply) => {
    const user = (req as any).clawpmUser as string | null;
    if (!user) return reply.code(400).send({ error: 'No identity set' });
    const projectId = getProjectId(req);
    NotificationService.markAllAsRead(user, projectId);
    return { ok: true };
  });

  // ── Intake 收件箱（v3.1）──────────────────────────────────────────

  // 提交 Intake（公开接口，无需认证）
  app.post('/api/v1/intake', async (req, reply) => {
    const body = req.body as any;
    if (!body.title) return reply.code(400).send({ error: 'title is required' });
    if (!body.submitter) return reply.code(400).send({ error: 'submitter is required' });

    // 通过 project slug 解析 projectId
    const projectId = ProjectService.resolveProjectId(body.project);

    const item = await IntakeService.submit({
      title: body.title,
      description: body.description,
      category: body.category,
      submitter: body.submitter,
      priority: body.priority,
      projectId,
    });
    return reply.code(201).send(item);
  });

  // Intake 列表（需认证）
  app.get('/api/v1/intake', async (req) => {
    const q = req.query as any;
    const projectId = getProjectId(req);
    return IntakeService.list(projectId, { status: q.status, category: q.category });
  });

  // Intake 统计
  app.get('/api/v1/intake/stats', async (req) => {
    const projectId = getProjectId(req);
    return IntakeService.getStats(projectId);
  });

  // Intake 详情
  app.get('/api/v1/intake/:intakeId', async (req, reply) => {
    const { intakeId } = req.params as any;
    const projectId = getProjectId(req);
    const item = IntakeService.getByIntakeId(intakeId, projectId);
    if (!item) return reply.code(404).send({ error: 'Not found' });
    return item;
  });

  // 审核操作
  app.post('/api/v1/intake/:intakeId/review', async (req, reply) => {
    const { intakeId } = req.params as any;
    const body = req.body as any;
    const projectId = getProjectId(req);
    const reviewedBy = (req as any).clawpmUser || body.reviewed_by || 'unknown';

    if (!body.action) return reply.code(400).send({ error: 'action is required' });

    try {
      const result = await IntakeService.review(intakeId, {
        action: body.action,
        reviewedBy,
        reviewNote: body.review_note,
        parentTaskId: body.parent_task_id,
        owner: body.owner,
        priority: body.priority,
        extraLabels: body.extra_labels,
        projectId,
      });
      return result;
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // 暂缓恢复
  app.post('/api/v1/intake/:intakeId/reopen', async (req, reply) => {
    const { intakeId } = req.params as any;
    const projectId = getProjectId(req);
    try {
      const item = IntakeService.reopen(intakeId, projectId);
      return item;
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ── Gantt ──────────────────────────────────────────────────────────
  app.get('/api/v1/gantt', async (req) => {
    const db = getDb();
    const q = req.query as any;
    const projectId = getProjectId(req);
    let allTasks = db.select().from(tasks).where(eq(tasks.projectId, projectId)).all();

    if (q.domain) {
      const d = db.select().from(domains).where(eq(domains.name, q.domain)).get();
      if (d) allTasks = allTasks.filter(t => t.domainId === d.id);
    }
    if (q.owner) allTasks = allTasks.filter(t => t.owner === q.owner);

    const allMilestones = db.select().from(milestones).where(eq(milestones.projectId, projectId)).all();
    const allDomains = db.select().from(domains).where(eq(domains.projectId, projectId)).all();

    return {
      tasks: allTasks.map(t => {
        const domain = allDomains.find(d => d.id === t.domainId);
        return { ...t, domain: domain ? { name: domain.name, color: domain.color } : null };
      }),
      milestones: allMilestones,
    };
  });
}
