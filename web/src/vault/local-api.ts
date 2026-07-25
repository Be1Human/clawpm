import { getVaultSession } from './session';
import { writeVaultFiles } from './desktop';

type RecordValue = Record<string, any>;

function snapshot(): { files: Record<string, string> } {
  const current = getVaultSession();
  if (current.status !== 'ready') throw new Error('尚未打开 Git 工程。');
  return current.vault;
}

function json<T>(files: Record<string, string>, file: string, fallback: T): T {
  const text = files[file];
  if (!text) return fallback;
  return JSON.parse(text) as T;
}

function vaultData() {
  const { files } = snapshot();
  const config = json<RecordValue>(files, 'clawpm.json', {});
  const domains = json<{ domains?: RecordValue[] }>(files, 'domains.json', {}).domains ?? [];
  const milestones = json<{ milestones?: RecordValue[] }>(files, 'milestones.json', {}).milestones ?? [];
  const fields = json<{ fields?: RecordValue[] }>(files, 'fields.json', {}).fields ?? [];
  const links = json<{ links?: RecordValue[] }>(files, 'links.json', {}).links ?? [];
  const people = json<{ people?: RecordValue[] }>(files, 'people.json', {}).people ?? [];
  const tasks: RecordValue[] = [];
  for (const [file, text] of Object.entries(files)) {
    if (!/^(tasks|archive)\/[^/]+\.json$/.test(file)) continue;
    const shard = JSON.parse(text) as { tasks?: RecordValue[] };
    tasks.push(...(shard.tasks ?? []).map(task => ({ ...task, __file: file })));
  }
  return { config, domains, milestones, fields, links, people, tasks };
}

function domainsForUi(domains: RecordValue[]) {
  return domains.map((domain, index) => ({
    ...domain,
    id: index + 1,
    taskPrefix: domain.code,
    task_prefix: domain.code,
  }));
}

function enrichTask(task: RecordValue, allTasks: RecordValue[], domains: RecordValue[], milestones: RecordValue[]) {
  const domain = domains.find(item => item.code === task.domain || item.name === task.domain);
  const milestone = milestones.find(item => item.name === task.milestone);
  const parentIndex = task.parent ? allTasks.findIndex(item => item.id === task.parent) : -1;
  return {
    ...task,
    id: allTasks.indexOf(task) + 1,
    taskId: task.id,
    parentTaskIdStr: task.parent ?? null,
    parentTaskId: parentIndex >= 0 ? parentIndex + 1 : null,
    description: Array.isArray(task.description) ? task.description.join('\n') : task.description ?? '',
    labels: task.labels ?? [],
    tags: task.tags ?? [],
    domain: domain ? { id: domains.indexOf(domain) + 1, name: domain.name, color: domain.color, taskPrefix: domain.code } : null,
    milestone: milestone ? { id: milestones.indexOf(milestone) + 1, name: milestone.name } : null,
    children: [] as RecordValue[],
  };
}

function taskTree(query: URLSearchParams) {
  const { tasks, domains, milestones } = vaultData();
  const domainFilter = query.get('domain');
  const visible = tasks.filter(task => {
    if (task.archivedAt) return false;
    if (!domainFilter) return true;
    const domain = domains.find(item => item.code === task.domain || item.name === task.domain);
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

/** 将变更写入 vault/people.json */
async function persistPeople(updater: (people: RecordValue[]) => RecordValue[]): Promise<void> {
  const current = getVaultSession();
  if (current.status !== 'ready') throw new Error('尚未打开 Git 工程。');
  const raw = current.vault.files['people.json'];
  let data: { format?: string; people?: RecordValue[] };
  try { data = JSON.parse(raw ?? '{"people":[]}'); } catch { data = { people: [] }; }
  const next = updater(data.people ?? []);
  const content = JSON.stringify({ format: 'clawpm-people@1', people: next }, null, 2) + '\n';
  await writeVaultFiles(current.vault.projectPath, [{ path: 'people.json', content }]);
}

export async function localRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const url = new URL(path, 'http://clawpm.local');
  const method = (options?.method ?? 'GET').toUpperCase();
  const { config, domains, milestones, fields, links, people, tasks } = vaultData();

  // ── 写操作 ──
  if (method === 'POST' && url.pathname === '/members') {
    const body = JSON.parse(options.body as string ?? '{}');
    await persistPeople(ps => {
      if (ps.some((p: any) => p.identifier === body.identifier)) throw new Error(`标识 "${body.identifier}" 已被占用`);
      return [...ps, { identifier: body.identifier, name: body.name, color: body.color || '#64748b', description: body.description || '', type: body.type || 'human', createdAt: new Date().toISOString() }];
    });
    return { identifier: body.identifier, name: body.name, color: body.color, description: body.description, type: body.type } as T;
  }

  if (method === 'PATCH' && url.pathname.startsWith('/members/')) {
    const identifier = decodeURIComponent(url.pathname.slice('/members/'.length));
    const body = JSON.parse(options.body as string ?? '{}');
    await persistPeople(ps => {
      const idx = ps.findIndex((p: any) => p.identifier === identifier);
      if (idx === -1) throw new Error(`成员 "${identifier}" 不存在`);
      ps[idx] = { ...ps[idx], ...body, updatedAt: new Date().toISOString() };
      return [...ps];
    });
    return { identifier, ...body } as T;
  }

  if (method === 'DELETE' && (url.pathname.startsWith('/members/') || url.pathname.includes('/project-members/'))) {
    const identifier = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    await persistPeople(ps => ps.filter((p: any) => p.identifier !== identifier));
    return { success: true } as T;
  }

  // 系统成员（本地模式复用同一份 people.json）
  if (method === 'POST' && url.pathname === '/system-members') {
    const body = JSON.parse(options.body as string ?? '{}');
    await persistPeople(ps => {
      if (ps.some((p: any) => p.identifier === body.identifier)) throw new Error(`标识 "${body.identifier}" 已被占用`);
      return [...ps, { identifier: body.identifier, name: body.name, color: body.color || '#64748b', type: body.type || 'human', createdAt: new Date().toISOString() }];
    });
    return { identifier: body.identifier, name: body.name, color: body.color, type: body.type } as T;
  }
  if ((method === 'PATCH' || method === 'DELETE') && url.pathname.startsWith('/system-members/')) {
    const identifier = decodeURIComponent(url.pathname.slice('/system-members/'.length));
    if (method === 'DELETE') {
      await persistPeople(ps => ps.filter((p: any) => p.identifier !== identifier));
      return { success: true } as T;
    }
    const body = JSON.parse(options.body as string ?? '{}');
    await persistPeople(ps => {
      const idx = ps.findIndex((p: any) => p.identifier === identifier);
      if (idx === -1) throw new Error(`成员 "${identifier}" 不存在`);
      ps[idx] = { ...ps[idx], ...body, updatedAt: new Date().toISOString() };
      return [...ps];
    });
    return { identifier, ...body } as T;
  }

  if (method !== 'GET') throw new Error('该编辑操作尚未迁移到本地 Vault。');

  // ── 读操作 ──
  switch (url.pathname) {
    case '/workflow':
      return (config.workflow ?? { statuses: [] }) as T;
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
    case '/domains':
      return domainsForUi(domains) as T;
    case '/milestones':
      return milestones.map((milestone, index) => ({ ...milestone, id: index + 1, target_date: milestone.targetDate })) as T;
    case '/custom-fields':
      return fields.map((field, index) => ({ ...field, id: index + 1, fieldType: field.type ?? 'text' })) as T;
    case '/req-links':
      return links.map((link, index) => ({
        ...link,
        id: index + 1,
        sourceTaskStrId: link.source,
        targetTaskStrId: link.target,
      })) as T;
    case '/members':
      return people.map((p: any) => ({ ...p, taskCount: 0, role: p.role || 'member' })) as T;
    default:
      throw new Error(`本地 Vault 尚未实现接口：${url.pathname}`);
  }
}
