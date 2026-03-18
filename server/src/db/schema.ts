import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  archived: integer('archived').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const domains = sqliteTable('domains', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().default(1).references(() => projects.id),
  name: text('name').notNull(),
  taskPrefix: text('task_prefix').notNull(),
  keywords: text('keywords').notNull().default('[]'),
  color: text('color').notNull().default('#6366f1'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const milestones = sqliteTable('milestones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().default(1).references(() => projects.id),
  name: text('name').notNull(),
  targetDate: text('target_date'),
  status: text('status').notNull().default('active'),
  description: text('description'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('task_id').notNull().unique(),
  projectId: integer('project_id').notNull().default(1).references(() => projects.id),
  title: text('title').notNull(),
  description: text('description'),
  domainId: integer('domain_id').references(() => domains.id),
  milestoneId: integer('milestone_id').references(() => milestones.id),
  parentTaskId: integer('parent_task_id'),
  type: text('type').notNull().default('task'),
  status: text('status').notNull().default('backlog'),
  progress: integer('progress').notNull().default(0),
  priority: text('priority').notNull().default('P2'),
  owner: text('owner'),
  assignee: text('assignee'),  // 处理人/执行人
  dueDate: text('due_date'),
  startDate: text('start_date'),
  source: text('source').notNull().default('planned'),
  blocker: text('blocker'),
  healthScore: integer('health_score').notNull().default(100),
  tags: text('tags').notNull().default('[]'),
  labels: text('labels').notNull().default('[]'),
  sortOrder: integer('sort_order').notNull().default(0),
  posX: real('pos_x'),
  posY: real('pos_y'),
  archivedAt: text('archived_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const reqLinks = sqliteTable('req_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceTaskId: integer('source_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  targetTaskId: integer('target_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  linkType: text('link_type').notNull().default('relates'), // 'blocks' | 'precedes' | 'relates'
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
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
  projectId: integer('project_id').notNull().default(1).references(() => projects.id),
  title: text('title').notNull(),
  description: text('description'),
  domainId: integer('domain_id').references(() => domains.id),
  parentBacklogItemId: integer('parent_backlog_item_id'),
  priority: text('priority').notNull().default('P2'),
  source: text('source'),
  sourceContext: text('source_context'),
  estimatedScope: text('estimated_scope'),
  tags: text('tags').notNull().default('[]'),
  status: text('status').notNull().default('pool'),
  sortOrder: integer('sort_order').notNull().default(0),
  scheduledTaskId: integer('scheduled_task_id'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const goals = sqliteTable('goals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().default(1).references(() => projects.id),
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

export const customFields = sqliteTable('custom_fields', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  fieldType: text('field_type').notNull().default('text'),
  options: text('options').notNull().default('[]'),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const taskFieldValues = sqliteTable('task_field_values', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  fieldId: integer('field_id').notNull().references(() => customFields.id, { onDelete: 'cascade' }),
  value: text('value').notNull().default(''),
});

export const taskAttachments = sqliteTable('task_attachments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'doc' | 'link' | 'tapd'
  title: text('title').notNull(),
  content: text('content').notNull(),
  metadata: text('metadata').default('{}'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const taskPermissions = sqliteTable('task_permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  grantee: text('grantee').notNull(),
  level: text('level').notNull().default('view'),   // 'edit' | 'view'
  grantedBy: text('granted_by').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const members = sqliteTable('members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().default(1).references(() => projects.id),
  name: text('name').notNull(),
  identifier: text('identifier').notNull(), // tasks.owner 存的值
  type: text('type').notNull().default('human'),      // 'human' | 'agent'
  color: text('color').notNull().default('#6366f1'),
  description: text('description'),
  role: text('role'),            // 'dev' | 'pm' | 'design' | 'mgr' | 'other'
  onboardedAt: text('onboarded_at'), // ISO 8601 timestamp，完成 onboarding 的时间
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// v3.0: 迭代表
export const iterations = sqliteTable('iterations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  name: text('name').notNull(),
  description: text('description'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  status: text('status').notNull().default('planned'), // 'planned' | 'active' | 'completed'
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// v3.0: 任务-迭代关联表（多对多）
export const taskIterations = sqliteTable('task_iterations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: integer('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  iterationId: integer('iteration_id').notNull().references(() => iterations.id, { onDelete: 'cascade' }),
});

// v3.1: Intake 收件箱
export const intakeItems = sqliteTable('intake_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  intakeId: text('intake_id').notNull().unique(),
  projectId: integer('project_id').notNull().references(() => projects.id),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull().default('feedback'), // 'bug' | 'feature' | 'feedback'
  submitter: text('submitter').notNull(),
  status: text('status').notNull().default('pending'), // 'pending'|'accepted'|'rejected'|'deferred'|'duplicate'
  priority: text('priority').notNull().default('P2'),
  reviewedBy: text('reviewed_by'),
  reviewNote: text('review_note'),
  taskId: text('task_id'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// v3.0: 通知表
export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id),
  recipientId: text('recipient_id').notNull(),
  type: text('type').notNull(), // 'task_assigned' | 'status_changed' | 'note_added'
  title: text('title').notNull(),
  content: text('content'),
  taskId: text('task_id'),
  isRead: integer('is_read').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name').notNull(),
  status: text('status').notNull().default('active'),
  lastLoginAt: text('last_login_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const accountSessions = sqliteTable('account_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  tokenPrefix: text('token_prefix').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  status: text('status').notNull().default('active'),
  expiresAt: text('expires_at'),
  lastUsedAt: text('last_used_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const accountMemberBindings = sqliteTable('account_member_bindings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  memberIdentifier: text('member_identifier').notNull(),
  isDefault: integer('is_default').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const agentTokens = sqliteTable('agent_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  memberIdentifier: text('member_identifier').notNull(),
  clientType: text('client_type').notNull().default('openclaw'),
  name: text('name'),
  tokenPrefix: text('token_prefix').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  status: text('status').notNull().default('active'),
  expiresAt: text('expires_at'),
  lastUsedAt: text('last_used_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const authAuditLogs = sqliteTable('auth_audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  actorType: text('actor_type').notNull(),
  actorId: text('actor_id').notNull(),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  metadata: text('metadata').notNull().default('{}'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
