import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TaskService } from '../services/task-service.js';
import { BacklogService } from '../services/backlog-service.js';
import { RiskService } from '../services/risk-service.js';
import { AttachmentService } from '../services/attachment-service.js';
import { PermissionService } from '../services/permission-service.js';
import { ProjectService } from '../services/project-service.js';
import { MemberService } from '../services/member-service.js';
import { IterationService } from '../services/iteration-service.js';
import { NotificationService } from '../services/notification-service.js';
import { getDb } from '../db/connection.js';
import { domains, milestones, goals, objectives, objectiveTaskLinks } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

/** 从 project slug 解析 projectId */
function resolveProject(project?: string): number {
  return ProjectService.resolveProjectId(project);
}

export function createMcpServer(options?: { agentId?: string }) {
  const agentId = options?.agentId || null;
  const mcp = new McpServer({
    name: 'ClawPM',
    version: '1.0.0',
  });

  // ── Project Tools（v2.1 新增）──────────────────────────────────────
  mcp.tool('list_projects', '列出所有项目', {
    include_archived: z.boolean().optional().describe('是否包含已归档项目'),
  }, async (p) => {
    const list = ProjectService.list(p.include_archived);
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  mcp.tool('create_project', '创建新项目', {
    name: z.string().describe('项目名称'),
    slug: z.string().optional().describe('URL 友好标识，不填则自动生成'),
    description: z.string().optional(),
  }, async (p) => {
    const proj = ProjectService.create(p);
    return { content: [{ type: 'text', text: `项目已创建：${proj.name} (${proj.slug})\n${JSON.stringify(proj, null, 2)}` }] };
  });

  mcp.tool('get_project', '获取项目详情', {
    slug: z.string().describe('项目 slug'),
  }, async (p) => {
    const proj = ProjectService.getBySlug(p.slug);
    if (!proj) return { content: [{ type: 'text', text: '项目不存在' }] };
    return { content: [{ type: 'text', text: JSON.stringify(proj, null, 2) }] };
  });

  mcp.tool('update_project', '更新项目信息', {
    slug: z.string().describe('项目 slug'),
    name: z.string().optional(),
    description: z.string().optional(),
    archived: z.boolean().optional(),
  }, async (p) => {
    const proj = ProjectService.update(p.slug, { name: p.name, description: p.description, archived: p.archived });
    if (!proj) return { content: [{ type: 'text', text: '项目不存在' }] };
    return { content: [{ type: 'text', text: JSON.stringify(proj, null, 2) }] };
  });

  mcp.tool('delete_project', '删除项目（默认项目不可删除）', {
    slug: z.string().describe('项目 slug'),
  }, async (p) => {
    const ok = ProjectService.delete(p.slug);
    if (!ok) return { content: [{ type: 'text', text: '无法删除（默认项目不可删除或项目不存在）' }] };
    return { content: [{ type: 'text', text: `项目 ${p.slug} 已删除` }] };
  });

  // ── Task Tools ─────────────────────────────────────────────────────
  mcp.tool('create_task', '创建需求节点（只需 title，其余可选）', {
    title: z.string().describe('节点标题（唯一必填）'),
    description: z.string().optional(),
    parent_task_id: z.string().optional().describe('父节点 ID，如 U-001'),
    labels: z.array(z.string()).optional().describe('标签数组，如 ["epic", "用户系统"]'),
    domain: z.string().optional().describe('业务板块名称'),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
    milestone: z.string().optional().describe('里程碑名称'),
    owner: z.string().optional().describe('负责人'),
    due_date: z.string().optional().describe('截止日期 YYYY-MM-DD'),
    status: z.enum(['backlog', 'planned', 'active', 'review', 'done']).optional().describe('状态，默认 backlog'),
    tags: z.array(z.string()).optional(),
    project: z.string().optional().describe('项目 slug，不填则使用默认项目'),
  }, async (p) => {
    const { project, ...rest } = p;
    const projectId = resolveProject(project);
    const task = await TaskService.create({ ...rest, projectId });
    return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
  });

  mcp.tool('get_task', '获取任务详情', {
    task_id: z.string().describe('任务 ID，如 U-001'),
  }, async (p) => {
    const task = TaskService.getByTaskId(p.task_id);
    if (!task) return { content: [{ type: 'text', text: '任务不存在' }] };
    return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
  });

  mcp.tool('get_my_tasks', '获取我的任务列表', {
    owner: z.string().optional().describe('负责人标识（不传时使用 Agent 绑定身份）'),
    status: z.enum(['backlog', 'planned', 'active', 'review', 'done']).optional(),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const effectiveOwner = p.owner || agentId;
    if (!effectiveOwner) return { content: [{ type: 'text' as const, text: 'owner 参数必填（当前无 Agent 身份绑定）' }] };
    const projectId = resolveProject(p.project);
    const tasks = TaskService.list({ owner: effectiveOwner, status: p.status, projectId });
    return { content: [{ type: 'text' as const, text: JSON.stringify(tasks, null, 2) }] };
  });

  mcp.tool('list_tasks', '查询节点列表', {
    status: z.enum(['backlog', 'planned', 'active', 'review', 'done']).optional(),
    domain: z.string().optional(),
    milestone: z.string().optional(),
    owner: z.string().optional(),
    priority: z.string().optional(),
    label: z.string().optional().describe('按标签筛选，如 epic/bug/feature'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const { project, ...rest } = p;
    const projectId = resolveProject(project);
    const tasks = TaskService.list({ ...rest, projectId });
    return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] };
  });

  mcp.tool('update_progress', 'Agent 上报任务进度', {
    task_id: z.string(),
    progress: z.number().min(0).max(100).describe('完成百分比 0-100'),
    summary: z.string().optional().describe('本次进展摘要'),
  }, async (p) => {
    const task = TaskService.updateProgress(p.task_id, p.progress, p.summary);
    if (!task) return { content: [{ type: 'text', text: '任务不存在' }] };
    return { content: [{ type: 'text', text: `[OK] ${p.task_id} 进度已更新为 ${p.progress}%` }] };
  });

  mcp.tool('complete_task', '标记任务完成', {
    task_id: z.string(),
    summary: z.string().optional().describe('完成摘要'),
  }, async (p) => {
    const task = TaskService.complete(p.task_id, p.summary);
    if (!task) return { content: [{ type: 'text', text: '任务不存在' }] };
    return { content: [{ type: 'text', text: `[DONE] ${p.task_id} 已标记为完成` }] };
  });

  mcp.tool('report_blocker', '报告任务阻塞', {
    task_id: z.string(),
    blocker: z.string().describe('阻塞原因描述'),
  }, async (p) => {
    const task = TaskService.reportBlocker(p.task_id, p.blocker);
    if (!task) return { content: [{ type: 'text', text: '任务不存在' }] };
    return { content: [{ type: 'text', text: `[BLOCKED] ${p.task_id} 阻塞已记录` }] };
  });

  mcp.tool('add_task_note', '给任务添加备注', {
    task_id: z.string(),
    content: z.string(),
    author: z.string().optional(),
  }, async (p) => {
    const note = TaskService.addNote(p.task_id, p.content, p.author);
    if (!note) return { content: [{ type: 'text', text: '任务不存在' }] };
    return { content: [{ type: 'text', text: '[OK] 备注已添加' }] };
  });

  mcp.tool('update_task', '更新节点信息', {
    task_id: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    labels: z.array(z.string()).optional().describe('标签数组'),
    parent_task_id: z.string().optional().describe('修改父节点 ID，传空字符串可取消父子关系'),
    status: z.enum(['backlog', 'planned', 'active', 'review', 'done']).optional(),
    priority: z.string().optional(),
    owner: z.string().optional(),
    due_date: z.string().optional(),
    milestone: z.string().optional(),
    domain: z.string().optional(),
  }, async (p) => {
    const { task_id, ...rest } = p;
    const task = TaskService.update(task_id, rest);
    if (!task) return { content: [{ type: 'text', text: '任务不存在' }] };
    return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
  });

  mcp.tool('delete_task', '删除任务及其所有子任务', {
    task_id: z.string().describe('任务 ID，如 U-001'),
  }, async (p) => {
    const ok = TaskService.deleteTask(p.task_id);
    if (!ok) return { content: [{ type: 'text', text: '任务不存在' }] };
    return { content: [{ type: 'text', text: `[DEL] ${p.task_id} 及其子任务已删除` }] };
  });

  mcp.tool('request_next_task', '请求推荐下一个任务', {
    owner: z.string().optional(),
    domain: z.string().optional(),
  }, async (p) => {
    const task = TaskService.recommendNext(p.owner, p.domain);
    if (!task) return { content: [{ type: 'text', text: '当前没有待领取的任务' }] };
    return { content: [{ type: 'text', text: `推荐任务：\n${JSON.stringify(task, null, 2)}` }] };
  });

  // ── Backlog Tools ──────────────────────────────────────────────────
  mcp.tool('create_backlog_item', '录入需求池', {
    title: z.string(),
    description: z.string().optional(),
    domain: z.string().optional(),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional(),
    source: z.string().optional().describe('来源，如"决策者口述"'),
    source_context: z.string().optional(),
    estimated_scope: z.enum(['small', 'medium', 'large']).optional(),
    tags: z.array(z.string()).optional(),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const { project, ...rest } = p;
    const projectId = resolveProject(project);
    const item = await BacklogService.create({ ...rest, projectId });
    return { content: [{ type: 'text', text: `[OK] 已录入需求池 ${item.backlogId}: ${item.title}` }] };
  });

  mcp.tool('list_backlog', '查看需求池', {
    domain: z.string().optional(),
    priority: z.string().optional(),
    status: z.enum(['pool', 'scheduled', 'cancelled']).optional(),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const { project, ...rest } = p;
    const projectId = resolveProject(project);
    const items = BacklogService.list({ ...rest, projectId });
    return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
  });

  mcp.tool('schedule_backlog_item', '将需求排期并创建任务', {
    backlog_id: z.string().describe('需求 ID，如 BL-001'),
    milestone: z.string().optional(),
    owner: z.string().optional(),
    due_date: z.string().optional(),
    priority: z.string().optional(),
  }, async (p) => {
    const { backlog_id, ...rest } = p;
    const task = await BacklogService.schedule(backlog_id, rest);
    if (!task) return { content: [{ type: 'text', text: '需求不存在' }] };
    return { content: [{ type: 'text', text: `[OK] ${backlog_id} 已排期，创建任务 ${task.taskId}` }] };
  });

  // ── Project Overview Tools ─────────────────────────────────────────
  mcp.tool('get_project_status', '获取项目整体状态概览', {
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const projectId = resolveProject(p.project);
    const status = RiskService.getProjectStatus(projectId);
    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
  });

  mcp.tool('get_risk_report', '获取风险报告（逾期/阻塞/停滞）', {
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const projectId = resolveProject(p.project);
    const report = RiskService.analyze(projectId);
    return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
  });

  mcp.tool('get_resource_allocation', '获取资源投入分布（谁在做什么）', {
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const projectId = resolveProject(p.project);
    const report = RiskService.analyze(projectId);
    return { content: [{ type: 'text', text: JSON.stringify(report.byDomain, null, 2) }] };
  });

  // ── Config Tools ───────────────────────────────────────────────────
  mcp.tool('create_domain', '创建业务板块', {
    name: z.string(),
    task_prefix: z.string().describe('任务 ID 前缀，如 U、P'),
    keywords: z.array(z.string()).optional(),
    color: z.string().optional().describe('十六进制颜色'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const db = getDb();
    const projectId = resolveProject(p.project);
    db.insert(domains).values({
      name: p.name,
      taskPrefix: p.task_prefix,
      keywords: JSON.stringify(p.keywords || []),
      color: p.color || '#6366f1',
      projectId,
    } as any).run();
    return { content: [{ type: 'text', text: `[OK] 业务板块「${p.name}」已创建` }] };
  });

  mcp.tool('list_domains', '列出所有业务板块', {
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const db = getDb();
    const projectId = resolveProject(p.project);
    const list = db.select().from(domains).where(eq(domains.projectId, projectId)).all();
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  mcp.tool('create_milestone', '创建里程碑', {
    name: z.string(),
    target_date: z.string().optional().describe('目标日期 YYYY-MM-DD'),
    description: z.string().optional(),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const db = getDb();
    const projectId = resolveProject(p.project);
    db.insert(milestones).values({ name: p.name, targetDate: p.target_date, description: p.description, projectId } as any).run();
    return { content: [{ type: 'text', text: `[OK] 里程碑「${p.name}」已创建` }] };
  });

  mcp.tool('list_milestones', '列出所有里程碑', {
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const db = getDb();
    const projectId = resolveProject(p.project);
    const list = db.select().from(milestones).where(eq(milestones.projectId, projectId)).all();
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  mcp.tool('create_goal', '创建目标（OKR）', {
    title: z.string(),
    description: z.string().optional(),
    target_date: z.string().optional(),
    set_by: z.string().optional(),
    objectives: z.array(z.object({
      title: z.string(),
      weight: z.number().optional(),
    })).optional(),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const db = getDb();
    const projectId = resolveProject(p.project);
    db.insert(goals).values({
      title: p.title, description: p.description,
      targetDate: p.target_date, setBy: p.set_by,
      projectId,
    } as any).run();
    const goal = db.select().from(goals).orderBy(desc(goals.id)).limit(1).get()!;
    if (p.objectives?.length) {
      for (const obj of p.objectives) {
        db.insert(objectives).values({ goalId: goal.id, title: obj.title, weight: obj.weight || 1.0 }).run();
      }
    }
    return { content: [{ type: 'text', text: `[OK] 目标「${p.title}」已创建 (G-${goal.id})` }] };
  });

  // ── Attachment Tools（v2.2）─────────────────────────────────────
  mcp.tool('add_task_attachment', '为节点添加附件（文档/链接/TAPD关联）', {
    task_id: z.string().describe('节点 ID，如 U-001'),
    type: z.enum(['doc', 'link', 'tapd']).describe('附件类型：doc=Markdown文档, link=外部链接, tapd=TAPD单关联'),
    title: z.string().describe('附件标题，如"需求文档"、"Figma设计稿"'),
    content: z.string().describe('内容：doc类型为Markdown正文, link类型为URL, tapd类型为TAPD单ID'),
    metadata: z.record(z.unknown()).optional().describe('扩展元数据 JSON'),
    created_by: z.string().optional(),
  }, async (p) => {
    const a = AttachmentService.add(p.task_id, {
      type: p.type,
      title: p.title,
      content: p.content,
      metadata: p.metadata as Record<string, unknown>,
      created_by: p.created_by,
    });
    if (!a) return { content: [{ type: 'text' as const, text: '节点不存在' }] };
    return { content: [{ type: 'text' as const, text: `附件已添加：${p.title} (${p.type})` }] };
  });

  mcp.tool('list_task_attachments', '查询节点的附件列表', {
    task_id: z.string().describe('节点 ID'),
    type: z.enum(['doc', 'link', 'tapd']).optional().describe('按类型筛选'),
  }, async (p) => {
    const list = AttachmentService.list(p.task_id, p.type);
    return { content: [{ type: 'text' as const, text: JSON.stringify(list, null, 2) }] };
  });

  mcp.tool('update_task_attachment', '更新附件内容', {
    attachment_id: z.number().describe('附件 ID'),
    title: z.string().optional(),
    content: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }, async (p) => {
    const a = AttachmentService.update(p.attachment_id, {
      title: p.title,
      content: p.content,
      metadata: p.metadata as Record<string, unknown>,
    });
    if (!a) return { content: [{ type: 'text' as const, text: '附件不存在' }] };
    return { content: [{ type: 'text' as const, text: `附件已更新：${a.title}` }] };
  });

  mcp.tool('delete_task_attachment', '删除附件', {
    attachment_id: z.number().describe('附件 ID'),
  }, async (p) => {
    const ok = AttachmentService.delete(p.attachment_id);
    if (!ok) return { content: [{ type: 'text' as const, text: '附件不存在' }] };
    return { content: [{ type: 'text' as const, text: '附件已删除' }] };
  });

  // ── Identity Tools（v2.4 协作身份）──────────────────────────────
  mcp.tool('whoami', '查询当前 Agent 绑定的身份信息', {}, async () => {
    if (!agentId) {
      return { content: [{ type: 'text' as const, text: '当前无身份绑定。请通过 CLAWPM_AGENT_ID 环境变量或 --agent-id 参数设置。' }] };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify({ agentId, message: `You are ${agentId}` }, null, 2) }] };
  });

  mcp.tool('get_my_task_tree', '获取我的需求子树（带祖先路径上下文）', {
    owner: z.string().optional().describe('负责人标识（不传时使用 Agent 绑定身份）'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const effectiveOwner = p.owner || agentId;
    if (!effectiveOwner) return { content: [{ type: 'text' as const, text: 'owner 参数必填（当前无 Agent 身份绑定）' }] };
    const projectId = resolveProject(p.project);
    const tree = TaskService.getTree(undefined, { owner: effectiveOwner, projectId });
    return { content: [{ type: 'text' as const, text: JSON.stringify(tree, null, 2) }] };
  });

  // ── Member Tools（v3.2 成员管理）──────────────────────────────────
  mcp.tool('list_members', '列出项目成员（含擅长领域、任务统计 taskCount/activeCount）', {
    type: z.enum(['human', 'agent']).optional().describe('按类型筛选：human=人类, agent=AI Agent'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const projectId = resolveProject(p.project);
    const list = MemberService.list(p.type, projectId);
    return { content: [{ type: 'text' as const, text: JSON.stringify(list, null, 2) }] };
  });

  mcp.tool('get_member', '获取单个成员详情（含擅长领域和任务负载）', {
    identifier: z.string().describe('成员标识符，如 alice、frontend-agent'),
  }, async (p) => {
    const member = MemberService.getByIdentifier(p.identifier);
    if (!member) return { content: [{ type: 'text' as const, text: '成员不存在' }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify(member, null, 2) }] };
  });

  mcp.tool('create_member', '创建项目成员（人类或 AI Agent）', {
    name: z.string().describe('显示名称'),
    identifier: z.string().describe('唯一标识符（将作为任务 owner 字段的值）'),
    type: z.enum(['human', 'agent']).optional().describe('成员类型，默认 human'),
    color: z.string().optional().describe('头像颜色，不填则随机分配'),
    description: z.string().optional().describe('擅长领域、职责范围描述'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const projectId = resolveProject(p.project);
    try {
      const member = MemberService.create({
        name: p.name,
        identifier: p.identifier,
        type: p.type,
        color: p.color,
        description: p.description,
        projectId,
      });
      return { content: [{ type: 'text' as const, text: `[OK] 成员已创建：${member.name} (${member.identifier})\n${JSON.stringify(member, null, 2)}` }] };
    } catch (e: any) {
      return { content: [{ type: 'text' as const, text: `创建失败：${e.message}` }] };
    }
  });

  mcp.tool('update_member', '更新成员信息（名称、描述/擅长领域、类型等）', {
    identifier: z.string().describe('成员标识符'),
    name: z.string().optional().describe('新名称'),
    type: z.enum(['human', 'agent']).optional().describe('更新类型'),
    color: z.string().optional().describe('更新颜色'),
    description: z.string().optional().describe('更新擅长领域/职责描述'),
  }, async (p) => {
    const { identifier, ...updates } = p;
    const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const member = MemberService.update(identifier, cleanUpdates);
    if (!member) return { content: [{ type: 'text' as const, text: '成员不存在' }] };
    return { content: [{ type: 'text' as const, text: `[OK] 成员已更新：${member.name}\n${JSON.stringify(member, null, 2)}` }] };
  });

  mcp.tool('delete_member', '删除成员（不会影响已分配的任务）', {
    identifier: z.string().describe('成员标识符'),
  }, async (p) => {
    const member = MemberService.getByIdentifier(p.identifier);
    if (!member) return { content: [{ type: 'text' as const, text: '成员不存在' }] };
    MemberService.delete(p.identifier);
    return { content: [{ type: 'text' as const, text: `[OK] 成员 ${p.identifier} 已删除` }] };
  });

  // ── Permission Tools（v2.5 节点权限控制）──────────────────────────
  mcp.tool('grant_permission', '为节点授予权限（仅 Owner 可操作）', {
    task_id: z.string().describe('节点业务ID，如 U-001'),
    grantee: z.string().describe('被授权人 identifier'),
    level: z.enum(['edit', 'view']).describe('权限等级：edit=可编辑, view=仅查看'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const task = TaskService.getByTaskId(p.task_id);
    if (!task) return { content: [{ type: 'text' as const, text: '节点不存在' }] };

    // 验证调用者是 Owner
    const caller = agentId;
    if (caller && task.owner !== caller) {
      return { content: [{ type: 'text' as const, text: `无权操作：仅 Owner (${task.owner}) 可管理权限` }] };
    }

    // 验证被授权人是项目成员
    const projectId = resolveProject(p.project);
    const allMembers = MemberService.list(undefined, projectId);
    if (!allMembers.find((m: any) => m.identifier === p.grantee)) {
      return { content: [{ type: 'text' as const, text: `被授权人 "${p.grantee}" 不是项目成员` }] };
    }

    const perm = PermissionService.grant(task.id, p.grantee, p.level, caller || task.owner || 'system');
    return { content: [{ type: 'text' as const, text: `[OK] 已授予 ${p.grantee} 对 ${p.task_id} 的 ${p.level} 权限` }] };
  });

  mcp.tool('revoke_permission', '撤销节点权限（仅 Owner 可操作）', {
    task_id: z.string().describe('节点业务ID'),
    grantee: z.string().describe('被撤销人 identifier'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const task = TaskService.getByTaskId(p.task_id);
    if (!task) return { content: [{ type: 'text' as const, text: '节点不存在' }] };

    const caller = agentId;
    if (caller && task.owner !== caller) {
      return { content: [{ type: 'text' as const, text: `无权操作：仅 Owner (${task.owner}) 可管理权限` }] };
    }

    const ok = PermissionService.revoke(task.id, p.grantee);
    if (!ok) return { content: [{ type: 'text' as const, text: '该授权不存在' }] };
    return { content: [{ type: 'text' as const, text: `[OK] 已撤销 ${p.grantee} 对 ${p.task_id} 的权限` }] };
  });

  mcp.tool('list_permissions', '查看节点的权限列表', {
    task_id: z.string().describe('节点业务ID'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const task = TaskService.getByTaskId(p.task_id);
    if (!task) return { content: [{ type: 'text' as const, text: '节点不存在' }] };

    const permissions = PermissionService.listForTask(task.id);
    const result = { taskId: task.taskId, owner: task.owner, permissions };
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  });

  // ── Iteration Tools（v3.0 迭代管理）──────────────────────────────
  mcp.tool('create_iteration', '创建迭代（Cycle）', {
    name: z.string().describe('迭代名称'),
    description: z.string().optional(),
    start_date: z.string().optional().describe('开始日期 YYYY-MM-DD'),
    end_date: z.string().optional().describe('结束日期 YYYY-MM-DD'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const projectId = resolveProject(p.project);
    const iter = IterationService.create({ name: p.name, description: p.description, startDate: p.start_date, endDate: p.end_date, projectId });
    return { content: [{ type: 'text' as const, text: `迭代已创建：${iter.name}\n${JSON.stringify(iter, null, 2)}` }] };
  });

  mcp.tool('list_iterations', '查询迭代列表', {
    status: z.enum(['planned', 'active', 'completed']).optional().describe('按状态筛选'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const projectId = resolveProject(p.project);
    const list = IterationService.list(projectId, p.status);
    return { content: [{ type: 'text' as const, text: JSON.stringify(list, null, 2) }] };
  });

  mcp.tool('get_iteration', '获取迭代详情（含任务列表和统计）', {
    iteration_id: z.number().describe('迭代 ID'),
  }, async (p) => {
    const iter = IterationService.getById(p.iteration_id);
    if (!iter) return { content: [{ type: 'text' as const, text: '迭代不存在' }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify(iter, null, 2) }] };
  });

  mcp.tool('update_iteration', '更新迭代信息', {
    iteration_id: z.number().describe('迭代 ID'),
    name: z.string().optional(),
    description: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    status: z.enum(['planned', 'active', 'completed']).optional(),
  }, async (p) => {
    const { iteration_id, ...rest } = p;
    const iter = IterationService.update(iteration_id, { name: rest.name, description: rest.description, startDate: rest.start_date, endDate: rest.end_date, status: rest.status });
    if (!iter) return { content: [{ type: 'text' as const, text: '迭代不存在' }] };
    return { content: [{ type: 'text' as const, text: JSON.stringify(iter, null, 2) }] };
  });

  mcp.tool('delete_iteration', '删除迭代', {
    iteration_id: z.number().describe('迭代 ID'),
  }, async (p) => {
    const iter = IterationService.getById(p.iteration_id);
    if (!iter) return { content: [{ type: 'text' as const, text: '迭代不存在' }] };
    IterationService.delete(p.iteration_id);
    return { content: [{ type: 'text' as const, text: '迭代已删除' }] };
  });

  mcp.tool('add_task_to_iteration', '将任务添加到迭代', {
    iteration_id: z.number().describe('迭代 ID'),
    task_id: z.string().describe('任务 ID，如 U-001'),
  }, async (p) => {
    try {
      IterationService.addTask(p.iteration_id, p.task_id);
      return { content: [{ type: 'text' as const, text: `[OK] ${p.task_id} 已添加到迭代` }] };
    } catch (e: any) {
      return { content: [{ type: 'text' as const, text: `添加失败：${e.message}` }] };
    }
  });

  mcp.tool('remove_task_from_iteration', '将任务从迭代移除', {
    iteration_id: z.number().describe('迭代 ID'),
    task_id: z.string().describe('任务 ID，如 U-001'),
  }, async (p) => {
    IterationService.removeTask(p.iteration_id, p.task_id);
    return { content: [{ type: 'text' as const, text: `[OK] ${p.task_id} 已从迭代移除` }] };
    return { content: [{ type: 'text' as const, text: `[OK] ${p.task_id} 已从迭代移除` }] };
  });

  // ── Archive Tools（v3.0 归档）──────────────────────────────────────
  mcp.tool('archive_task', '归档任务', {
    task_id: z.string().describe('任务 ID，如 U-001'),
  }, async (p) => {
    const task = TaskService.archive(p.task_id);
    if (!task) return { content: [{ type: 'text' as const, text: '任务不存在' }] };
    return { content: [{ type: 'text' as const, text: `[OK] ${p.task_id} 已归档` }] };
  });

  mcp.tool('unarchive_task', '恢复已归档任务', {
    task_id: z.string().describe('任务 ID，如 U-001'),
  }, async (p) => {
    const task = TaskService.unarchive(p.task_id);
    if (!task) return { content: [{ type: 'text' as const, text: '任务不存在' }] };
    return { content: [{ type: 'text' as const, text: `[OK] ${p.task_id} 已恢复` }] };
  });

  mcp.tool('list_archived_tasks', '查看已归档任务列表', {
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const projectId = resolveProject(p.project);
    const list = TaskService.listArchived(projectId);
    return { content: [{ type: 'text' as const, text: JSON.stringify(list, null, 2) }] };
  });

  // ── Notification Tools（v3.0 通知）─────────────────────────────────
  mcp.tool('list_notifications', '获取通知列表', {
    recipient: z.string().optional().describe('接收人标识（不传时使用 Agent 绑定身份）'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const effectiveRecipient = p.recipient || agentId;
    if (!effectiveRecipient) return { content: [{ type: 'text' as const, text: 'recipient 参数必填（当前无 Agent 身份绑定）' }] };
    const projectId = resolveProject(p.project);
    const list = NotificationService.listByRecipient(effectiveRecipient, projectId);
    return { content: [{ type: 'text' as const, text: JSON.stringify(list, null, 2) }] };
  });

  mcp.tool('get_unread_notification_count', '获取未读通知数量', {
    recipient: z.string().optional().describe('接收人标识（不传时使用 Agent 绑定身份）'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const effectiveRecipient = p.recipient || agentId;
    if (!effectiveRecipient) return { content: [{ type: 'text' as const, text: 'recipient 参数必填（当前无 Agent 身份绑定）' }] };
    const projectId = resolveProject(p.project);
    const count = NotificationService.getUnreadCount(effectiveRecipient, projectId);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ unreadCount: count }) }] };
  });

  mcp.tool('mark_notification_read', '标记通知为已读', {
    notification_id: z.number().describe('通知 ID'),
  }, async (p) => {
    NotificationService.markAsRead(p.notification_id);
    return { content: [{ type: 'text' as const, text: '[OK] 通知已标记为已读' }] };
  });

  mcp.tool('mark_all_notifications_read', '标记所有通知为已读', {
    recipient: z.string().optional().describe('接收人标识（不传时使用 Agent 绑定身份）'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const effectiveRecipient = p.recipient || agentId;
    if (!effectiveRecipient) return { content: [{ type: 'text' as const, text: 'recipient 参数必填（当前无 Agent 身份绑定）' }] };
    const projectId = resolveProject(p.project);
    NotificationService.markAllAsRead(effectiveRecipient, projectId);
    return { content: [{ type: 'text' as const, text: '[OK] 所有通知已标记为已读' }] };
  });

  // ── Batch Operations Tools（v3.0 批量操作）─────────────────────────
  mcp.tool('batch_update_tasks', '批量更新任务', {
    task_ids: z.array(z.string()).describe('任务 ID 数组，如 ["U-001", "U-002"]'),
    status: z.enum(['backlog', 'planned', 'active', 'review', 'done']).optional(),
    priority: z.string().optional(),
    owner: z.string().optional(),
    labels: z.array(z.string()).optional(),
  }, async (p) => {
    const { task_ids, ...updates } = p;
    const cleanUpdates = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    if (Object.keys(cleanUpdates).length === 0) {
      return { content: [{ type: 'text' as const, text: '至少需要提供一个更新字段' }] };
    }
    const results = TaskService.batchUpdate(task_ids, cleanUpdates);
    return { content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }] };
  });

  // ── Intake Tools（v3.1 收件箱）──────────────────────────────────────
  mcp.tool('submit_intake', '提交收件箱条目（Bug报告/功能建议/一般反馈）', {
    title: z.string().describe('标题'),
    description: z.string().optional().describe('详细描述 (Markdown)'),
    category: z.enum(['bug', 'feature', 'feedback']).optional().describe('类别，默认 feedback'),
    submitter: z.string().describe('提交人名称'),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional().describe('建议优先级'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const projectId = resolveProject(p.project);
    const item = await IntakeService.submit({
      title: p.title,
      description: p.description,
      category: p.category,
      submitter: p.submitter,
      priority: p.priority,
      projectId,
    });
    return { content: [{ type: 'text' as const, text: `[OK] 已提交收件箱 ${item.intakeId}: ${item.title}\n${JSON.stringify(item, null, 2)}` }] };
  });

  mcp.tool('list_intake', '查看收件箱条目列表', {
    status: z.enum(['pending', 'accepted', 'rejected', 'deferred', 'duplicate']).optional().describe('状态筛选'),
    category: z.enum(['bug', 'feature', 'feedback']).optional().describe('类别筛选'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const projectId = resolveProject(p.project);
    const items = IntakeService.list(projectId, { status: p.status, category: p.category });
    return { content: [{ type: 'text' as const, text: JSON.stringify(items, null, 2) }] };
  });

  mcp.tool('review_intake', '审核收件箱条目', {
    intake_id: z.string().describe('Intake 业务 ID，如 IN-001'),
    action: z.enum(['accept', 'reject', 'defer', 'duplicate']).describe('审核动作'),
    review_note: z.string().optional().describe('审核备注'),
    parent_task_id: z.string().optional().describe('接受时指定父节点 ID'),
    owner: z.string().optional().describe('接受时指定负责人'),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']).optional().describe('接受时调整优先级'),
    extra_labels: z.array(z.string()).optional().describe('接受时追加的额外标签'),
    project: z.string().optional().describe('项目 slug'),
  }, async (p) => {
    const projectId = resolveProject(p.project);
    const reviewedBy = agentId || 'mcp-user';
    try {
      const result = await IntakeService.review(p.intake_id, {
        action: p.action,
        reviewedBy,
        reviewNote: p.review_note,
        parentTaskId: p.parent_task_id,
        owner: p.owner,
        priority: p.priority,
        extraLabels: p.extra_labels,
        projectId,
      });
      return { content: [{ type: 'text' as const, text: `[OK] ${p.intake_id} 已${p.action === 'accept' ? '接受' : p.action === 'reject' ? '拒绝' : p.action === 'defer' ? '暂缓' : '标记重复'}\n${JSON.stringify(result, null, 2)}` }] };
    } catch (e: any) {
      return { content: [{ type: 'text' as const, text: `审核失败：${e.message}` }] };
    }
  });

  return mcp;
}
