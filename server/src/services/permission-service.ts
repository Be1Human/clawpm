import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { taskPermissions, tasks, members } from '../db/schema.js';

export type PermLevel = 'owner' | 'edit' | 'view' | 'none';

export const PermissionService = {
  /**
   * 获取用户对某任务的有效权限等级
   * 优先级: owner > edit > view > none
   * 无任何权限记录的节点视为公开（返回 'edit'）
   */
  getEffectivePermission(taskInternalId: number, taskOwner: string | null, user: string): PermLevel {
    if (!user) return 'edit'; // 未设身份 → 兼容模式
    if (user === taskOwner) return 'owner';

    const db = getDb();
    const perm = db.select()
      .from(taskPermissions)
      .where(and(eq(taskPermissions.taskId, taskInternalId), eq(taskPermissions.grantee, user)))
      .get();

    if (perm) return perm.level as PermLevel;

    // 检查该节点是否有任何权限记录（受控模式判定）
    const countResult = db.select({ count: sql<number>`count(*)` })
      .from(taskPermissions)
      .where(eq(taskPermissions.taskId, taskInternalId))
      .get();

    if (!countResult || countResult.count === 0) return 'edit'; // 公开模式
    return 'none'; // 受控模式，该用户不在授权列表中
  },

  /** 授予或更新权限（幂等：已存在则更新 level） */
  grant(taskInternalId: number, grantee: string, level: 'edit' | 'view', grantedBy: string) {
    const db = getDb();
    const existing = db.select()
      .from(taskPermissions)
      .where(and(eq(taskPermissions.taskId, taskInternalId), eq(taskPermissions.grantee, grantee)))
      .get();

    if (existing) {
      db.update(taskPermissions)
        .set({ level, updatedAt: new Date().toISOString() })
        .where(eq(taskPermissions.id, existing.id))
        .run();
      return { ...existing, level };
    }

    db.insert(taskPermissions).values({
      taskId: taskInternalId,
      grantee,
      level,
      grantedBy,
    }).run();

    return db.select()
      .from(taskPermissions)
      .where(and(eq(taskPermissions.taskId, taskInternalId), eq(taskPermissions.grantee, grantee)))
      .get()!;
  },

  /** 撤销权限 */
  revoke(taskInternalId: number, grantee: string): boolean {
    const db = getDb();
    const existing = db.select()
      .from(taskPermissions)
      .where(and(eq(taskPermissions.taskId, taskInternalId), eq(taskPermissions.grantee, grantee)))
      .get();
    if (!existing) return false;
    db.delete(taskPermissions).where(eq(taskPermissions.id, existing.id)).run();
    return true;
  },

  /** 获取任务的所有权限列表 */
  listForTask(taskInternalId: number) {
    const db = getDb();
    const perms = db.select()
      .from(taskPermissions)
      .where(eq(taskPermissions.taskId, taskInternalId))
      .all();

    // 附加被授权人信息
    const allMembers = db.select().from(members).all();
    return perms.map(p => {
      const member = allMembers.find(m => m.identifier === p.grantee);
      return {
        ...p,
        granteeInfo: member ? { name: member.name, type: member.type, color: member.color } : null,
      };
    });
  },

  /** 获取某用户被授权的所有任务ID列表 */
  listForUser(grantee: string) {
    const db = getDb();
    return db.select()
      .from(taskPermissions)
      .where(eq(taskPermissions.grantee, grantee))
      .all();
  },
};
