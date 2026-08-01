import { getVaultSession } from './session';
import { writeVaultFiles } from './desktop';
import { readVaultTasks, serializeTaskFile, type VaultTask } from './task-storage';
import {
  appendHistory,
  completionChecks,
  defaultVerification,
  isClaimActive,
  nextTaskAction,
  openChildren,
  taskActor,
  textLines,
  unresolvedDependencies,
  type VaultRecord,
} from './task-workflow';

type RecordValue = VaultRecord;

type VaultData = {
  config: RecordValue;
  domains: RecordValue[];
  milestones: RecordValue[];
  fields: RecordValue[];
  links: RecordValue[];
  people: RecordValue[];
  tasks: VaultTask[];
};

function readySession() {
  const current = getVaultSession();
  if (current.status !== 'ready') throw new Error('尚未打开 Git 工程。');
  return current;
}

function snapshot(): { files: Record<string, string> } {
  return readySession().vault;
}

function json<T>(files: Record<string, string>, file: string, fallback: T): T {
  const content = files[file];
  if (!content) return fallback;
  return JSON.parse(content) as T;
}

let vaultCache: { ref: Record<string, string>; data: VaultData } | null = null;

function computeVaultData(files: Record<string, string>): VaultData {
  const config = json<RecordValue>(files, 'clawpm.json', {});
  const domains = json<{ domains?: RecordValue[] }>(files, 'domains.json', {}).domains ?? [];
  const milestones = json<{ milestones?: RecordValue[] }>(files, 'milestones.json', {}).milestones ?? [];
  const fields = json<{ fields?: RecordValue[] }>(files, 'fields.json', {}).fields ?? [];
  const links = json<{ links?: RecordValue[] }>(files, 'links.json', {}).links ?? [];
  const people = json<{ people?: RecordValue[] }>(files, 'people.json', {}).people ?? [];
  const tasks = readVaultTasks(files);
  return { config, domains, milestones, fields, links, people, tasks };
}

function vaultData(): VaultData {
  const { files } = snapshot();
  if (vaultCache?.ref === files) return vaultCache.data;
  const data = computeVaultData(files);
  vaultCache = { ref: files, data };
  return data;
}

function requestBody(options?: RequestInit): RecordValue {
  if (!options?.body) return {};
  if (typeof options.body !== 'string') throw new Error('本地 Vault 仅接受 JSON 请求。');
  return JSON.parse(options.body) as RecordValue;
}

function domainsForUi(domains: RecordValue[]) {
  return domains.map((domain, index) => ({
    ...domain,
    id: index + 1,
    taskPrefix: domain.code,
    task_prefix: domain.code,
  }));
}

function milestoneForTask(value: unknown, milestones: RecordValue[]) {
  const name = typeof value === 'object' && value ? (value as RecordValue).name : value;
  return milestones.find(item => item.name === name);
}

function domainForTask(value: unknown, domains: RecordValue[]) {
  const candidate = typeof value === 'object' && value
    ? ((value as RecordValue).code ?? (value as RecordValue).taskPrefix ?? (value as RecordValue).name)
    : value;
  return domains.find(item => item.code === candidate || item.name === candidate);
}

function enrichTask(task: RecordValue, allTasks: RecordValue[], domains: RecordValue[], milestones: RecordValue[]): RecordValue {
  const domain = domainForTask(task.domain, domains);
  const milestone = milestoneForTask(task.milestone, milestones);
  const taskIndex = allTasks.findIndex(item => item.id === task.id);
  const parentIndex = task.parent ? allTasks.findIndex(item => item.id === task.parent) : -1;
  return {
    ...task,
    id: taskIndex >= 0 ? taskIndex + 1 : 0,
    taskId: task.id,
    parentTaskIdStr: task.parent ?? null,
    parentTaskId: parentIndex >= 0 ? parentIndex + 1 : null,
    description: Array.isArray(task.description) ? task.description.join('\n') : task.description ?? '',
    acceptanceCriteria: textLines(task.acceptanceCriteria),
    labels: task.labels ?? [],
    tags: task.tags ?? [],
    progress: Number(task.progress ?? 0),
    domain: domain ? { id: domains.indexOf(domain) + 1, name: domain.name, code: domain.code, color: domain.color, taskPrefix: domain.code } : null,
    milestone: milestone ? { id: milestones.indexOf(milestone) + 1, name: milestone.name } : null,
    children: [] as RecordValue[],
    claimActive: isClaimActive(task),
    nextAction: nextTaskAction(task, allTasks),
    completionChecks: completionChecks(task, allTasks),
  };
}

function taskTree(query: URLSearchParams) {
  const { tasks, domains, milestones } = vaultData();
  const domainFilter = query.get('domain');
  const visible = tasks.filter(task => {
    if (task.archivedAt) return false;
    if (!domainFilter) return true;
    const domain = domainForTask(task.domain, domains);
    return task.domain === domainFilter || domain?.name === domainFilter || domain?.code === domainFilter;
  });
  const enriched = visible.map(task => enrichTask(task, visible, domains, milestones));
  const byTaskId = new Map(enriched.map(task => [task.taskId, task]));
  const roots: RecordValue[] = [];
  for (const task of enriched) {
    const parent = task.parentTaskIdStr ? byTaskId.get(task.parentTaskIdStr) : undefined;
    if (parent) parent.children.push(task);
    else roots.push(task);
  }
  const byRank = (left: RecordValue, right: RecordValue) => String(left.rank ?? left.taskId).localeCompare(String(right.rank ?? right.taskId));
  const sortTree = (items: RecordValue[]) => {
    items.sort(byRank);
    items.forEach(item => sortTree(item.children));
  };
  sortTree(roots);
  return roots;
}

async function persistWrites(writes: Array<{ path: string; content: string }>): Promise<void> {
  const current = readySession();
  await writeVaultFiles(current.vault.projectPath, writes);
  for (const write of writes) current.vault.files[write.path] = write.content;
  vaultCache = null;
}

function taskFile(task: RecordValue): string {
  if (task.__revision > 0 && /^(tasks|archive)\/[^/]+\.json$/.test(task.__file ?? '')) return task.__file;
  return `tasks/${task.id}.json`;
}

async function persistTask(task: RecordValue): Promise<VaultTask> {
  const file = taskFile(task);
  const revision = Math.max(0, Number(task.__revision ?? 0)) + 1;
  const content = serializeTaskFile(task, revision);
  await persistWrites([{ path: file, content }]);
  return { ...task, __file: file, __revision: revision } as VaultTask;
}

async function persistTasks(tasks: RecordValue[]): Promise<VaultTask[]> {
  const unique = [...new Map(tasks.map(task => [task.id, task])).values()];
  const stored = unique.map(task => {
    const file = taskFile(task);
    const revision = Math.max(0, Number(task.__revision ?? 0)) + 1;
    return {
      task: { ...task, __file: file, __revision: revision } as VaultTask,
      write: { path: file, content: serializeTaskFile(task, revision) },
    };
  });
  await persistWrites(stored.map(item => item.write));
  return stored.map(item => item.task);
}

async function persistCollection(file: string, format: string, key: string, values: RecordValue[]): Promise<void> {
  await persistWrites([{ path: file, content: `${JSON.stringify({ format, [key]: values }, null, 2)}\n` }]);
}

async function persistPeople(updater: (people: RecordValue[]) => RecordValue[]): Promise<void> {
  const { people } = vaultData();
  await persistCollection('people.json', 'clawpm-people@1', 'people', updater([...people]));
}

function storedTask(id: string, tasks: RecordValue[]): RecordValue {
  const task = tasks.find(item => item.id === id);
  if (!task) throw new Error(`任务“${id}”不存在。`);
  return task;
}

function safePrefix(value: unknown): string {
  const prefix = String(value ?? 'TASK').trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return prefix || 'TASK';
}

function nextTaskId(prefix: string, tasks: RecordValue[]): string {
  const normalizedPrefix = safePrefix(prefix);
  const knownIds = new Set(tasks.map(task => String(task.id)));
  let sequence = 1;
  let candidate = '';
  do {
    candidate = `${normalizedPrefix}-${String(sequence).padStart(3, '0')}`;
    sequence += 1;
  } while (knownIds.has(candidate));
  return candidate;
}

function taskType(body: RecordValue): string {
  if (typeof body.type === 'string' && body.type.trim()) return body.type.trim();
  const labels = Array.isArray(body.labels) ? body.labels : [];
  return ['epic', 'feature', 'bug', 'spike', 'chore', 'test'].find(label => labels.includes(label)) ?? 'task';
}

function workflowStatuses(config: RecordValue): string[] {
  const values = Array.isArray(config.workflow?.statuses) ? config.workflow.statuses : [];
  const ids = values.map((status: RecordValue) => String(status.id)).filter(Boolean);
  return ids.length > 0 ? ids : ['backlog', 'planned', 'active', 'review', 'done'];
}

function defaultStatus(config: RecordValue): string {
  const statuses = workflowStatuses(config);
  return statuses.includes('planned') ? 'planned' : statuses[0];
}

function assertStatus(status: string, config: RecordValue): void {
  if (!workflowStatuses(config).includes(status)) throw new Error(`状态“${status}”不在 clawpm.json 的工作流中。`);
}

function transitionTargets(config: RecordValue, from: string): string[] {
  const configured = Array.isArray(config.workflow?.transitions) ? config.workflow.transitions : [];
  const matches = configured.filter((transition: RecordValue) => transition.from === from).map((transition: RecordValue) => String(transition.to));
  if (configured.length > 0) return matches;
  const defaults: Record<string, string[]> = {
    backlog: ['planned'],
    planned: ['backlog', 'active'],
    active: ['planned', 'review'],
    review: ['active', 'done'],
    done: ['active'],
  };
  return defaults[from] ?? workflowStatuses(config).filter(status => status !== from);
}

function assertTransition(from: string, to: string, config: RecordValue): void {
  if (from === to) return;
  assertStatus(to, config);
  if (!transitionTargets(config, from).includes(to)) throw new Error(`不允许从“${from}”直接流转到“${to}”。`);
}

function valueName(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined;
  if (!value || typeof value !== 'object') return undefined;
  const record = value as RecordValue;
  return record.code ?? record.taskPrefix ?? record.name;
}

function buildTask(body: RecordValue, data: VaultData, existingTasks: RecordValue[] = data.tasks): VaultTask {
  const parentId = String(body.parent_task_id ?? body.parent ?? '').trim() || undefined;
  const parent = parentId ? storedTask(parentId, existingTasks) : undefined;
  const requestedDomain = valueName(body.domain) ?? parent?.domain;
  const domain = domainForTask(requestedDomain, data.domains);
  const type = taskType(body);
  const id = nextTaskId(parent?.id ?? domain?.code ?? requestedDomain ?? 'TASK', existingTasks);
  const timestamp = new Date().toISOString();
  const requestedStatus = String(body.status ?? defaultStatus(data.config));
  assertStatus(requestedStatus, data.config);
  const actor = taskActor(body.actor ?? body.owner);
  const title = String(body.title ?? '').trim();
  if (!title) throw new Error('任务标题不能为空。');
  const task: RecordValue = {
    id,
    title,
    type,
    status: requestedStatus,
    priority: body.priority || 'P2',
    parent: parent?.id,
    domain: domain?.code ?? requestedDomain,
    milestone: valueName(body.milestone),
    owner: body.owner || undefined,
    assignee: body.assignee || undefined,
    collaborators: Array.isArray(body.collaborators) ? body.collaborators : [],
    labels: Array.isArray(body.labels) ? body.labels : [],
    description: textLines(body.description),
    acceptanceCriteria: textLines(body.acceptanceCriteria ?? body.acceptance_criteria),
    verification: typeof body.requiresTests === 'boolean'
      ? { required: body.requiresTests }
      : (typeof body.requires_tests === 'boolean' ? { required: body.requires_tests } : defaultVerification(type)),
    testResults: [],
    notes: [],
    progress: 0,
    deps: Array.isArray(body.deps) ? body.deps.map(String) : [],
    dueDate: body.due_date ?? body.dueDate ?? undefined,
    scheduleMode: body.schedule_mode ?? body.scheduleMode ?? 'once',
    scheduleCron: body.schedule_cron ?? body.scheduleCron ?? undefined,
    scheduleConfig: body.schedule_config ?? body.scheduleConfig ?? undefined,
    rank: String(Date.now()),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  task.history = appendHistory(task, { type: 'created', actor, summary: '创建任务', progress: 0 }, timestamp);
  return { ...task, __file: `tasks/${id}.json`, __revision: 0 } as VaultTask;
}

async function createLocalTask(body: RecordValue, data: VaultData): Promise<RecordValue> {
  const task = buildTask(body, data);
  const persisted = await persistTask(task);
  return enrichTask(persisted, [...data.tasks, persisted], data.domains, data.milestones);
}

function buildTaskContext(id: string, tasks: RecordValue[], domains: RecordValue[], milestones: RecordValue[]) {
  const current = tasks.find(task => task.id === id);
  if (!current) return { current: undefined, ancestors: [], siblings: [], children: [] };
  const enrich = (task: RecordValue) => enrichTask(task, tasks, domains, milestones);
  const ancestors: RecordValue[] = [];
  let parentId = current.parent;
  const visited = new Set<string>();
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = tasks.find(task => task.id === parentId);
    if (!parent) break;
    ancestors.unshift(enrich(parent));
    parentId = parent.parent;
  }
  return {
    current: enrich(current),
    ancestors,
    siblings: tasks.filter(task => task.parent === current.parent && task.id !== id).map(enrich),
    children: tasks.filter(task => task.parent === id).map(enrich),
  };
}

function mappedTaskUpdates(body: RecordValue, data: VaultData): RecordValue {
  const updates: RecordValue = {};
  const direct = ['title', 'type', 'priority', 'owner', 'assignee', 'blocker', 'labels', 'tags', 'collaborators', 'deps', 'verification', 'archivedAt'];
  for (const key of direct) if (key in body) updates[key] = body[key] || (Array.isArray(body[key]) ? [] : undefined);
  if ('description' in body) updates.description = textLines(body.description);
  if ('acceptanceCriteria' in body || 'acceptance_criteria' in body) updates.acceptanceCriteria = textLines(body.acceptanceCriteria ?? body.acceptance_criteria);
  if ('domain' in body) updates.domain = domainForTask(body.domain, data.domains)?.code ?? valueName(body.domain);
  if ('milestone' in body) updates.milestone = valueName(body.milestone);
  if ('parent_task_id' in body || 'parent' in body) updates.parent = body.parent_task_id ?? body.parent ?? undefined;
  if ('due_date' in body || 'dueDate' in body) updates.dueDate = body.due_date ?? body.dueDate;
  if ('status' in body) updates.status = String(body.status);
  return updates;
}

async function updateLocalTask(id: string, body: RecordValue, data: VaultData): Promise<RecordValue> {
  const task = storedTask(id, data.tasks);
  const actor = taskActor(body.actor);
  const updates = mappedTaskUpdates(body, data);
  if (updates.parent) {
    if (updates.parent === id) throw new Error('任务不能成为自己的父任务。');
    storedTask(updates.parent, data.tasks);
  }
  if (updates.status) {
    assertTransition(task.status, updates.status, data.config);
    if (updates.status === 'done') {
      throw new Error('完成状态必须通过 Agent 工作流的“提交验收”进入，不能直接修改。');
    }
  }
  const timestamp = new Date().toISOString();
  const next: RecordValue = { ...task, ...updates, updatedAt: timestamp };
  const summaries: string[] = [];
  if (updates.status && updates.status !== task.status) summaries.push(`状态 ${task.status} → ${updates.status}`);
  if ('acceptanceCriteria' in updates) summaries.push(`更新验收标准（${updates.acceptanceCriteria.length} 条）`);
  if (summaries.length === 0) summaries.push('更新任务信息');
  next.history = appendHistory(task, {
    type: updates.status && updates.status !== task.status ? 'transition' : 'updated',
    actor,
    summary: summaries.join('；'),
    progress: Number(next.progress ?? 0),
    fromStatus: task.status,
    toStatus: next.status,
  }, timestamp);
  if (next.status === 'done') {
    next.progress = 100;
    next.completedAt = timestamp;
    next.completion = next.completion ?? { at: timestamp, actor, summary: '状态流转完成', evidence: [] };
  }
  const persisted = await persistTask(next);
  const allTasks = data.tasks.map(item => item.id === id ? persisted : item);
  return enrichTask(persisted, allTasks, data.domains, data.milestones);
}

async function splitTask(id: string, body: RecordValue, data: VaultData): Promise<RecordValue> {
  const parent = storedTask(id, data.tasks);
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) throw new Error('至少提供 1 个拆分任务。');
  if (items.length > 50) throw new Error('单次最多拆分 50 个任务。');
  const actor = taskActor(body.actor ?? parent.claim?.agent ?? parent.owner);
  const workingTasks: RecordValue[] = [...data.tasks];
  const children: VaultTask[] = [];
  for (const item of items) {
    const childBody = {
      ...item,
      parent_task_id: id,
      domain: item.domain ?? parent.domain,
      milestone: item.milestone ?? parent.milestone,
      actor,
      acceptanceCriteria: item.acceptanceCriteria ?? item.acceptance_criteria
        ?? (item.type === 'test' ? ['执行测试并记录可复现的结果与证据'] : []),
      requiresTests: typeof item.requiresTests === 'boolean' ? item.requiresTests : item.type !== 'test',
    };
    const child = buildTask(childBody, data, workingTasks);
    workingTasks.push(child);
    children.push(child);
  }
  const timestamp = new Date().toISOString();
  const updatedParent = {
    ...parent,
    updatedAt: timestamp,
    history: appendHistory(parent, {
      type: 'split',
      actor,
      summary: `拆分出 ${children.length} 个子任务：${children.map(child => child.id).join('、')}`,
      progress: Number(parent.progress ?? 0),
    }, timestamp),
  };
  const persisted = await persistTasks([updatedParent, ...children]);
  const persistedParent = persisted.find(task => task.id === id)!;
  const persistedChildren = persisted.filter(task => task.id !== id);
  const allTasks = data.tasks.map(task => task.id === id ? persistedParent : task).concat(persistedChildren);
  return {
    parent: enrichTask(persistedParent, allTasks, data.domains, data.milestones),
    tasks: persistedChildren.map(task => enrichTask(task, allTasks, data.domains, data.milestones)),
  };
}

function workflowOverview(data: VaultData) {
  const tasks = data.tasks.filter(task => !task.archivedAt && task.status !== 'done');
  const items = tasks.map(task => enrichTask(task, tasks, data.domains, data.milestones));
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.nextAction.action] = (counts[item.nextAction.action] ?? 0) + 1;
  return {
    workflow: data.config.workflow ?? { statuses: [] },
    counts,
    tasks: items.sort((left, right) => {
      const blocked = Number(Boolean(right.blocker)) - Number(Boolean(left.blocker));
      if (blocked !== 0) return blocked;
      return String(left.priority ?? 'P2').localeCompare(String(right.priority ?? 'P2')) || String(left.taskId).localeCompare(String(right.taskId));
    }),
  };
}

async function claimTask(id: string, body: RecordValue, data: VaultData): Promise<RecordValue> {
  const task = storedTask(id, data.tasks);
  const actor = taskActor(body.agent ?? body.actor, '');
  if (!actor) throw new Error('领取任务必须提供 Agent identifier。');
  if (isClaimActive(task) && task.claim.agent !== actor && !body.force) {
    throw new Error(`任务已由 ${task.claim.agent} 领取，有效期至 ${task.claim.leaseUntil ?? '手动释放'}。`);
  }
  const defaultMinutes = Number(data.config.workflow?.agents?.claimLeaseMinutes ?? 120);
  const leaseMinutes = Math.min(10080, Math.max(5, Number(body.leaseMinutes ?? body.lease_minutes ?? defaultMinutes)));
  const timestamp = new Date().toISOString();
  const leaseUntil = new Date(Date.now() + leaseMinutes * 60_000).toISOString();
  const nextStatus = ['backlog', 'planned'].includes(task.status) && workflowStatuses(data.config).includes('active') ? 'active' : task.status;
  const next = {
    ...task,
    status: nextStatus,
    assignee: actor,
    claim: { agent: actor, claimedAt: timestamp, leaseUntil, active: true },
    updatedAt: timestamp,
    history: appendHistory(task, {
      type: 'claimed', actor, summary: `领取任务，租约 ${leaseMinutes} 分钟`, progress: Number(task.progress ?? 0),
      fromStatus: task.status, toStatus: nextStatus,
    }, timestamp),
  };
  const persisted = await persistTask(next);
  const allTasks = data.tasks.map(item => item.id === id ? persisted : item);
  return enrichTask(persisted, allTasks, data.domains, data.milestones);
}

async function releaseTask(id: string, body: RecordValue, data: VaultData): Promise<RecordValue> {
  const task = storedTask(id, data.tasks);
  const actor = taskActor(body.agent ?? body.actor ?? task.claim?.agent, '');
  if (isClaimActive(task) && actor !== task.claim.agent && !body.force) throw new Error(`只有 ${task.claim.agent} 可以释放该任务。`);
  const timestamp = new Date().toISOString();
  const next = {
    ...task,
    assignee: task.assignee === task.claim?.agent ? undefined : task.assignee,
    claim: task.claim ? { ...task.claim, active: false, releasedAt: timestamp, releasedBy: actor || 'local' } : undefined,
    updatedAt: timestamp,
    history: appendHistory(task, { type: 'released', actor: actor || 'local', summary: '释放任务', progress: Number(task.progress ?? 0) }, timestamp),
  };
  const persisted = await persistTask(next);
  const allTasks = data.tasks.map(item => item.id === id ? persisted : item);
  return enrichTask(persisted, allTasks, data.domains, data.milestones);
}

async function updateProgress(id: string, body: RecordValue, data: VaultData): Promise<RecordValue> {
  const task = storedTask(id, data.tasks);
  const progress = Number(body.progress);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) throw new Error('进度必须是 0 到 100 之间的数字。');
  if (progress === 100 && task.status !== 'done') throw new Error('100% 进度必须通过“提交验收”完成，不能绕过测试与证据 Gate。');
  const actor = taskActor(body.actor ?? task.claim?.agent ?? task.owner);
  const timestamp = new Date().toISOString();
  const nextStatus = ['backlog', 'planned'].includes(task.status) && workflowStatuses(data.config).includes('active') ? 'active' : task.status;
  const next = {
    ...task,
    progress,
    status: nextStatus,
    updatedAt: timestamp,
    history: appendHistory(task, {
      type: 'progress', actor, summary: String(body.summary ?? '').trim() || `进度更新至 ${progress}%`, progress,
      fromStatus: task.status, toStatus: nextStatus,
    }, timestamp),
  };
  const persisted = await persistTask(next);
  const allTasks = data.tasks.map(item => item.id === id ? persisted : item);
  return enrichTask(persisted, allTasks, data.domains, data.milestones);
}

async function reportBlocker(id: string, body: RecordValue, data: VaultData): Promise<RecordValue> {
  const task = storedTask(id, data.tasks);
  const blocker = String(body.blocker ?? '').trim();
  if (!blocker) throw new Error('阻塞原因不能为空。');
  const actor = taskActor(body.actor ?? task.claim?.agent ?? task.owner);
  const timestamp = new Date().toISOString();
  const next = {
    ...task,
    blocker,
    blockedAt: timestamp,
    blockedBy: actor,
    updatedAt: timestamp,
    history: appendHistory(task, { type: 'blocked', actor, summary: blocker, progress: Number(task.progress ?? 0) }, timestamp),
  };
  const persisted = await persistTask(next);
  const allTasks = data.tasks.map(item => item.id === id ? persisted : item);
  return enrichTask(persisted, allTasks, data.domains, data.milestones);
}

async function resolveBlocker(id: string, body: RecordValue, data: VaultData): Promise<RecordValue> {
  const task = storedTask(id, data.tasks);
  const actor = taskActor(body.actor ?? task.claim?.agent ?? task.owner);
  const timestamp = new Date().toISOString();
  const next = {
    ...task,
    blocker: undefined,
    blockedAt: undefined,
    blockedBy: undefined,
    updatedAt: timestamp,
    history: appendHistory(task, { type: 'unblocked', actor, summary: String(body.summary ?? '').trim() || '阻塞已解除', progress: Number(task.progress ?? 0) }, timestamp),
  };
  const persisted = await persistTask(next);
  const allTasks = data.tasks.map(item => item.id === id ? persisted : item);
  return enrichTask(persisted, allTasks, data.domains, data.milestones);
}

async function recordTest(id: string, body: RecordValue, data: VaultData): Promise<RecordValue> {
  const task = storedTask(id, data.tasks);
  const status = String(body.status ?? 'passed');
  if (!['passed', 'failed'].includes(status)) throw new Error('测试结果只能是 passed 或 failed。');
  const command = String(body.command ?? '').trim();
  const evidence = textLines(body.evidence);
  if (!command && evidence.length === 0) throw new Error('测试记录必须包含命令或证据。');
  const actor = taskActor(body.actor ?? task.claim?.agent ?? task.owner);
  const timestamp = new Date().toISOString();
  const result = {
    id: `test-${Date.now()}-${(task.testResults ?? []).length + 1}`,
    status,
    command,
    summary: String(body.summary ?? '').trim() || (status === 'passed' ? '测试通过' : '测试失败'),
    evidence,
    actor,
    at: timestamp,
  };
  const nextStatus = status === 'passed' && workflowStatuses(data.config).includes('review') ? 'review'
    : (status === 'failed' && workflowStatuses(data.config).includes('active') ? 'active' : task.status);
  const next = {
    ...task,
    status: nextStatus,
    blocker: status === 'failed' ? `测试失败：${result.summary}` : (String(task.blocker ?? '').startsWith('测试失败：') ? undefined : task.blocker),
    testResults: [...(task.testResults ?? []), result],
    verification: { ...(task.verification ?? {}), required: true, lastResult: status, lastTestedAt: timestamp },
    updatedAt: timestamp,
    history: appendHistory(task, {
      type: status === 'passed' ? 'test_passed' : 'test_failed', actor, summary: result.summary,
      progress: Number(task.progress ?? 0), fromStatus: task.status, toStatus: nextStatus, evidence: [command, ...evidence].filter(Boolean),
    }, timestamp),
  };
  const persisted = await persistTask(next);
  const allTasks = data.tasks.map(item => item.id === id ? persisted : item);
  return enrichTask(persisted, allTasks, data.domains, data.milestones);
}

async function completeTask(id: string, body: RecordValue, data: VaultData): Promise<RecordValue> {
  const task = storedTask(id, data.tasks);
  const actor = taskActor(body.actor ?? task.claim?.agent ?? task.owner);
  if (!isClaimActive(task)) throw new Error('完成任务前必须先领取任务。');
  if (task.claim.agent !== actor && !body.force) throw new Error(`任务由 ${task.claim.agent} 领取，当前 Agent 不能完成。`);
  const evidence = textLines(body.evidence);
  const checks = completionChecks(task, data.tasks, evidence);
  const failed = checks.filter(check => !check.passed);
  if (failed.length > 0) throw new Error(`完成 Gate 未通过：${failed.map(check => `${check.label}（${check.detail}）`).join('；')}`);
  const timestamp = new Date().toISOString();
  const summary = String(body.summary ?? '').trim() || '任务通过验收';
  const next = {
    ...task,
    status: 'done',
    progress: 100,
    blocker: undefined,
    completedAt: timestamp,
    completedBy: actor,
    completion: { at: timestamp, actor, summary, evidence },
    claim: { ...task.claim, active: false, releasedAt: timestamp, releasedBy: actor },
    updatedAt: timestamp,
    history: appendHistory(task, {
      type: 'completed', actor, summary, progress: 100, fromStatus: task.status, toStatus: 'done', evidence,
    }, timestamp),
  };
  const persisted = await persistTask(next);
  const allTasks = data.tasks.map(item => item.id === id ? persisted : item);
  return enrichTask(persisted, allTasks, data.domains, data.milestones);
}

async function reopenTask(id: string, body: RecordValue, data: VaultData): Promise<RecordValue> {
  const task = storedTask(id, data.tasks);
  if (task.status !== 'done') throw new Error('只有已完成任务可以重新打开。');
  const actor = taskActor(body.actor ?? task.completedBy ?? task.owner);
  const timestamp = new Date().toISOString();
  const nextStatus = workflowStatuses(data.config).includes('active') ? 'active' : defaultStatus(data.config);
  const next = {
    ...task,
    status: nextStatus,
    progress: Math.min(95, Number(task.progress ?? 0)),
    completedAt: undefined,
    completedBy: undefined,
    completion: undefined,
    updatedAt: timestamp,
    history: appendHistory(task, {
      type: 'reopened', actor, summary: String(body.summary ?? '').trim() || '任务重新打开', progress: Math.min(95, Number(task.progress ?? 0)),
      fromStatus: 'done', toStatus: nextStatus,
    }, timestamp),
  };
  const persisted = await persistTask(next);
  const allTasks = data.tasks.map(item => item.id === id ? persisted : item);
  return enrichTask(persisted, allTasks, data.domains, data.milestones);
}

async function addNote(id: string, body: RecordValue, data: VaultData): Promise<RecordValue> {
  const task = storedTask(id, data.tasks);
  const content = String(body.content ?? '').trim();
  if (!content) throw new Error('备注不能为空。');
  const timestamp = new Date().toISOString();
  const note = { id: `note-${Date.now()}`, content, author: taskActor(body.author ?? body.actor ?? task.claim?.agent), createdAt: timestamp };
  const next = { ...task, notes: [...(task.notes ?? []), note], updatedAt: timestamp };
  await persistTask(next);
  return note;
}

function pathTaskId(pathname: string, suffix: string): string | null {
  const match = pathname.match(new RegExp(`^/tasks/([^/]+)/${suffix}$`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function localRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const url = new URL(path, 'http://clawpm.local');
  const method = (options?.method ?? 'GET').toUpperCase();
  const data = vaultData();
  const { config, domains, milestones, fields, links, people, tasks } = data;

  if (method === 'POST' && url.pathname === '/members') {
    const body = requestBody(options);
    if (!String(body.identifier ?? '').trim()) throw new Error('成员 identifier 不能为空。');
    await persistPeople(current => {
      if (current.some(person => person.identifier === body.identifier)) throw new Error(`标识“${body.identifier}”已被占用。`);
      return [...current, { identifier: body.identifier, name: body.name, color: body.color || '#64748b', description: body.description || '', type: body.type || 'human', createdAt: new Date().toISOString() }];
    });
    return body as T;
  }
  if (method === 'PATCH' && url.pathname.startsWith('/members/')) {
    const identifier = decodeURIComponent(url.pathname.slice('/members/'.length));
    const body = requestBody(options);
    await persistPeople(current => current.map(person => person.identifier === identifier ? { ...person, ...body, updatedAt: new Date().toISOString() } : person));
    return { identifier, ...body } as T;
  }
  if (method === 'DELETE' && (url.pathname.startsWith('/members/') || url.pathname.includes('/project-members/'))) {
    const identifier = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    await persistPeople(current => current.filter(person => person.identifier !== identifier));
    return { success: true } as T;
  }

  if (method === 'POST' && url.pathname === '/tasks') return await createLocalTask(requestBody(options), data) as T;

  const taskDetailMatch = url.pathname.match(/^\/tasks\/(?!tree$|archived$)([^/]+)$/);
  if (taskDetailMatch && method === 'PATCH') return await updateLocalTask(decodeURIComponent(taskDetailMatch[1]), requestBody(options), data) as T;

  const splitId = pathTaskId(url.pathname, 'split');
  if (splitId && method === 'POST') return await splitTask(splitId, requestBody(options), data) as T;
  const claimId = pathTaskId(url.pathname, 'claim');
  if (claimId && method === 'POST') return await claimTask(claimId, requestBody(options), data) as T;
  const releaseId = pathTaskId(url.pathname, 'release');
  if (releaseId && method === 'POST') return await releaseTask(releaseId, requestBody(options), data) as T;
  const progressId = pathTaskId(url.pathname, 'progress');
  if (progressId && method === 'POST') return await updateProgress(progressId, requestBody(options), data) as T;
  const blockerId = pathTaskId(url.pathname, 'blocker');
  if (blockerId && method === 'POST') return await reportBlocker(blockerId, requestBody(options), data) as T;
  const unblockId = pathTaskId(url.pathname, 'unblock');
  if (unblockId && method === 'POST') return await resolveBlocker(unblockId, requestBody(options), data) as T;
  const testId = pathTaskId(url.pathname, 'tests');
  if (testId && method === 'POST') return await recordTest(testId, requestBody(options), data) as T;
  const completeId = pathTaskId(url.pathname, 'complete');
  if (completeId && method === 'POST') return await completeTask(completeId, requestBody(options), data) as T;
  const reopenId = pathTaskId(url.pathname, 'reopen');
  if (reopenId && method === 'POST') return await reopenTask(reopenId, requestBody(options), data) as T;
  const noteId = pathTaskId(url.pathname, 'notes');
  if (noteId && method === 'POST') return await addNote(noteId, requestBody(options), data) as T;
  const archiveId = pathTaskId(url.pathname, 'archive');
  if (archiveId && method === 'POST') return await updateLocalTask(archiveId, { archivedAt: new Date().toISOString() }, data) as T;
  const unarchiveId = pathTaskId(url.pathname, 'unarchive');
  if (unarchiveId && method === 'POST') return await updateLocalTask(unarchiveId, { archivedAt: undefined }, data) as T;

  if (method !== 'GET') throw new Error(`该编辑操作尚未迁移到本地 Vault：${method} ${url.pathname}`);

  const childrenId = pathTaskId(url.pathname, 'children');
  if (childrenId) return tasks.filter(task => task.parent === childrenId).map(task => enrichTask(task, tasks, domains, milestones)) as T;
  const contextId = pathTaskId(url.pathname, 'context');
  if (contextId) return buildTaskContext(contextId, tasks, domains, milestones) as T;
  const historyId = pathTaskId(url.pathname, 'history');
  if (historyId) return (storedTask(historyId, tasks).history ?? []) as T;
  const notesId = pathTaskId(url.pathname, 'notes');
  if (notesId) return (storedTask(notesId, tasks).notes ?? []) as T;
  const testsId = pathTaskId(url.pathname, 'tests');
  if (testsId) return (storedTask(testsId, tasks).testResults ?? []) as T;
  const attachmentsId = pathTaskId(url.pathname, 'attachments');
  if (attachmentsId) return (storedTask(attachmentsId, tasks).attachments ?? []) as T;
  const fieldsId = pathTaskId(url.pathname, 'fields');
  if (fieldsId) return (storedTask(fieldsId, tasks).fieldValues ?? []) as T;
  const permissionsId = pathTaskId(url.pathname, 'permissions');
  if (permissionsId) return { permissions: [], myPermission: 'owner' } as T;

  if (taskDetailMatch) {
    const id = decodeURIComponent(taskDetailMatch[1]);
    const task = tasks.find(item => item.id === id);
    return (task ? enrichTask(task, tasks, domains, milestones) : undefined) as T;
  }

  switch (url.pathname) {
    case '/workflow':
      return (config.workflow ?? { statuses: [] }) as T;
    case '/workflow/overview':
      return workflowOverview(data) as T;
    case '/vaults': {
      const current = getVaultSession();
      return {
        current: current.status === 'ready' ? current.vault.path : null,
        currentName: current.status === 'ready' ? current.vault.name : null,
        recent: current.recent ?? [],
      } as T;
    }
    case '/tasks/tree':
      return taskTree(url.searchParams) as T;
    case '/tasks':
      return tasks.filter(task => !task.archivedAt).map(task => enrichTask(task, tasks, domains, milestones)) as T;
    case '/tasks/archived':
      return tasks.filter(task => task.archivedAt).map(task => enrichTask(task, tasks, domains, milestones)) as T;
    case '/backlog':
      return tasks.filter(task => !task.archivedAt && task.status === 'backlog').map(task => enrichTask(task, tasks, domains, milestones)) as T;
    case '/backlog/tree':
      return taskTree(new URLSearchParams()) as T;
    case '/domains':
      return domainsForUi(domains) as T;
    case '/milestones':
      return milestones.map((milestone, index) => ({ ...milestone, id: index + 1, target_date: milestone.targetDate })) as T;
    case '/custom-fields':
      return fields.map((field, index) => ({ ...field, id: index + 1, fieldType: field.type ?? 'text' })) as T;
    case '/req-links':
      return links.map((link, index) => ({ ...link, id: index + 1, sourceTaskStrId: link.source, targetTaskStrId: link.target })) as T;
    case '/members':
    case '/system-members':
      return people.map(person => ({ ...person, taskCount: tasks.filter(task => task.owner === person.identifier || task.assignee === person.identifier).length, role: person.role || 'member' })) as T;
    default:
      throw new Error(`本地 Vault 尚未实现接口：${url.pathname}`);
  }
}
