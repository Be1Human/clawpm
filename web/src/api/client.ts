const BASE = '/api/v1';
const TOKEN = import.meta.env.VITE_API_TOKEN || 'dev-token';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Tasks
  getTasks: (params?: Record<string, string>) =>
    request<any[]>(`/tasks${params ? '?' + new URLSearchParams(params) : ''}`),
  getTaskTree: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params) : '';
    return request<any[]>(`/tasks/tree${qs}`);
  },
  getTaskChildren: (taskId: string) =>
    request<any[]>(`/tasks/${taskId}/children`),
  getTask: (id: string) => request<any>(`/tasks/${id}`),
  createTask: (data: any) => request<any>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: string, data: any) => request<any>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
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
  getBacklog: (params?: Record<string, string>) =>
    request<any[]>(`/backlog${params ? '?' + new URLSearchParams(params) : ''}`),
  createBacklogItem: (data: any) => request<any>('/backlog', { method: 'POST', body: JSON.stringify(data) }),
  updateBacklogItem: (id: string, data: any) => request<any>(`/backlog/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  scheduleBacklogItem: (id: string, data: any) =>
    request<any>(`/backlog/${id}/schedule`, { method: 'POST', body: JSON.stringify(data) }),

  // Config
  getDomains: () => request<any[]>('/domains'),
  createDomain: (data: any) => request<any>('/domains', { method: 'POST', body: JSON.stringify(data) }),
  getMilestones: () => request<any[]>('/milestones'),
  createMilestone: (data: any) => request<any>('/milestones', { method: 'POST', body: JSON.stringify(data) }),

  // Goals
  getGoals: () => request<any[]>('/goals'),
  createGoal: (data: any) => request<any>('/goals', { method: 'POST', body: JSON.stringify(data) }),

  // Dashboard
  getOverview: () => request<any>('/dashboard/overview'),
  getRisks: () => request<any>('/dashboard/risks'),
  getResources: () => request<any>('/dashboard/resources'),

  // Members
  getMembers: (type?: string) => request<any[]>(`/members${type ? '?type=' + type : ''}`),
  getMember: (identifier: string) => request<any>(`/members/${encodeURIComponent(identifier)}`),
  createMember: (data: any) => request<any>('/members', { method: 'POST', body: JSON.stringify(data) }),
  updateMember: (identifier: string, data: any) => request<any>(`/members/${encodeURIComponent(identifier)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteMember: (identifier: string) => request<any>(`/members/${encodeURIComponent(identifier)}`, { method: 'DELETE' }),

  // Gantt
  getGanttData: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params) : '';
    return request<any>(`/gantt${qs}`);
  },
};
