import { invoke } from '@tauri-apps/api/core';

export interface VaultSnapshot {
  path: string;
  files: Record<string, string>;
}

export interface VaultWrite {
  path: string;
  content: string;
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function requireTauri(): void {
  if (!isTauriRuntime()) {
    throw new Error('ClawPM 必须在桌面客户端中运行，浏览器预览无法访问本地 Vault。');
  }
}

export async function pickVault(): Promise<VaultSnapshot | null> {
  requireTauri();
  return invoke<VaultSnapshot | null>('pick_vault');
}

export async function openVault(path: string): Promise<VaultSnapshot> {
  requireTauri();
  return invoke<VaultSnapshot>('open_vault', { path });
}

export async function writeVaultFiles(path: string, files: VaultWrite[]): Promise<void> {
  requireTauri();
  await invoke('write_vault_files', { path, files });
}
