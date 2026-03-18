import { useSyncExternalStore } from 'react';

const TOKEN_KEY = 'clawpm-auth-token';
const ACCOUNT_KEY = 'clawpm-auth-account';
const listeners = new Set<() => void>();

export type AuthAccount = {
  id: number;
  username: string;
  displayName: string;
  status?: string;
  lastLoginAt?: string | null;
};

type AuthSnapshot = {
  token: string | null;
  account: AuthAccount | null;
  isAuthenticated: boolean;
};

// 模块级快照缓存：只在 localStorage 原始字符串变化时才创建新对象
// 避免 useSyncExternalStore 因快照引用不稳定而无限循环
let _cachedTokenStr: string | null | undefined = undefined;
let _cachedAccountStr: string | null | undefined = undefined;
let _cachedSnapshot: AuthSnapshot = {
  token: null,
  account: null,
  isAuthenticated: false,
};

function getAuthSnapshot(): AuthSnapshot {
  const tokenStr = localStorage.getItem(TOKEN_KEY);
  const accountStr = localStorage.getItem(ACCOUNT_KEY);
  if (tokenStr === _cachedTokenStr && accountStr === _cachedAccountStr) {
    return _cachedSnapshot;
  }
  _cachedTokenStr = tokenStr;
  _cachedAccountStr = accountStr;
  let account: AuthAccount | null = null;
  if (accountStr) {
    try { account = JSON.parse(accountStr); } catch { /* ignore */ }
  }
  _cachedSnapshot = {
    token: tokenStr,
    account,
    isAuthenticated: !!tokenStr,
  };
  return _cachedSnapshot;
}

function emit() {
  listeners.forEach(listener => listener());
}

export function subscribeAuthSession(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthAccount(): AuthAccount | null {
  const raw = localStorage.getItem(ACCOUNT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthAccount;
  } catch {
    return null;
  }
}

export function setAuthSession(params: { token: string; account: AuthAccount }) {
  localStorage.setItem(TOKEN_KEY, params.token);
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(params.account));
  emit();
}

export function updateAuthAccount(account: AuthAccount | null) {
  if (!account) localStorage.removeItem(ACCOUNT_KEY);
  else localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  emit();
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
  emit();
}

export function isAuthenticated() {
  return !!getAuthToken();
}

export function useAuthSession(): AuthSnapshot {
  return useSyncExternalStore(subscribeAuthSession, getAuthSnapshot);
}
