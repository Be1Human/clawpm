import { getCurrentMember } from '../lib/useCurrentMember';
import { getAuthToken } from '../lib/useAuthSession';

declare global {
  interface Window {
    __CLAWPM_RUNTIME_CONFIG__?: {
      apiBase?: string;
      apiToken?: string;
      basePath?: string;
      publicUrl?: string;
    };
  }
}

function normalizeBasePath(input?: string) {
  if (!input || input === '/') return '';
  let value = input.trim();
  if (!value.startsWith('/')) value = `/${value}`;
  if (value.endsWith('/')) value = value.slice(0, -1);
  return value;
}

const runtimeConfig = typeof window !== 'undefined' ? window.__CLAWPM_RUNTIME_CONFIG__ : undefined;
export const BASE_PATH = normalizeBasePath(runtimeConfig?.basePath || import.meta.env.BASE_URL);
const BASE = runtimeConfig?.apiBase || `${BASE_PATH}/api/v1`;
const LEGACY_TOKEN = runtimeConfig?.apiToken || import.meta.env.VITE_API_TOKEN || 'dev-token';

/** 获取服务器的外部可访问地址（优先用 CLAWPM_PUBLIC_URL 配置，回退到浏览器当前地址） */
export function getServerOrigin(): string {
  const publicUrl = runtimeConfig?.publicUrl;
  if (publicUrl) {
    // 去掉末尾的斜杠
    return publicUrl.replace(/\/+$/, '');
  }
  return window.location.origin;
}

export function withBasePath(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${normalized}` || normalized;
}

/** 当前活跃项目 slug，全局状态（带订阅通知） */
let _activeProjectSlug = localStorage.getItem('clawpm-activeProject') || 'default';
const _listeners = new Set<() => void>();

export function getActiveProject(): string { return _activeProjectSlug; }
export function setActiveProject(slug: string) {
  if (slug === _activeProjectSlug) return;
  _activeProjectSlug = slug;
  localStorage.setItem('clawpm-activeProject', slug);
  _listeners.forEach(fn => fn());
}
export function subscribeActiveProject(listener: () => void): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

/** 给 URL 附加 ?project=slug 参数 */
function withProject(path: string): string {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}project=${_activeProjectSlug}`;
}

function buildAuthHeaders(options?: RequestInit, includeAuth = true): Record<string, string> {
  const headers: Record<string, string> = {
    ...options?.headers as Record<string, string>,
  };
  if (includeAuth) {
    const token = getAuthToken() || LEGACY_TOKEN;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  if (options?.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const currentMember = getCurrentMember();
  if (currentMember) {
    headers['X-ClawPM-Member'] = currentMember;
    headers['X-ClawPM-User'] = currentMember;
  }
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = buildAuthHeaders(options, true);
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

async function requestPublic<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = buildAuthHeaders(options, false);
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Auth
  register: (data: { username: string; password: string; display_name: string; project?: string; auto_create_member?: boolean }) =>
    requestPublic<any>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { username: string; password: string }) =>
    requestPublic<any>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request<any>('/auth/logout', { method: 'POST' }),
  getAuthMe: () => request<any>('/auth/me'),
  selectMember: (data: { member_identifier?: string; project?: string; create_member?: any }) =>
    request<any>(withProject('/auth/select-member'), { method: 'POST', body: JSON.stringify(data) }),

  // Projects
  getProjects: () => request<any[]>('/projects'),
  createProject: (data: { name: string; slug?: string; description?: string }) =>
    request<any>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  getProject: (slug: string) => request<any>(`/projects/${slug}`),
  updateProject: (slug: string, data: any) =>
    request<any>(`/projects/${slug}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProject: (slug: string) => request<any>(`/projects/${slug}`, { method: 'DELETE' }),

  // Tasks
  getTasks: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params) : '';
    return request<any[]>(withProject(`/tasks${qs}`));
  },
  getTaskTree: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params) : '';
    return request<any[]>(withProject(`/tasks/tree${qs}`));
  },
  getTaskChildren: (taskId: string) =>
    request<any[]>(`/tasks/${taskId}/children`),
  getTaskContext: (taskId: string) =>
    request<any>(`/tasks/${taskId}/context`),
  getTask: (id: string) => request<any>(`/tasks/${id}`),
  createTask: (data: any) => request<any>(withProject('/tasks'), { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: string, data: any) => request<any>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (id: string) => request<any>(`/tasks/${id}`, { method: 'DELETE' }),
  updateProgress: (id: string, progress: number, summary?: string) =>
    request<any>(`/tasks/${id}/progress`, { method: 'POST', body: JSON.stringify({ progress, summary }) }),
  completeTask: (id: string, summary?: string) =>
    request<any>(`/tasks/${id}/complete`, { method: 'POST', body: JSON.stringify({ summary }) }),
  reportBlocker: (id: string, blocker: string) =>
    request<any>(`/tasks/${id}/blocker`, { method: 'POST', body: JSON.stringify({ blocker }) }),
  addNote: (id: string, content: string, author?: string) =>
    request<any>(`/tasks/${id}/notes`, { method: 'POST', body: JSON.stringify({ content, author }) }),
  getTaskHistory: (id: string) => request<any[]>(`/tasks/${id}/history`),
  getTaskNotes: (id: string) => request<any[]>(`/tasks/${id}/notes`),

  // Backlog
  getBacklog: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params) : '';
    return request<any[]>(withProject(`/backlog${qs}`));
  },
  getBacklogTree: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params) : '';
    return request<any[]>(withProject(`/backlog/tree${qs}`));
  },
  createBacklogItem: (data: any) => request<any>(withProject('/backlog'), { method: 'POST', body: JSON.stringify(data) }),
  updateBacklogItem: (id: string, data: any) => request<any>(`/backlog/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  scheduleBacklogItem: (id: string, data: any) =>
    request<any>(`/backlog/${id}/schedule`, { method: 'POST', body: JSON.stringify(data) }),

  // Config
  getDomains: () => request<any[]>(withProject('/domains')),
  createDomain: (data: any) => request<any>(withProject('/domains'), { method: 'POST', body: JSON.stringify(data) }),
  updateDomain: (id: number, data: any) => request<any>(`/domains/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDomain: (id: number) => request<any>(`/domains/${id}`, { method: 'DELETE' }),
  getMilestones: () => request<any[]>(withProject('/milestones')),
  createMilestone: (data: any) => request<any>(withProject('/milestones'), { method: 'POST', body: JSON.stringify(data) }),
  updateMilestone: (id: number, data: any) => request<any>(`/milestones/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteMilestone: (id: number) => request<any>(`/milestones/${id}`, { method: 'DELETE' }),

  // Goals
  getGoals: () => request<any[]>(withProject('/goals')),
  createGoal: (data: any) => request<any>(withProject('/goals'), { method: 'POST', body: JSON.stringify(data) }),

  // Dashboard
  getOverview: () => request<any>(withProject('/dashboard/overview')),
  getRisks: () => request<any>(withProject('/dashboard/risks')),
  getResources: () => request<any>(withProject('/dashboard/resources')),

  // Members (项目成员 - 兼容旧接口)
  getMembers: (type?: string) => {
    const base = withProject('/members');
    return request<any[]>(type ? `${base}&type=${type}` : base);
  },
  getMember: (identifier: string) => request<any>(`/members/${encodeURIComponent(identifier)}`),
  createMember: (data: any) => request<any>(withProject('/members'), { method: 'POST', body: JSON.stringify(data) }),
  updateMember: (identifier: string, data: any) => request<any>(`/members/${encodeURIComponent(identifier)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteMember: (identifier: string) => request<any>(`/members/${encodeURIComponent(identifier)}`, { method: 'DELETE' }),
  checkIdentifierAvailable: (identifier: string) =>
    request<{ available: boolean; reason?: string }>(`/members/check-identifier?identifier=${encodeURIComponent(identifier)}`),

  // System Members (系统成员 - 全局，与项目无关) v6.0
  getSystemMembers: (type?: string) => {
    const base = '/system-members';
    return request<any[]>(type ? `${base}?type=${type}` : base);
  },
  searchSystemMembers: (query: string, type?: string) => {
    const params = new URLSearchParams({ search: query });
    if (type) params.set('type', type);
    return request<any[]>(`/system-members?${params}`);
  },
  getSystemMember: (identifier: string) => request<any>(`/system-members/${encodeURIComponent(identifier)}`),
  createSystemMember: (data: any) => request<any>('/system-members', { method: 'POST', body: JSON.stringify(data) }),
  updateSystemMember: (identifier: string, data: any) => request<any>(`/system-members/${encodeURIComponent(identifier)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSystemMember: (identifier: string) => request<any>(`/system-members/${encodeURIComponent(identifier)}`, { method: 'DELETE' }),

  // Project Members (项目成员关联) v6.0
  addProjectMember: (memberIdentifier: string, role?: string) =>
    request<any>(withProject('/project-members'), { method: 'POST', body: JSON.stringify({ member_identifier: memberIdentifier, role }) }),
  removeProjectMember: (identifier: string) =>
    request<any>(withProject(`/project-members/${encodeURIComponent(identifier)}`), { method: 'DELETE' }),
  updateProjectMemberRole: (identifier: string, role: string) =>
    request<any>(withProject(`/project-members/${encodeURIComponent(identifier)}/role`), { method: 'PATCH', body: JSON.stringify({ role }) }),

  // Agents
  createAgent: (data: any) => request<any>(withProject('/agents'), { method: 'POST', body: JSON.stringify(data) }),
  getAgentTokens: (identifier: string) => request<any[]>(withProject(`/agents/${encodeURIComponent(identifier)}/tokens`)),
  createAgentToken: (identifier: string, data?: { name?: string; client_type?: string; expires_at?: string }) =>
    request<any>(withProject(`/agents/${encodeURIComponent(identifier)}/tokens`), { method: 'POST', body: JSON.stringify(data || {}) }),
  rotateAgentToken: (identifier: string, id: number, data?: { name?: string; client_type?: string }) =>
    request<any>(withProject(`/agents/${encodeURIComponent(identifier)}/tokens/${id}/rotate`), { method: 'POST', body: JSON.stringify(data || {}) }),
  revokeAgentToken: (identifier: string, id: number) =>
    request<any>(withProject(`/agents/${encodeURIComponent(identifier)}/tokens/${id}/revoke`), { method: 'POST' }),
  getOpenClawConfig: (identifier: string) =>
    request<any>(withProject(`/agents/${encodeURIComponent(identifier)}/openclaw-config`)),

  // Gantt
  getGanttData: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params) : '';
    return request<any>(withProject(`/gantt${qs}`));
  },

  // Req Links
  getReqLinks: () => request<any[]>('/req-links'),
  createReqLink: (sourceTaskId: string, targetTaskId: string, linkType: string) =>
    request<any>('/req-links', { method: 'POST', body: JSON.stringify({ source_task_id: sourceTaskId, target_task_id: targetTaskId, link_type: linkType }) }),
  deleteReqLink: (linkId: number) => request<any>(`/req-links/${linkId}`, { method: 'DELETE' }),

  // Reparent
  reparentTask: (taskId: string, newParentTaskId: string | null) =>
    request<any>(`/tasks/${taskId}/reparent`, { method: 'PATCH', body: JSON.stringify({ new_parent_task_id: newParentTaskId }) }),

  // Reorder children
  reorderChildren: (parentTaskId: string | null, orderedChildIds: string[]) =>
    request<any>('/tasks/reorder-children', { method: 'PATCH', body: JSON.stringify({ parent_task_id: parentTaskId, ordered_child_ids: orderedChildIds }) }),

  // Custom Fields
  getCustomFields: () => request<any[]>('/custom-fields'),
  createCustomField: (data: any) => request<any>('/custom-fields', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomField: (id: number, data: any) => request<any>(`/custom-fields/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCustomField: (id: number) => request<any>(`/custom-fields/${id}`, { method: 'DELETE' }),

  // Task Field Values
  getTaskFields: (taskId: string) => request<any[]>(`/tasks/${taskId}/fields`),
  setTaskFields: (taskId: string, values: Record<number, string>) =>
    request<any>(`/tasks/${taskId}/fields`, { method: 'PUT', body: JSON.stringify(values) }),

  // Attachments
  getAttachments: (taskId: string, type?: string) =>
    request<any[]>(`/tasks/${taskId}/attachments${type ? '?type=' + type : ''}`),
  addAttachment: (taskId: string, data: { type: string; title: string; content: string; metadata?: any; created_by?: string }) =>
    request<any>(`/tasks/${taskId}/attachments`, { method: 'POST', body: JSON.stringify(data) }),
  getAttachment: (id: number) => request<any>(`/attachments/${id}`),
  updateAttachment: (id: number, data: { title?: string; content?: string; metadata?: any; sort_order?: number }) =>
    request<any>(`/attachments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAttachment: (id: number) => request<any>(`/attachments/${id}`, { method: 'DELETE' }),
  reorderAttachments: (taskId: string, orderedIds: number[]) =>
    request<any>(`/tasks/${taskId}/attachments/reorder`, { method: 'PATCH', body: JSON.stringify({ ordered_ids: orderedIds }) }),

  // My Overview (v2.4)
  getMyOverview: () => request<any>(withProject('/my/overview')),

  // Permissions (v2.5)
  getTaskPermissions: (taskId: string) => request<any>(`/tasks/${taskId}/permissions`),
  grantPermission: (taskId: string, grantee: string, level: 'edit' | 'view') =>
    request<any>(`/tasks/${taskId}/permissions`, { method: 'POST', body: JSON.stringify({ grantee, level }) }),
  revokePermission: (taskId: string, grantee: string) =>
    request<any>(`/tasks/${taskId}/permissions/${encodeURIComponent(grantee)}`, { method: 'DELETE' }),

  // Batch Operations (v3.0)
  batchUpdateTasks: (taskIds: string[], updates: Record<string, any>) =>
    request<any>('/tasks/batch', { method: 'PATCH', body: JSON.stringify({ task_ids: taskIds, updates }) }),

  // Archive (v3.0)
  getArchivedTasks: () => request<any[]>(withProject('/tasks/archived')),
  archiveTask: (taskId: string) => request<any>(`/tasks/${taskId}/archive`, { method: 'POST' }),
  unarchiveTask: (taskId: string) => request<any>(`/tasks/${taskId}/unarchive`, { method: 'POST' }),

  // Iterations (v3.0)
  getIterations: (status?: string) => {
    const base = withProject('/iterations');
    return request<any[]>(status ? `${base}&status=${status}` : base);
  },
  createIteration: (data: { name: string; description?: string; start_date?: string; end_date?: string }) =>
    request<any>(withProject('/iterations'), { method: 'POST', body: JSON.stringify(data) }),
  getIteration: (id: number) => request<any>(`/iterations/${id}`),
  updateIteration: (id: number, data: any) =>
    request<any>(`/iterations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteIteration: (id: number) => request<any>(`/iterations/${id}`, { method: 'DELETE' }),
  addTaskToIteration: (iterationId: number, taskId: string) =>
    request<any>(`/iterations/${iterationId}/tasks`, { method: 'POST', body: JSON.stringify({ task_id: taskId }) }),
  removeTaskFromIteration: (iterationId: number, taskId: string) =>
    request<any>(`/iterations/${iterationId}/tasks/${taskId}`, { method: 'DELETE' }),

  // Notifications (v3.0)
  getNotifications: () => request<any[]>(withProject('/notifications')),
  getUnreadNotificationCount: () => request<any>(withProject('/notifications/unread-count')),
  markNotificationRead: (id: number) =>
    request<any>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () =>
    request<any>(withProject('/notifications/read-all'), { method: 'POST' }),

  // Intake 收件箱 (v3.1)
  submitIntake: (data: { title: string; description?: string; category?: string; submitter: string; priority?: string; project?: string }) => {
    // 提交接口不携带 Authorization Header
    const body = { ...data, project: data.project || _activeProjectSlug };
    return fetch(`${BASE}/intake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(res => {
      if (!res.ok) return res.json().then(e => { throw new Error(e.error || 'Submit failed'); });
      return res.json();
    });
  },
  getIntakeList: (params?: { status?: string; category?: string }) => {
    const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v) as string[][]) : '';
    return request<any[]>(withProject(`/intake${qs}`));
  },
  getIntakeStats: () => request<any>(withProject('/intake/stats')),
  getIntakeDetail: (intakeId: string) => request<any>(withProject(`/intake/${intakeId}`)),
  reviewIntake: (intakeId: string, data: {
    action: string;
    review_note?: string;
    parent_task_id?: string;
    owner?: string;
    priority?: string;
    extra_labels?: string[];
  }) => request<any>(withProject(`/intake/${intakeId}/review`), {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  reopenIntake: (intakeId: string) =>
    request<any>(withProject(`/intake/${intakeId}/reopen`), { method: 'POST' }),

  // Image Upload (v3.4)
  uploadImage: async (file: File): Promise<{ url: string; filename: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const headers = buildAuthHeaders({ body: formData }, true);
    const res = await fetch(`${BASE}/upload/image`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Upload failed');
    }
    return res.json();
  },
};
