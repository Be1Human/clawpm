import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { notifications } from '../db/schema.js';

export const NotificationService = {
  create(params: {
    projectId: number;
    recipientId: string;
    type: string;       // 'task_assigned' | 'status_changed' | 'note_added'
    title: string;
    content?: string;
    taskId?: string;
  }) {
    const db = getDb();
    db.insert(notifications).values({
      projectId: params.projectId,
      recipientId: params.recipientId,
      type: params.type,
      title: params.title,
      content: params.content || null,
      taskId: params.taskId || null,
    } as any).run();
  },

  listByRecipient(recipientId: string, projectId: number, opts?: { unreadOnly?: boolean }) {
    const db = getDb();
    const conditions: any[] = [
      eq(notifications.recipientId, recipientId),
      eq(notifications.projectId, projectId),
    ];
    if (opts?.unreadOnly) {
      conditions.push(eq(notifications.isRead, 0));
    }
    return db.select().from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(50)
      .all();
  },

  getUnreadCount(recipientId: string, projectId: number): number {
    const db = getDb();
    const rows = db.select().from(notifications)
      .where(and(
        eq(notifications.recipientId, recipientId),
        eq(notifications.projectId, projectId),
        eq(notifications.isRead, 0),
      )).all();
    return rows.length;
  },

  markAsRead(id: number) {
    const db = getDb();
    db.update(notifications).set({ isRead: 1 } as any).where(eq(notifications.id, id)).run();
  },

  markAllAsRead(recipientId: string, projectId: number) {
    const db = getDb();
    db.update(notifications).set({ isRead: 1 } as any)
      .where(and(
        eq(notifications.recipientId, recipientId),
        eq(notifications.projectId, projectId),
        eq(notifications.isRead, 0),
      )).run();
  },
};
