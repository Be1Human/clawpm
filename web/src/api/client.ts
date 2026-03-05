import { getCurrentUser } from '../lib/useCurrentUser';

const BASE = '/api/v1';
const TOKEN = import.meta.env.VITE_API_TOKEN || 'dev-token';

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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${TOKEN}`,
    ...options?.headers as Record<string, string>,
  };
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }
  const currentUser = getCurrentUser();
  if (currentUser) {
    headers['X-ClawPM-User'] = currentUser;
  }
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

  // Members
  getMembers: (type?: string) => {
    const base = withProject('/members');
    return request<any[]>(type ? `${base}&type=${type}` : base);
  },
  getMember: (identifier: string) => request<any>(`/members/${encodeURIComponent(identifier)}`),
  createMember: (data: any) => request<any>(withProject('/members'), { method: 'POST', body: JSON.stringify(data) }),
  updateMember: (identifier: string, data: any) => request<any>(`/members/${encodeURIComponent(identifier)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteMember: (identifier: string) => request<any>(`/members/${encodeURIComponent(identifier)}`, { method: 'DELETE' }),

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
};
