import { eq, and, desc, asc, like, or, isNull, lt, lte, sql } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { tasks, taskNotes, progressHistory, domains, milestones, customFields, taskFieldValues, taskAttachments, taskIterations, objectiveTaskLinks, reqLinks, taskPermissions } from '../db/schema.js';
import { generateTaskId } from './id-generator.js';
import { NotificationService } from './notification-service.js';

export interface CreateTaskParams {
  title: string;
  description?: string;
  labels?: string[];
  domain?: string;
  priority?: string;
  milestone?: string;
  owner?: string;
  assignee?: string;
  due_date?: string;
  start_date?: string;
  parent_task_id?: string;
  tags?: string[];
  source?: string;
  status?: string;
  projectId?: number;
}

export interface UpdateTaskParams {
  title?: string;
  description?: string;
  labels?: string[];
  parent_task_id?: string | null;
  status?: string;
  priority?: string;
  owner?: string;
  assignee?: string;
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
  assignee?: string;
  priority?: string;
  search?: string;
  label?: string;
  projectId?: number;
  includeArchived?: boolean;
}

export const TaskService = {
  async create(params: CreateTaskParams) {
    const db = getDb();
    const projectId = params.projectId || 1;

    let domainId: number | undefined;
    if (params.domain) {
      const d = db.select().from(domains).where(and(eq(domains.name, params.domain), eq(domains.projectId, projectId))).get();
      if (d) domainId = d.id;
    }

    let milestoneId: number | undefined;
    if (params.milestone) {
      const m = db.select().from(milestones).where(and(eq(milestones.name, params.milestone), eq(milestones.projectId, projectId))).get();
      if (m) milestoneId = m.id;
    }

    let parentTaskId: number | undefined;
    if (params.parent_task_id) {
      const parent = db.select().from(tasks).where(eq(tasks.taskId, params.parent_task_id)).get();
      if (parent) {
        parentTaskId = parent.id;
        if (!domainId && parent.domainId) domainId = parent.domainId;
      }
    }


    const taskId = await generateTaskId(domainId, projectId);

    db.insert(tasks).values({
      taskId,
      projectId,
      title: params.title,
      description: params.description,
      domainId,
      milestoneId,
      parentTaskId: parentTaskId ?? null,
      priority: params.priority || 'P2',
      owner: params.owner,
      assignee: params.assignee || null,
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

    // 默认过滤已归档任务
    if (!filters.includeArchived) conditions.push(isNull(tasks.archivedAt));

    if (filters.projectId) conditions.push(eq(tasks.projectId, filters.projectId));
    if (filters.status) conditions.push(eq(tasks.status, filters.status));
    if (filters.owner) conditions.push(eq(tasks.owner, filters.owner));
    if (filters.assignee) conditions.push(eq(tasks.assignee, filters.assignee));
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
    if (params.assignee !== undefined) updates.assignee = params.assignee;
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

    // 通知触发
    try {
      const projectId = task.projectId || 1;
      if (params.owner !== undefined && params.owner && params.owner !== task.owner) {
        NotificationService.create({
          projectId,
          recipientId: params.owner,
          type: 'task_assigned',
          title: `你被指派为任务负责人: ${task.title}`,
          content: `任务 ${taskId} 的负责人已设为你`,
          taskId,
        });
      }
      if (params.assignee !== undefined && params.assignee && params.assignee !== (task as any).assignee) {
        NotificationService.create({
          projectId,
          recipientId: params.assignee,
          type: 'task_assigned',
          title: `你被指派为处理人: ${task.title}`,
          content: `任务 ${taskId} 已分配给你处理`,
          taskId,
        });
      }
      if (params.status !== undefined && params.status !== task.status && task.owner) {
        NotificationService.create({
          projectId,
          recipientId: task.owner,
          type: 'status_changed',
          title: `任务状态变更: ${task.title}`,
          content: `任务 ${taskId} 状态从 ${task.status} 变为 ${params.status}`,
          taskId,
        });
      }
    } catch {}

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

    // 通知触发：备注通知任务 owner
    try {
      if (task.owner && author && author !== task.owner) {
        NotificationService.create({
          projectId: task.projectId || 1,
          recipientId: task.owner,
          type: 'note_added',
          title: `${author} 在任务 ${taskId} 添加了备注`,
          content: content.slice(0, 100),
          taskId,
        });
      }
    } catch {}

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

  getTree(domainName?: string, filters: { milestone?: string; status?: string; owner?: string; label?: string; projectId?: number; includeArchived?: boolean } = {}) {
    const db = getDb();
    let allTasks = db.select().from(tasks).all();

    // 默认过滤已归档任务
    if (!filters.includeArchived) {
      allTasks = allTasks.filter(t => !(t as any).archivedAt);
    }

    // 项目过滤
    if (filters.projectId) {
      allTasks = allTasks.filter(t => (t as any).projectId === filters.projectId);
    }

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
    const roots = enriched.filter(t => !t.parentTaskId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return roots.map(r => this._buildSubtree(r, enriched));
  },

  getChildren(taskId: string) {
    const db = getDb();
    const parent = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!parent) return [];
    const children = db.select().from(tasks).where(eq(tasks.parentTaskId, parent.id)).all();
    return children.map(t => this._enrichTask(t));
  },

  /** 获取任务的树上下文：祖先链 + 同级节点 + 直接子节点 */
  getTaskContext(taskId: string) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return null;

    // 1. 构建祖先链（从根到当前节点的路径）
    const ancestors: any[] = [];
    let cur = task;
    while (cur.parentTaskId) {
      const parent = db.select().from(tasks).where(eq(tasks.id, cur.parentTaskId)).get();
      if (!parent) break;
      ancestors.unshift(this._enrichTask(parent));
      cur = parent;
    }

    // 2. 获取同级节点（共同父节点下的其他节点）
    const siblings = task.parentTaskId
      ? db.select().from(tasks).where(eq(tasks.parentTaskId, task.parentTaskId)).all()
          .filter(t => t.id !== task.id)
          .sort((a, b) => ((a as any).sortOrder ?? 0) - ((b as any).sortOrder ?? 0))
          .map(t => this._enrichTask(t))
      : [];

    // 3. 获取直接子节点
    const children = db.select().from(tasks).where(eq(tasks.parentTaskId, task.id)).all()
      .sort((a, b) => ((a as any).sortOrder ?? 0) - ((b as any).sortOrder ?? 0))
      .map(t => this._enrichTask(t));

    return {
      current: this._enrichTask(task),
      ancestors,
      siblings,
      children,
    };
  },

  _buildSubtree(node: any, allTasks: any[]): any {
    const children = allTasks
      .filter(t => t.parentTaskId === node.id)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
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
      // _isDescendant(startId, targetId) 从 startId 的子树中查找 targetId
      // 所以要从 task.id 的子树中找 parent.id
      if (this._isDescendant(task.id, parent.id)) {
        throw new Error('循环引用：不能将节点移入自己的子树');
      }
      newParentId = parent.id;
    }

    // 计算新父节点下的最大 sortOrder，放到末尾
    const siblings = newParentId
      ? db.select().from(tasks).where(eq(tasks.parentTaskId, newParentId)).all()
      : db.select().from(tasks).where(isNull(tasks.parentTaskId)).all();
    const maxSort = siblings.reduce((max, s) => Math.max(max, (s as any).sortOrder ?? 0), 0);

    db.update(tasks).set({
      parentTaskId: newParentId,
      sortOrder: maxSort + 1,
      updatedAt: new Date().toISOString(),
    } as any).where(eq(tasks.taskId, taskId)).run();
    return this.getByTaskId(taskId)!;
  },

  // 同级排序：接受父节点 ID + 子节点 taskId 有序数组，批量更新 sortOrder
  reorderChildren(parentTaskId: string | null, orderedChildIds: string[]) {
    const db = getDb();

    // 解析父节点的内部 ID
    let parentId: number | null = null;
    if (parentTaskId) {
      const parent = db.select().from(tasks).where(eq(tasks.taskId, parentTaskId)).get();
      if (!parent) return false;
      parentId = parent.id;
    }

    // 验证所有子节点确实属于该父节点
    for (let i = 0; i < orderedChildIds.length; i++) {
      const child = db.select().from(tasks).where(eq(tasks.taskId, orderedChildIds[i])).get();
      if (!child) continue;
      db.update(tasks).set({ sortOrder: i, updatedAt: new Date().toISOString() } as any)
        .where(eq(tasks.taskId, orderedChildIds[i])).run();
    }
    return true;
  },

  // 从 startId 的子树（后代）中查找 targetId 是否存在
  // 返回 true 表示 targetId 是 startId 的子孙
  _isDescendant(startId: number, targetId: number): boolean {
    const db = getDb();
    const visited = new Set<number>();
    const queue = [startId];
    while (queue.length) {
      const cur = queue.pop()!;
      if (cur === targetId) return true;
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

    const fieldValues = db.select().from(taskFieldValues).where(eq(taskFieldValues.taskId, task.id)).all();
    const allFields = fieldValues.length > 0
      ? db.select().from(customFields).all()
      : [];

    const customFieldsMap: Record<string, string> = {};
    const customFieldValuesList = fieldValues.map(v => {
      const field = allFields.find(f => f.id === v.fieldId);
      if (field) customFieldsMap[field.name] = v.value;
      return { fieldId: v.fieldId, fieldName: field?.name, fieldType: field?.fieldType, value: v.value };
    });

    const attachmentCount = db.select().from(taskAttachments).where(eq(taskAttachments.taskId, task.id)).all().length;

    // 解析父节点的 taskId 字符串
    let parentTaskIdStr: string | null = null;
    if (task.parentTaskId) {
      const parentRow = db.select().from(tasks).where(eq(tasks.id, task.parentTaskId)).get();
      if (parentRow) parentTaskIdStr = parentRow.taskId;
    }

    return {
      ...task,
      tags: JSON.parse(task.tags || '[]'),
      labels,
      parentTaskIdStr,
      domain: domain ? { id: domain.id, name: domain.name, color: domain.color } : null,
      milestone: milestone ? { id: milestone.id, name: milestone.name } : null,
      customFields: customFieldsMap,
      customFieldValues: customFieldValuesList,
      attachmentCount,
    };
  },

  /** 归档任务 */
  archive(taskId: string) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return null;
    db.update(tasks).set({
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any).where(eq(tasks.taskId, taskId)).run();
    return this.getByTaskId(taskId)!;
  },

  /** 恢复归档任务 */
  unarchive(taskId: string) {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return null;
    db.update(tasks).set({
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    } as any).where(eq(tasks.taskId, taskId)).run();
    return this.getByTaskId(taskId)!;
  },

  /** 列出已归档任务 */
  listArchived(projectId: number) {
    const db = getDb();
    const rows = db.select().from(tasks)
      .where(and(eq(tasks.projectId, projectId), sql`${tasks.archivedAt} IS NOT NULL`))
      .orderBy(desc(tasks.updatedAt))
      .all();
    return rows.map(t => this._enrichTask(t));
  },

  /** 批量更新任务 */
  batchUpdate(taskIds: string[], updates: { status?: string; owner?: string; assignee?: string; priority?: string; labels?: string[] }) {
    const db = getDb();
    const results: any[] = [];
    for (const tid of taskIds) {
      const task = db.select().from(tasks).where(eq(tasks.taskId, tid)).get();
      if (!task) continue;
      const setObj: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (updates.status !== undefined) setObj.status = updates.status;
      if (updates.owner !== undefined) setObj.owner = updates.owner;
      if (updates.assignee !== undefined) setObj.assignee = updates.assignee;
      if (updates.priority !== undefined) setObj.priority = updates.priority;
      if (updates.labels !== undefined) setObj.labels = JSON.stringify(updates.labels);
      db.update(tasks).set(setObj as any).where(eq(tasks.taskId, tid)).run();

      // 通知触发
      try {
        const projectId = task.projectId || 1;
        if (updates.owner && updates.owner !== task.owner) {
          NotificationService.create({
            projectId,
            recipientId: updates.owner,
            type: 'task_assigned',
            title: `你被指派为负责人: ${task.title}`,
            content: `任务 ${tid} 的负责人已设为你（批量操作）`,
            taskId: tid,
          });
        }
        if (updates.assignee && updates.assignee !== (task as any).assignee) {
          NotificationService.create({
            projectId,
            recipientId: updates.assignee,
            type: 'task_assigned',
            title: `你被指派为处理人: ${task.title}`,
            content: `任务 ${tid} 已分配给你处理（批量操作）`,
            taskId: tid,
          });
        }
      } catch {}

      results.push(this.getByTaskId(tid));
    }
    return results.filter(Boolean);
  },

  /**
   * 轻量级树形大纲 —— 仅返回 taskId、title、labels、status、depth 等最小信息，
   * 不执行 _enrichTask，避免 N+1 查询，适合 Agent 快速浏览树结构。
   */
  getTreeOutline(filters: { projectId?: number; domain?: string; owner?: string; maxDepth?: number } = {}) {
    const db = getDb();
    let allRows = db.select().from(tasks).all();

    // 仅保留未归档任务
    allRows = allRows.filter(t => !(t as any).archivedAt);

    if (filters.projectId) {
      allRows = allRows.filter(t => (t as any).projectId === filters.projectId);
    }
    if (filters.domain) {
      const d = db.select().from(domains).where(eq(domains.name, filters.domain)).get();
      if (d) allRows = allRows.filter(t => t.domainId === d.id);
    }
    if (filters.owner) {
      allRows = allRows.filter(t => t.owner === filters.owner);
    }

    // 构建 id → row 索引
    const idMap = new Map(allRows.map(t => [t.id, t]));

    // 计算每个节点的深度和路径
    const depthCache = new Map<number, number>();
    const pathCache = new Map<number, string[]>();

    function getDepth(id: number): number {
      if (depthCache.has(id)) return depthCache.get(id)!;
      const row = idMap.get(id);
      if (!row || !row.parentTaskId || !idMap.has(row.parentTaskId)) {
        depthCache.set(id, 0);
        return 0;
      }
      const d = getDepth(row.parentTaskId) + 1;
      depthCache.set(id, d);
      return d;
    }

    function getPath(id: number): string[] {
      if (pathCache.has(id)) return pathCache.get(id)!;
      const row = idMap.get(id);
      if (!row) { pathCache.set(id, []); return []; }
      if (!row.parentTaskId || !idMap.has(row.parentTaskId)) {
        const p = [row.taskId];
        pathCache.set(id, p);
        return p;
      }
      const p = [...getPath(row.parentTaskId), row.taskId];
      pathCache.set(id, p);
      return p;
    }

    // 计算每个节点的直接子节点数
    const childCountMap = new Map<number, number>();
    for (const t of allRows) {
      if (t.parentTaskId && idMap.has(t.parentTaskId)) {
        childCountMap.set(t.parentTaskId, (childCountMap.get(t.parentTaskId) || 0) + 1);
      }
    }

    // 构建大纲数据
    const outline = allRows.map(t => {
      let labels: string[] = [];
      try { labels = JSON.parse(t.labels || '[]'); } catch {}

      const depth = getDepth(t.id);

      return {
        taskId: t.taskId,
        title: t.title,
        status: t.status,
        priority: t.priority,
        labels,
        owner: t.owner,
        depth,
        childCount: childCountMap.get(t.id) || 0,
        path: getPath(t.id),
        parentTaskId: t.parentTaskId ? idMap.get(t.parentTaskId)?.taskId || null : null,
      };
    });

    // 深度限制
    const maxDepth = filters.maxDepth;
    const filtered = maxDepth !== undefined ? outline.filter(n => n.depth <= maxDepth) : outline;

    // 按深度 + sortOrder 排序，让输出呈现出树形缩进结构
    return filtered.sort((a, b) => {
      // 按路径字典序排，自然形成树的先序遍历
      const pathA = a.path.join('/');
      const pathB = b.path.join('/');
      return pathA.localeCompare(pathB);
    });
  },

  /**
   * 智能推荐父节点 —— 根据输入的标题/描述/标签，在现有树结构中匹配最合适的父节点。
   * 返回排名靠前的候选父节点列表（最多 limit 个），每个附带匹配分数和路径。
   */
  suggestParent(params: {
    title: string;
    description?: string;
    labels?: string[];
    projectId?: number;
    limit?: number;
  }) {
    const db = getDb();
    const { title, description, labels: inputLabels, projectId, limit: maxResults = 5 } = params;

    let allRows = db.select().from(tasks).all();
    allRows = allRows.filter(t => !(t as any).archivedAt);
    if (projectId) allRows = allRows.filter(t => (t as any).projectId === projectId);

    if (allRows.length === 0) return [];

    // 构建索引
    const idMap = new Map(allRows.map(t => [t.id, t]));

    // 计算深度
    const depthCache = new Map<number, number>();
    function getDepth(id: number): number {
      if (depthCache.has(id)) return depthCache.get(id)!;
      const row = idMap.get(id);
      if (!row || !row.parentTaskId || !idMap.has(row.parentTaskId)) {
        depthCache.set(id, 0);
        return 0;
      }
      const d = getDepth(row.parentTaskId) + 1;
      depthCache.set(id, d);
      return d;
    }

    // 构建祖先路径（taskId 字符串）
    function getAncestorPath(id: number): string[] {
      const path: string[] = [];
      let cur = idMap.get(id);
      while (cur) {
        path.unshift(cur.taskId);
        if (!cur.parentTaskId || !idMap.has(cur.parentTaskId)) break;
        cur = idMap.get(cur.parentTaskId);
      }
      return path;
    }

    // 子节点数统计
    const childCountMap = new Map<number, number>();
    for (const t of allRows) {
      if (t.parentTaskId && idMap.has(t.parentTaskId)) {
        childCountMap.set(t.parentTaskId, (childCountMap.get(t.parentTaskId) || 0) + 1);
      }
    }

    // 提取关键词（从标题和描述中拆分）
    const extractKeywords = (text: string): string[] => {
      return text.toLowerCase()
        .replace(/[^\w\u4e00-\u9fff]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 1);
    };

    const inputKeywords = new Set([
      ...extractKeywords(title),
      ...(description ? extractKeywords(description) : []),
    ]);
    const inputLabelSet = new Set((inputLabels || []).map(l => l.toLowerCase()));

    // 为每个现有节点计算匹配分数
    const scored = allRows.map(t => {
      let score = 0;

      // 1. 关键词匹配（标题）
      const taskKeywords = extractKeywords(t.title);
      const descKeywords = t.description ? extractKeywords(t.description) : [];
      const allTaskKw = new Set([...taskKeywords, ...descKeywords]);

      let kwMatches = 0;
      for (const kw of inputKeywords) {
        for (const tkw of allTaskKw) {
          if (tkw.includes(kw) || kw.includes(tkw)) {
            kwMatches++;
            break;
          }
        }
      }
      if (inputKeywords.size > 0) {
        score += (kwMatches / inputKeywords.size) * 40; // 最多 40 分
      }

      // 2. 标签匹配
      let taskLabels: string[] = [];
      try { taskLabels = JSON.parse(t.labels || '[]'); } catch {}
      const taskLabelSet = new Set(taskLabels.map(l => l.toLowerCase()));

      if (inputLabelSet.size > 0) {
        let labelMatches = 0;
        for (const l of inputLabelSet) {
          if (taskLabelSet.has(l)) labelMatches++;
        }
        score += (labelMatches / inputLabelSet.size) * 30; // 最多 30 分
      }

      // 3. 结构偏好：优先选择已有子节点的节点（说明它是分类/容器节点）
      const childCount = childCountMap.get(t.id) || 0;
      if (childCount > 0) score += Math.min(15, childCount * 3); // 最多 15 分

      // 4. 深度惩罚：太深的节点不太适合作为父节点
      const depth = getDepth(t.id);
      score -= depth * 2; // 每深一层扣 2 分

      // 5. 状态偏好：活跃/计划中的节点更适合作为父节点
      if (t.status === 'done') score -= 10;
      if (t.status === 'active' || t.status === 'planned') score += 5;

      return {
        taskId: t.taskId,
        title: t.title,
        status: t.status,
        labels: taskLabels,
        owner: t.owner,
        depth,
        childCount,
        path: getAncestorPath(t.id),
        score: Math.round(score * 100) / 100,
      };
    });

    // 按分数降序排列，取前 N 个
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults).filter(s => s.score > 0);
  },

  /** 删除任务及其所有子任务（级联删除备注/进度/字段值/附件） */
  deleteTask(taskId: string): boolean {
    const db = getDb();
    const task = db.select().from(tasks).where(eq(tasks.taskId, taskId)).get();
    if (!task) return false;

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
      db.delete(taskAttachments).where(eq(taskAttachments.taskId, id)).run();
      db.delete(taskIterations).where(eq(taskIterations.taskId, id)).run();
      // 清理无 ON DELETE CASCADE 的关联表
      db.delete(objectiveTaskLinks).where(eq(objectiveTaskLinks.taskId, id)).run();
      // reqLinks 和 taskPermissions 虽有 CASCADE，但显式清理更安全
      db.delete(reqLinks).where(or(eq(reqLinks.sourceTaskId, id), eq(reqLinks.targetTaskId, id))).run();
      db.delete(taskPermissions).where(eq(taskPermissions.taskId, id)).run();
      db.delete(tasks).where(eq(tasks.id, id)).run();
    }
    return true;
  },
};
