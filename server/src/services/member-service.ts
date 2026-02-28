import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { members, tasks } from '../db/schema.js';

export const MemberService = {
  list(type?: string) {
    const db = getDb();
    const rows = type
      ? db.select().from(members).where(eq(members.type, type)).all()
      : db.select().from(members).all();

    return rows.map(m => this._withStats(m));
  },

  getByIdentifier(identifier: string) {
    const db = getDb();
    const m = db.select().from(members).where(eq(members.identifier, identifier)).get();
    if (!m) return null;
    return this._withStats(m);
  },

  create(params: { name: string; identifier: string; type?: string; color?: string; description?: string }) {
    const db = getDb();
    db.insert(members).values({
      name: params.name,
      identifier: params.identifier,
      type: params.type || 'human',
      color: params.color || this._randomColor(),
      description: params.description,
    }).run();
    return this.getByIdentifier(params.identifier)!;
  },

  update(identifier: string, params: Partial<{ name: string; type: string; color: string; description: string }>) {
    const db = getDb();
    const m = db.select().from(members).where(eq(members.identifier, identifier)).get();
    if (!m) return null;
    const updates: Record<string, unknown> = {};
    if (params.name !== undefined) updates.name = params.name;
    if (params.type !== undefined) updates.type = params.type;
    if (params.color !== undefined) updates.color = params.color;
    if (params.description !== undefined) updates.description = params.description;
    db.update(members).set(updates as any).where(eq(members.identifier, identifier)).run();
    return this.getByIdentifier(identifier)!;
  },

  delete(identifier: string) {
    const db = getDb();
    db.delete(members).where(eq(members.identifier, identifier)).run();
    return { ok: true };
  },

  _withStats(m: any) {
    const db = getDb();
    const allTasks = db.select().from(tasks).where(eq(tasks.owner, m.identifier)).all();
    const active = allTasks.filter(t => t.status === 'active').length;
    return { ...m, taskCount: allTasks.length, activeCount: active };
  },

  _randomColor() {
    const colors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'];
    return colors[Math.floor(Math.random() * colors.length)];
  },
};
