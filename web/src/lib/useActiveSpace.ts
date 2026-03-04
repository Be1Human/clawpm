import { useSyncExternalStore } from 'react';

export type Space = 'personal' | 'project';

const STORAGE_KEY = 'clawpm-space';
const listeners = new Set<() => void>();

export function getActiveSpace(): Space {
  return (localStorage.getItem(STORAGE_KEY) as Space) || 'personal';
}

export function setActiveSpace(space: Space): void {
  localStorage.setItem(STORAGE_KEY, space);
  listeners.forEach((fn) => fn());
}

export function subscribeActiveSpace(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 响应式地读取当前空间（personal / project），切换时自动重渲染 */
export function useActiveSpace(): [Space, (s: Space) => void] {
  const space = useSyncExternalStore(subscribeActiveSpace, getActiveSpace);
  return [space, setActiveSpace];
}
