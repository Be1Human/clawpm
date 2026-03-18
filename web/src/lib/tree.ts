import type { FilterState } from './useFilters';

const PRIORITY_ORDER: Record<string, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

export interface TreeRow<T = any> {
  node: T;
  depth: number;
}

export function getNodeLabels(node: any): string[] {
  if (Array.isArray(node.labels)) return node.labels;
  try { return JSON.parse(node.labels || '[]'); } catch { return []; }
}

export function compareNodesByPriority(a: any, b: any) {
  return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99)
    || ((a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    || String(a.title || '').localeCompare(String(b.title || ''));
}

export function sortTreeByPriority<T extends { children?: T[] }>(nodes: T[]): T[] {
  return [...nodes]
    .sort(compareNodesByPriority as any)
    .map(node => ({
      ...node,
      children: sortTreeByPriority(node.children || []),
    }));
}

export function flattenTree<T extends { children?: T[] }>(nodes: T[]): T[] {
  const result: T[] = [];
  const walk = (items: T[]) => {
    for (const item of items) {
      result.push(item);
      if (item.children?.length) walk(item.children);
    }
  };
  walk(nodes);
  return result;
}

export function flattenTreeWithDepth<T extends { children?: T[] }>(nodes: T[], depth = 0): TreeRow<T>[] {
  return nodes.flatMap(node => [
    { node, depth },
    ...flattenTreeWithDepth(node.children || [], depth + 1),
  ]);
}

export function treeMatchesFilters(task: any, filters: FilterState): boolean {
  if (filters.status.size > 0 && !filters.status.has(task.status)) return false;
  if (filters.priority.size > 0 && !filters.priority.has(task.priority)) return false;
  if (filters.owner && task.owner !== filters.owner) return false;

  const milestoneName = typeof task.milestone === 'string' ? task.milestone : task.milestone?.name;
  if (filters.milestone && milestoneName !== filters.milestone) return false;

  if (filters.label) {
    const labels = getNodeLabels(task);
    if (!labels.some((label: string) => label.toLowerCase().includes(filters.label.toLowerCase()))) return false;
  }

  if (filters.dateFrom && task.dueDate && task.dueDate < filters.dateFrom) return false;
  if (filters.dateTo && task.dueDate && task.dueDate > filters.dateTo) return false;

  if (filters.search) {
    const q = filters.search.toLowerCase();
    const matched = (task.title?.toLowerCase().includes(q)) || (task.taskId?.toLowerCase().includes(q));
    if (!matched) return false;
  }

  return true;
}

export function filterTreeByFilters<T extends { children?: T[] }>(nodes: T[], filters: FilterState): T[] {
  return filterTreeKeepAncestors(nodes, (node: T) => treeMatchesFilters(node, filters));
}

export function filterTreeKeepAncestors<T extends { children?: T[] }>(
  nodes: T[],
  predicate: (node: T) => boolean,
): T[] {
  return nodes.flatMap(node => {
    const children = filterTreeKeepAncestors(node.children || [], predicate);
    if (!predicate(node) && children.length === 0) return [];
    return [{ ...node, children }];
  });
}
