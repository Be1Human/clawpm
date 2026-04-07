import { eq, and, like, inArray } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { members, tasks, projectMembers } from '../db/schema.js';

export const MemberService = {
  // ── 系统成员 CRUD（全局，与项目无关）──────────────────────────

  /** 列出所有系统成员，可按 type 过滤 */
  listAll(type?: string) {
    const db = getDb();
    const conditions: any[] = [];
    if (type) conditions.push(eq(members.type, type));
    const rows = conditions.length
      ? db.select().from(members).where(and(...conditions)).all()
      : db.select().from(members).all();
    return rows;
  },

  /** 搜索系统成员（按名称或标识符模糊匹配） */
  search(query: string, type?: string) {
    const db = getDb();
    const conditions: any[] = [];
    if (query) {
      // SQLite LIKE 不区分大小写
      conditions.push(
        like(members.name, `%${query}%`)
      );
    }
    if (type) conditions.push(eq(members.type, type));
    const byName = conditions.length
      ? db.select().from(members).where(and(...conditions)).all()
      : db.select().from(members).all();

    // 也匹配 identifier
    if (query) {
      const byId = db.select().from(members).where(
        and(like(members.identifier, `%${query}%`), ...(type ? [eq(members.type, type)] : []))
      ).all();
      const ids = new Set(byName.map(m => m.id));
      for (const m of byId) {
        if (!ids.has(m.id)) byName.push(m);
      }
    }
    return byName;
  },

  /** 列出某个项目的成员（通过 project_members 关联表） */
  listByProject(projectId: number, type?: string) {
    const db = getDb();
    // 先查关联表
    const links = db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId)).all();
    if (!links.length) return [];
    const identifiers = links.map(l => l.memberIdentifier);
    const conditions: any[] = [inArray(members.identifier, identifiers)];
    if (type) conditions.push(eq(members.type, type));
    const rows = db.select().from(members).where(and(...conditions)).all();
    // 合并关联信息（role, joinedAt）
    return rows.map(m => {
      const link = links.find(l => l.memberIdentifier === m.identifier);
      return {
        ...m,
        projectRole: link?.role || null,
        joinedAt: link?.joinedAt || null,
        ...this._projectStats(m.identifier, projectId),
      };
    });
  },

  /** 按 identifier 获取系统成员 */
  getByIdentifier(identifier: string) {
    const db = getDb();
    const m = db.select().from(members).where(eq(members.identifier, identifier)).get();
    if (!m) return null;
    return m;
  },

  /** 按 identifier 获取系统成员并附带某项目的统计 */
  getByIdentifierWithStats(identifier: string, projectId?: number) {
    const m = this.getByIdentifier(identifier);
    if (!m) return null;
    if (projectId) {
      return { ...m, ...this._projectStats(m.identifier, projectId) };
    }
    return { ...m, ...this._globalStats(m.identifier) };
  },

  /** 创建系统成员 */
  create(params: { name: string; identifier: string; type?: string; color?: string; description?: string; role?: string; projectId?: number }) {
    const db = getDb();
    db.insert(members).values({
      name: params.name,
      identifier: params.identifier,
      type: params.type || 'human',
      color: params.color || this._randomColor(),
      description: params.description,
      role: params.role || null,
      projectId: params.projectId || 1, // 保留兼容
    } as any).run();
    return this.getByIdentifier(params.identifier)!;
  },

  /** 更新系统成员 */
  update(identifier: string, params: Partial<{ name: string; type: string; color: string; description: string; role: string; onboardedAt: string }>) {
    const db = getDb();
    const m = db.select().from(members).where(eq(members.identifier, identifier)).get();
    if (!m) return null;
    const updates: Record<string, unknown> = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.type !== undefined) updates.type = params.type;
    if (params.color !== undefined) updates.color = params.color;
    if (params.description !== undefined) updates.description = params.description;
    if (params.role !== undefined) updates.role = params.role;
    if (params.onboardedAt !== undefined) updates.onboarded_at = params.onboardedAt;
    db.update(members).set(updates as any).where(eq(members.identifier, identifier)).run();
    return this.getByIdentifier(identifier)!;
  },

  /** 删除系统成员（同时清理所有项目关联） */
  delete(identifier: string) {
    const db = getDb();
    db.delete(projectMembers).where(eq(projectMembers.memberIdentifier, identifier)).run();
    db.delete(members).where(eq(members.identifier, identifier)).run();
    return { ok: true };
  },

  // ── 项目成员关联操作 ──────────────────────────────────────────

  /** 添加系统成员到项目 */
  addToProject(projectId: number, memberIdentifier: string, role?: string) {
    const db = getDb();
    // 检查系统成员是否存在
    const m = db.select().from(members).where(eq(members.identifier, memberIdentifier)).get();
    if (!m) throw new Error(`系统成员 "${memberIdentifier}" 不存在`);
    // 检查是否已关联
    const existing = db.select().from(projectMembers).where(and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.memberIdentifier, memberIdentifier),
    )).get();
    if (existing) throw new Error(`成员 "${memberIdentifier}" 已在项目中`);
    db.insert(projectMembers).values({
      projectId,
      memberIdentifier,
      role: role || null,
    } as any).run();
    return { ...m, projectRole: role || null };
  },

  /** 从项目移除成员 */
  removeFromProject(projectId: number, memberIdentifier: string) {
    const db = getDb();
    db.delete(projectMembers).where(and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.memberIdentifier, memberIdentifier),
    )).run();
    return { ok: true };
  },

  /** 更新项目成员角色 */
  updateProjectRole(projectId: number, memberIdentifier: string, role: string) {
    const db = getDb();
    db.update(projectMembers).set({ role } as any).where(and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.memberIdentifier, memberIdentifier),
    )).run();
    return { ok: true };
  },

  /** 检查成员是否属于某项目 */
  isProjectMember(projectId: number, memberIdentifier: string) {
    const db = getDb();
    const link = db.select().from(projectMembers).where(and(
      eq(projectMembers.projectId, projectId),
      eq(projectMembers.memberIdentifier, memberIdentifier),
    )).get();
    return !!link;
  },

  // ── 兼容旧接口：list 方法保持旧行为 ──────────────────────────

  /** 兼容旧接口：按 projectId 列出项目成员 */
  list(type?: string, projectId?: number) {
    if (projectId) {
      return this.listByProject(projectId, type);
    }
    return this.listAll(type);
  },

  // ── 内部方法 ──────────────────────────────────────────────────

  /** 统计成员在某项目中的任务数 */
  _projectStats(identifier: string, projectId: number) {
    const db = getDb();
    const allTasks = db.select().from(tasks).where(
      and(eq(tasks.owner, identifier), eq(tasks.projectId, projectId))
    ).all();
    const active = allTasks.filter(t => t.status === 'active').length;
    return { taskCount: allTasks.length, activeCount: active };
  },

  /** 统计成员全局任务数 */
  _globalStats(identifier: string) {
    const db = getDb();
    const allTasks = db.select().from(tasks).where(eq(tasks.owner, identifier)).all();
    const active = allTasks.filter(t => t.status === 'active').length;
    return { taskCount: allTasks.length, activeCount: active };
  },

  /** 用于外部调用的 _withStats（兼容） */
  _withStats(m: any) {
    if (m.projectId) {
      return { ...m, ...this._projectStats(m.identifier, m.projectId) };
    }
    return { ...m, ...this._globalStats(m.identifier) };
  },

  _randomColor() {
    const colors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];
    return colors[Math.floor(Math.random() * colors.length)];
  },
};
