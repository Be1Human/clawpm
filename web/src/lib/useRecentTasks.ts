import { useState, useCallback } from 'react';

export interface RecentTask {
  taskId: string;
  title: string;
  timestamp: number;
}

const STORAGE_KEY = 'clawpm-recent-tasks';
const MAX_RECENT = 10;

function loadRecent(): RecentTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: RecentTask[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function useRecentTasks() {
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>(loadRecent);

  const recordVisit = useCallback((taskId: string, title: string) => {
    setRecentTasks(prev => {
      const filtered = prev.filter(t => t.taskId !== taskId);
      const next = [{ taskId, title, timestamp: Date.now() }, ...filtered].slice(0, MAX_RECENT);
      saveRecent(next);
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecentTasks([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { recentTasks, recordVisit, clearRecent };
}
