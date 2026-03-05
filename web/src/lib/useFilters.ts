import { useState, useCallback, useMemo } from 'react';

export interface FilterState {
  status: Set<string>;
  priority: Set<string>;
  owner: string;
  milestone: string;
  label: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

export interface SavedView {
  name: string;
  filters: {
    status: string[];
    priority: string[];
    owner: string;
    milestone: string;
    label: string;
    dateFrom: string;
    dateTo: string;
    search: string;
  };
}

const EMPTY_FILTER: FilterState = {
  status: new Set(),
  priority: new Set(),
  owner: '',
  milestone: '',
  label: '',
  dateFrom: '',
  dateTo: '',
  search: '',
};

function loadFilters(key: string): FilterState {
  try {
    const raw = localStorage.getItem(`clawpm-filters-${key}`);
    if (!raw) return { ...EMPTY_FILTER, status: new Set(), priority: new Set() };
    const parsed = JSON.parse(raw);
    return {
      ...EMPTY_FILTER,
      ...parsed,
      status: new Set(parsed.status || []),
      priority: new Set(parsed.priority || []),
    };
  } catch {
    return { ...EMPTY_FILTER, status: new Set(), priority: new Set() };
  }
}

function saveFilters(key: string, filters: FilterState) {
  const serializable = {
    ...filters,
    status: Array.from(filters.status),
    priority: Array.from(filters.priority),
  };
  localStorage.setItem(`clawpm-filters-${key}`, JSON.stringify(serializable));
}

function loadSavedViews(key: string): SavedView[] {
  try {
    const raw = localStorage.getItem(`clawpm-saved-views-${key}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSavedViews(key: string, views: SavedView[]) {
  localStorage.setItem(`clawpm-saved-views-${key}`, JSON.stringify(views));
}

export function useFilters(storageKey: string) {
  const [filters, setFilters] = useState<FilterState>(() => loadFilters(storageKey));
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews(storageKey));

  const setFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(prev => {
      const next = { ...prev, [key]: value };
      saveFilters(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const toggleSetValue = useCallback((key: 'status' | 'priority', value: string) => {
    setFilters(prev => {
      const s = new Set(prev[key]);
      if (s.has(value)) s.delete(value); else s.add(value);
      const next = { ...prev, [key]: s };
      saveFilters(storageKey, next);
      return next;
    });
  }, [storageKey]);

  const clearAll = useCallback(() => {
    const empty: FilterState = { ...EMPTY_FILTER, status: new Set(), priority: new Set() };
    setFilters(empty);
    saveFilters(storageKey, empty);
  }, [storageKey]);

  const saveView = useCallback((name: string) => {
    const view: SavedView = {
      name,
      filters: {
        ...filters,
        status: Array.from(filters.status),
        priority: Array.from(filters.priority),
      },
    };
    const next = [...savedViews.filter(v => v.name !== name), view];
    setSavedViews(next);
    persistSavedViews(storageKey, next);
  }, [filters, savedViews, storageKey]);

  const loadView = useCallback((view: SavedView) => {
    const loaded: FilterState = {
      ...view.filters,
      status: new Set(view.filters.status),
      priority: new Set(view.filters.priority),
    };
    setFilters(loaded);
    saveFilters(storageKey, loaded);
  }, [storageKey]);

  const deleteView = useCallback((name: string) => {
    const next = savedViews.filter(v => v.name !== name);
    setSavedViews(next);
    persistSavedViews(storageKey, next);
  }, [savedViews, storageKey]);

  const hasActiveFilters = useMemo(() => {
    return filters.status.size > 0 || filters.priority.size > 0 ||
      !!filters.owner || !!filters.milestone || !!filters.label ||
      !!filters.dateFrom || !!filters.dateTo || !!filters.search;
  }, [filters]);

  return {
    filters,
    setFilter,
    toggleSetValue,
    clearAll,
    savedViews,
    saveView,
    loadView,
    deleteView,
    hasActiveFilters,
  };
}

/** 对任务列表应用过滤条件（前端过滤） */
export function applyFilters(tasks: any[], filters: FilterState): any[] {
  return tasks.filter(task => {
    if (filters.status.size > 0 && !filters.status.has(task.status)) return false;
    if (filters.priority.size > 0 && !filters.priority.has(task.priority)) return false;
    if (filters.owner && task.owner !== filters.owner) return false;
    if (filters.milestone && task.milestone !== filters.milestone) return false;
    if (filters.label) {
      const labels: string[] = Array.isArray(task.labels) ? task.labels : [];
      if (!labels.some(l => l.toLowerCase().includes(filters.label.toLowerCase()))) return false;
    }
    if (filters.dateFrom && task.dueDate && task.dueDate < filters.dateFrom) return false;
    if (filters.dateTo && task.dueDate && task.dueDate > filters.dateTo) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const match = (task.title?.toLowerCase().includes(q)) || (task.taskId?.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });
}
