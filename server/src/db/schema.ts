import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const domains = sqliteTable('domains', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  taskPrefix: text('task_prefix').notNull().unique(),
  keywords: text('keywords').notNull().default('[]'),
  color: text('color').notNull().default('#6366f1'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const milestones = sqliteTable('milestones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  targetDate: text('target_date'),
  status: text('status').notNull().default('active'),
  description: text('description'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('task_id').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  domainId: integer('domain_id').references(() => domains.id),
  milestoneId: integer('milestone_id').references(() => milestones.id),
  parentTaskId: integer('parent_task_id'),
  type: text('type').notNull().default('task'),
  status: text('status').notNull().default('planned'),
  progress: integer('progress').notNull().default(0),
  priority: text('priority').notNull().default('P2'),
  owner: text('owner'),
  dueDate: text('due_date'),
  startDate: text('start_date'),
  source: text('source').notNull().default('planned'),
  blocker: text('blocker'),
  healthScore: integer('health_score').notNull().default(100),
  tags: text('tags').notNull().default('[]'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const taskNotes = sqliteTable('task_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id),
  content: text('content').notNull(),
  author: text('author'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const progressHistory = sqliteTable('progress_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id),
  progress: integer('progress').notNull(),
  summary: text('summary'),
  recordedAt: text('recorded_at').notNull().default(sql`(datetime('now'))`),
});

export const backlogItems = sqliteTable('backlog_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  backlogId: text('backlog_id').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  domainId: integer('domain_id').references(() => domains.id),
  priority: text('priority').notNull().default('P2'),
  source: text('source'),
  sourceContext: text('source_context'),
  estimatedScope: text('estimated_scope'),
  tags: text('tags').notNull().default('[]'),
  status: text('status').notNull().default('pool'),
  scheduledTaskId: integer('scheduled_task_id'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const goals = sqliteTable('goals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  targetDate: text('target_date'),
  status: text('status').notNull().default('active'),
  setBy: text('set_by'),
  overallProgress: integer('overall_progress').notNull().default(0),
  health: text('health').notNull().default('green'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const objectives = sqliteTable('objectives', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  goalId: integer('goal_id').notNull().references(() => goals.id),
  title: text('title').notNull(),
  weight: real('weight').notNull().default(1.0),
  progress: integer('progress').notNull().default(0),
  status: text('status').notNull().default('not-started'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const objectiveTaskLinks = sqliteTable('objective_task_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  objectiveId: integer('objective_id').notNull().references(() => objectives.id),
  taskId: integer('task_id').notNull().references(() => tasks.id),
});

export const members = sqliteTable('members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  identifier: text('identifier').notNull().unique(), // tasks.owner 存的值
  type: text('type').notNull().default('human'),      // 'human' | 'agent'
  color: text('color').notNull().default('#6366f1'),
  description: text('description'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
