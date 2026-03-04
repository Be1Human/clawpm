import { getDb } from '../db/connection.js';
import { tasks, backlogItems, domains } from '../db/schema.js';
import { eq, and, like, desc } from 'drizzle-orm';

export async function generateTaskId(domainId?: number, projectId?: number): Promise<string> {
  const db = getDb();
  let prefix = 'T';

  if (domainId) {
    const domain = db.select().from(domains).where(eq(domains.id, domainId)).get();
    if (domain) prefix = domain.taskPrefix;
  }

  // 在项目范围内查找最大编号
  const conditions = [like(tasks.taskId, `${prefix}-%`)];
  if (projectId) conditions.push(eq(tasks.projectId, projectId));

  const last = db
    .select({ taskId: tasks.taskId })
    .from(tasks)
    .where(and(...conditions))
    .orderBy(desc(tasks.id))
    .limit(1)
    .get();

  let next = 1;
  if (last) {
    const dashIdx = last.taskId.lastIndexOf('-');
    const num = dashIdx >= 0 ? parseInt(last.taskId.slice(dashIdx + 1) || '0') : 0;
    next = num + 1;
  }

  return `${prefix}-${String(next).padStart(3, '0')}`;
}

export async function generateBacklogId(projectId?: number): Promise<string> {
  const db = getDb();

  const conditions: any[] = [];
  if (projectId) conditions.push(eq(backlogItems.projectId, projectId));

  const last = conditions.length
    ? db.select({ backlogId: backlogItems.backlogId }).from(backlogItems).where(and(...conditions)).orderBy(desc(backlogItems.id)).limit(1).get()
    : db.select({ backlogId: backlogItems.backlogId }).from(backlogItems).orderBy(desc(backlogItems.id)).limit(1).get();

  let next = 1;
  if (last) {
    const num = parseInt(last.backlogId.split('-')[1] || '0');
    next = num + 1;
  }

  return `BL-${String(next).padStart(3, '0')}`;
}
