import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TaskService } from '../services/task-service.js';
import { BacklogService } from '../services/backlog-service.js';
import { RiskService } from '../services/risk-service.js';
import { getDb } from '../db/connection.js';
import { domains, milestones, goals, objectives, objectiveTaskLinks } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

export function createMcpServer() {
  const mcp = new McpServer({
    name: 'ClawPM',
    version: '1.0.0',
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
  }, async (p) => {
    const task = await TaskService.create(p);
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
    owner: z.string().describe('负责人标识'),
    status: z.enum(['backlog', 'planned', 'active', 'review', 'done']).optional(),
  }, async (p) => {
    const tasks = TaskService.listByOwner(p.owner, p.status);
    return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] };
  });

  mcp.tool('list_tasks', '查询节点列表', {
    status: z.enum(['backlog', 'planned', 'active', 'review', 'done']).optional(),
    domain: z.string().optional(),
    milestone: z.string().optional(),
    owner: z.string().optional(),
    priority: z.string().optional(),
    label: z.string().optional().describe('按标签筛选，如 epic/bug/feature'),
  }, async (p) => {
    const tasks = TaskService.list(p);
    return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] };
  });

  mcp.tool('update_progress', 'Agent 上报任务进度', {
    task_id: z.string(),
    progress: z.number().min(0).max(100).describe('完成百分比 0-100'),
    summary: z.string().optional().describe('本次进展摘要'),
  }, async (p) => {
    const task = TaskService.updateProgress(p.task_id, p.progress, p.summary);
    if (!task) return { content: [{ type: 'text', text: '任务不存在' }] };
    return { content: [{ type: 'text', text: `✅ ${p.task_id} 进度已更新为 ${p.progress}%` }] };
  });

  mcp.tool('complete_task', '标记任务完成', {
    task_id: z.string(),
    summary: z.string().optional().describe('完成摘要'),
  }, async (p) => {
    const task = TaskService.complete(p.task_id, p.summary);
    if (!task) return { content: [{ type: 'text', text: '任务不存在' }] };
    return { content: [{ type: 'text', text: `🎉 ${p.task_id} 已标记为完成` }] };
  });

  mcp.tool('report_blocker', '报告任务阻塞', {
    task_id: z.string(),
    blocker: z.string().describe('阻塞原因描述'),
  }, async (p) => {
    const task = TaskService.reportBlocker(p.task_id, p.blocker);
    if (!task) return { content: [{ type: 'text', text: '任务不存在' }] };
    return { content: [{ type: 'text', text: `🚧 ${p.task_id} 阻塞已记录` }] };
  });

  mcp.tool('add_task_note', '给任务添加备注', {
    task_id: z.string(),
    content: z.string(),
    author: z.string().optional(),
  }, async (p) => {
    const note = TaskService.addNote(p.task_id, p.content, p.author);
    if (!note) return { content: [{ type: 'text', text: '任务不存在' }] };
    return { content: [{ type: 'text', text: '📝 备注已添加' }] };
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
  }, async (p) => {
    const item = await BacklogService.create(p);
    return { content: [{ type: 'text', text: `✅ 已录入需求池 ${item.backlogId}: ${item.title}` }] };
  });

  mcp.tool('list_backlog', '查看需求池', {
    domain: z.string().optional(),
    priority: z.string().optional(),
    status: z.enum(['pool', 'scheduled', 'cancelled']).optional(),
  }, async (p) => {
    const items = BacklogService.list(p);
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
    return { content: [{ type: 'text', text: `📋 ${backlog_id} 已排期，创建任务 ${task.taskId}` }] };
  });

  // ── Project Overview Tools ─────────────────────────────────────────
  mcp.tool('get_project_status', '获取项目整体状态概览', {}, async () => {
    const status = RiskService.getProjectStatus();
    return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
  });

  mcp.tool('get_risk_report', '获取风险报告（逾期/阻塞/停滞）', {}, async () => {
    const report = RiskService.analyze();
    return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
  });

  mcp.tool('get_resource_allocation', '获取资源投入分布（谁在做什么）', {}, async () => {
    const report = RiskService.analyze();
    return { content: [{ type: 'text', text: JSON.stringify(report.byDomain, null, 2) }] };
  });

  // ── Config Tools ───────────────────────────────────────────────────
  mcp.tool('create_domain', '创建业务板块', {
    name: z.string(),
    task_prefix: z.string().describe('任务 ID 前缀，如 U、P'),
    keywords: z.array(z.string()).optional(),
    color: z.string().optional().describe('十六进制颜色'),
  }, async (p) => {
    const db = getDb();
    db.insert(domains).values({
      name: p.name,
      taskPrefix: p.task_prefix,
      keywords: JSON.stringify(p.keywords || []),
      color: p.color || '#6366f1',
    }).run();
    return { content: [{ type: 'text', text: `✅ 业务板块「${p.name}」已创建` }] };
  });

  mcp.tool('list_domains', '列出所有业务板块', {}, async () => {
    const db = getDb();
    const list = db.select().from(domains).all();
    return { content: [{ type: 'text', text: JSON.stringify(list, null, 2) }] };
  });

  mcp.tool('create_milestone', '创建里程碑', {
    name: z.string(),
    target_date: z.string().optional().describe('目标日期 YYYY-MM-DD'),
    description: z.string().optional(),
  }, async (p) => {
    const db = getDb();
    db.insert(milestones).values({ name: p.name, targetDate: p.target_date, description: p.description }).run();
    return { content: [{ type: 'text', text: `✅ 里程碑「${p.name}」已创建` }] };
  });

  mcp.tool('list_milestones', '列出所有里程碑', {}, async () => {
    const db = getDb();
    const list = db.select().from(milestones).all();
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
  }, async (p) => {
    const db = getDb();
    db.insert(goals).values({
      title: p.title, description: p.description,
      targetDate: p.target_date, setBy: p.set_by,
    }).run();
    const goal = db.select().from(goals).orderBy(desc(goals.id)).limit(1).get()!;
    if (p.objectives?.length) {
      for (const obj of p.objectives) {
        db.insert(objectives).values({ goalId: goal.id, title: obj.title, weight: obj.weight || 1.0 }).run();
      }
    }
    return { content: [{ type: 'text', text: `✅ 目标「${p.title}」已创建 (G-${goal.id})` }] };
  });

  return mcp;
}
