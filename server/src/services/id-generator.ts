import { getDb } from '../db/connection.js';
import { tasks, backlogItems, domains } from '../db/schema.js';
import { eq, like, desc } from 'drizzle-orm';

export async function generateTaskId(domainId?: number): Promise<string> {
  const db = getDb();
  let prefix = 'T';

  if (domainId) {
    const domain = db.select().from(domains).where(eq(domains.id, domainId)).get();
    if (domain) prefix = domain.taskPrefix;
  }

  const last = db
    .select({ taskId: tasks.taskId })
    .from(tasks)
    .where(like(tasks.taskId, `${prefix}-%`))
    .orderBy(desc(tasks.id))
    .limit(1)
    .get();

  let next = 1;
  if (last) {
    const num = parseInt(last.taskId.split('-')[1] || '0');
    next = num + 1;
  }

  return `${prefix}-${String(next).padStart(3, '0')}`;
}

export async function generateBacklogId(): Promise<string> {
  const db = getDb();
  const last = db
    .select({ backlogId: backlogItems.backlogId })
    .from(backlogItems)
    .orderBy(desc(backlogItems.id))
    .limit(1)
    .get();

  let next = 1;
  if (last) {
    const num = parseInt(last.backlogId.split('-')[1] || '0');
    next = num + 1;
  }

  return `BL-${String(next).padStart(3, '0')}`;
}
