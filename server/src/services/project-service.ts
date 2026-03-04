import { eq, and, asc } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { projects } from '../db/schema.js';

export interface CreateProjectParams {
  name: string;
  slug?: string;
  description?: string;
}

export interface UpdateProjectParams {
  name?: string;
  description?: string;
  archived?: boolean;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    || 'project';
}

export const ProjectService = {
  list(includeArchived = false) {
    const db = getDb();
    if (includeArchived) {
      return db.select().from(projects).orderBy(asc(projects.id)).all();
    }
    return db.select().from(projects).where(eq(projects.archived, 0)).orderBy(asc(projects.id)).all();
  },

  getBySlug(slug: string) {
    const db = getDb();
    return db.select().from(projects).where(eq(projects.slug, slug)).get() ?? null;
  },

  getById(id: number) {
    const db = getDb();
    return db.select().from(projects).where(eq(projects.id, id)).get() ?? null;
  },

  /** 根据 slug 获取项目 ID，不存在则返回默认项目 ID (1) */
  resolveProjectId(slug?: string): number {
    if (!slug || slug === 'default') return 1;
    const p = this.getBySlug(slug);
    return p ? p.id : 1;
  },

  create(params: CreateProjectParams) {
    const db = getDb();
    let slug = params.slug || slugify(params.name);

    // 确保 slug 唯一
    const existing = db.select().from(projects).where(eq(projects.slug, slug)).get();
    if (existing) {
      slug = `${slug}-${Date.now()}`;
    }

    db.insert(projects).values({
      slug,
      name: params.name,
      description: params.description,
    }).run();

    return this.getBySlug(slug)!;
  },

  update(slug: string, params: UpdateProjectParams) {
    const db = getDb();
    const p = this.getBySlug(slug);
    if (!p) return null;

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (params.name !== undefined) updates.name = params.name;
    if (params.description !== undefined) updates.description = params.description;
    if (params.archived !== undefined) updates.archived = params.archived ? 1 : 0;

    db.update(projects).set(updates as any).where(eq(projects.id, p.id)).run();
    return this.getBySlug(slug)!;
  },

  delete(slug: string) {
    const db = getDb();
    const p = this.getBySlug(slug);
    if (!p || p.slug === 'default') return false; // 不允许删除默认项目
    db.delete(projects).where(eq(projects.id, p.id)).run();
    return true;
  },
};
