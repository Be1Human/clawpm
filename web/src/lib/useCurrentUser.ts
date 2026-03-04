import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'clawpm-user';
const _listeners = new Set<() => void>();

export function getCurrentUser(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setCurrentUser(identifier: string): void {
  localStorage.setItem(STORAGE_KEY, identifier);
  _listeners.forEach(fn => fn());
}

export function clearCurrentUser(): void {
  localStorage.removeItem(STORAGE_KEY);
  _listeners.forEach(fn => fn());
}

export function subscribeCurrentUser(listener: () => void): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

/** 响应式地读取当前用户 identifier，切换时自动重渲染 */
export function useCurrentUser(): string | null {
  return useSyncExternalStore(subscribeCurrentUser, getCurrentUser);
}
