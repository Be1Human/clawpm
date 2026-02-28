import { eq, and, lt, lte, ne, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { tasks, domains } from '../db/schema.js';

export const RiskService = {
  analyze() {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];
    const in3Days = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

    const allActive = db.select().from(tasks)
      .where(ne(tasks.status, 'done'))
      .all();

    const overdue = allActive.filter(t =>
      t.dueDate && t.dueDate < today && t.status !== 'done' && t.status !== 'cancelled'
    );

    const atRisk = allActive.filter(t =>
      t.dueDate && t.dueDate >= today && t.dueDate <= in3Days && t.progress < 80 && t.status !== 'done'
    );

    const blocked = allActive.filter(t => t.blocker && t.status === 'blocked');

    const stalled = allActive.filter(t => {
      if (t.status !== 'active') return false;
      const updated = new Date(t.updatedAt).getTime();
      const daysSince = (Date.now() - updated) / 86400000;
      return daysSince > 3;
    });

    const healthScores = allActive.map(t => t.healthScore);
    const avgHealth = healthScores.length
      ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length)
      : 100;

    // By domain breakdown
    const domainList = db.select().from(domains).all();
    const byDomain = domainList.map(d => {
      const domainTasks = allActive.filter(t => t.domainId === d.id);
      const done = domainTasks.filter(t => t.status === 'done').length;
      const total = domainTasks.length;
      const avgP = total > 0
        ? Math.round(domainTasks.reduce((a, t) => a + t.progress, 0) / total)
        : 0;
      return { domain: d.name, color: d.color, total, done, progress: avgP };
    }).filter(d => d.total > 0);

    return {
      summary: {
        total: db.select().from(tasks).all().length,
        active: allActive.filter(t => t.status === 'active').length,
        done: db.select().from(tasks).where(eq(tasks.status, 'done')).all().length,
        overdue: overdue.length,
        blocked: blocked.length,
        avgHealth,
      },
      overdue: overdue.map(t => ({ taskId: t.taskId, title: t.title, dueDate: t.dueDate, owner: t.owner })),
      atRisk: atRisk.map(t => ({ taskId: t.taskId, title: t.title, dueDate: t.dueDate, progress: t.progress, owner: t.owner })),
      blocked: blocked.map(t => ({ taskId: t.taskId, title: t.title, blocker: t.blocker, owner: t.owner })),
      stalled: stalled.map(t => ({ taskId: t.taskId, title: t.title, updatedAt: t.updatedAt, owner: t.owner })),
      byDomain,
    };
  },

  getProjectStatus() {
    const db = getDb();
    const all = db.select().from(tasks).all();
    const total = all.length;
    const done = all.filter(t => t.status === 'done').length;
    const active = all.filter(t => t.status === 'active').length;
    const blocked = all.filter(t => t.status === 'blocked').length;
    const planned = all.filter(t => t.status === 'planned').length;

    const avgProgress = total > 0
      ? Math.round(all.reduce((a, t) => a + t.progress, 0) / total)
      : 0;

    const avgHealth = total > 0
      ? Math.round(all.filter(t => t.status !== 'done').reduce((a, t) => a + t.healthScore, 0) / Math.max(1, total - done))
      : 100;

    const byOwner: Record<string, { tasks: number; avgProgress: number }> = {};
    for (const t of all.filter(t => t.owner && t.status !== 'done')) {
      if (!byOwner[t.owner!]) byOwner[t.owner!] = { tasks: 0, avgProgress: 0 };
      byOwner[t.owner!].tasks++;
      byOwner[t.owner!].avgProgress += t.progress;
    }
    for (const k of Object.keys(byOwner)) {
      byOwner[k].avgProgress = Math.round(byOwner[k].avgProgress / byOwner[k].tasks);
    }

    return {
      total, done, active, blocked, planned,
      completionRate: total > 0 ? Math.round((done / total) * 100) : 0,
      avgProgress,
      avgHealth,
      byOwner,
    };
  },
};
