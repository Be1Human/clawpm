import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'clawpm-member';
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach(listener => listener());
}

export function getCurrentMember(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setCurrentMember(identifier: string) {
  localStorage.setItem(STORAGE_KEY, identifier);
  emit();
}

export function clearCurrentMember() {
  localStorage.removeItem(STORAGE_KEY);
  emit();
}

export function subscribeCurrentMember(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCurrentMember() {
  return useSyncExternalStore(subscribeCurrentMember, getCurrentMember);
}
