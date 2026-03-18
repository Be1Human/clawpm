import { useState, useCallback, useEffect } from 'react';
import { useActiveProject } from './useActiveProject';

export interface RecentTask {
  taskId: string;
  title: string;
  timestamp: number;
}

const STORAGE_KEY_PREFIX = 'clawpm-recent-tasks';
const MAX_RECENT = 10;

function getStorageKey(projectSlug: string): string {
  return `${STORAGE_KEY_PREFIX}:${projectSlug}`;
}

function loadRecent(projectSlug: string): RecentTask[] {
  try {
    const raw = localStorage.getItem(getStorageKey(projectSlug));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(projectSlug: string, list: RecentTask[]) {
  localStorage.setItem(getStorageKey(projectSlug), JSON.stringify(list));
}

export function useRecentTasks() {
  const activeProject = useActiveProject();
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>(() => loadRecent(activeProject));

  useEffect(() => {
    setRecentTasks(loadRecent(activeProject));
  }, [activeProject]);

  const recordVisit = useCallback((taskId: string, title: string) => {
    setRecentTasks(prev => {
      const filtered = prev.filter(t => t.taskId !== taskId);
      const next = [{ taskId, title, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT);
      saveRecent(activeProject, next);
      return next;
    });
  }, [activeProject]);

  const clearRecent = useCallback(() => {
    setRecentTasks([]);
    localStorage.removeItem(getStorageKey(activeProject));
  }, [activeProject]);

  return { recentTasks, recordVisit, clearRecent };
}
