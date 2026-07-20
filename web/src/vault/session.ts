import { useSyncExternalStore } from 'react';
import { isElectronRuntime, listDesktopProjects, onVaultChanged, onVaultOpened, openVault, pickVault, type VaultSnapshot } from './desktop';
import { forgetVault, listRecentVaults, rememberVault, type RecentVault } from './recent-vaults';

export type VaultSessionState =
  | { status: 'loading'; recent: RecentVault[] }
  | { status: 'empty'; recent: RecentVault[] }
  | { status: 'ready'; recent: RecentVault[]; vault: VaultSnapshot }
  | { status: 'error'; recent: RecentVault[]; message: string };

let state: VaultSessionState = { status: 'loading', recent: [] };
const listeners = new Set<() => void>();

function publish(next: VaultSessionState): void {
  state = next;
  listeners.forEach(listener => listener());
}

function vaultName(snapshot: VaultSnapshot): string {
  try {
    const config = JSON.parse(snapshot.files['clawpm.json'] || '{}') as { name?: string };
    return config.name?.trim() || snapshot.path.split(/[\\/]/).filter(Boolean).pop() || '未命名 Vault';
  } catch {
    return snapshot.path.split(/[\\/]/).filter(Boolean).pop() || '未命名 Vault';
  }
}

async function activate(snapshot: VaultSnapshot): Promise<void> {
  const recent = await rememberVault({ path: snapshot.projectPath, name: vaultName(snapshot) });
  publish({ status: 'ready', recent, vault: snapshot });
}

function refresh(snapshot: VaultSnapshot): void {
  if (state.status === 'ready' && state.vault.projectPath === snapshot.projectPath) {
    publish({ ...state, vault: snapshot });
    return;
  }
  void activate(snapshot);
}

export async function initializeVaultSession(): Promise<void> {
  try {
    if (isElectronRuntime()) {
      onVaultOpened(snapshot => { void activate(snapshot); });
      onVaultChanged(refresh);
    }
    const recent = isElectronRuntime()
      ? (await listDesktopProjects()).map(project => ({
        path: project.projectPath,
        name: project.name,
        lastOpenedAt: project.lastOpenedAt,
      }))
      : await listRecentVaults();
    publish({ status: 'empty', recent });
  } catch (error) {
    publish({ status: 'error', recent: [], message: (error as Error).message });
  }
}

export async function chooseVault(): Promise<void> {
  try {
    const snapshot = await pickVault();
    if (!snapshot) return;
    await activate(snapshot);
  } catch (error) {
    const recent = state.recent;
    publish({ status: 'error', recent, message: (error as Error).message });
  }
}

export async function reopenVault(path: string): Promise<void> {
  try {
    const snapshot = await openVault(path);
    await activate(snapshot);
  } catch (error) {
    const recent = state.recent;
    await forgetVault(path).catch(() => undefined);
    publish({ status: 'error', recent: recent.filter(vault => vault.path !== path), message: (error as Error).message });
  }
}

export function getVaultSession(): VaultSessionState {
  return state;
}

export function subscribeVaultSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVaultSession(): VaultSessionState {
  return useSyncExternalStore(subscribeVaultSession, getVaultSession);
}
