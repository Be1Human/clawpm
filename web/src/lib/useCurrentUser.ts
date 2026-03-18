import { clearCurrentMember, getCurrentMember, setCurrentMember, subscribeCurrentMember, useCurrentMember } from './useCurrentMember';

const ONBOARDED_KEY = 'clawpm-onboarded';

export function getCurrentUser(): string | null {
  return getCurrentMember();
}

export function setCurrentUser(identifier: string): void {
  setCurrentMember(identifier);
}

export function clearCurrentUser(): void {
  clearCurrentMember();
}

export function subscribeCurrentUser(listener: () => void): () => void {
  return subscribeCurrentMember(listener);
}

/** 兼容旧调用：当前用户即当前成员 identifier */
export function useCurrentUser(): string | null {
  return useCurrentMember();
}

export function isOnboarded(): boolean {
  return localStorage.getItem(ONBOARDED_KEY) === 'true';
}

export function setOnboarded(): void {
  localStorage.setItem(ONBOARDED_KEY, 'true');
}

export function clearOnboarded(): void {
  localStorage.removeItem(ONBOARDED_KEY);
}
