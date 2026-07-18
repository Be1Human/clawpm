export interface VaultSnapshot {
  path: string;
  projectPath: string;
  name: string;
  files: Record<string, string>;
}

export interface VaultWrite {
  path: string;
  content: string;
}

export interface RecentProject {
  projectPath: string;
  vaultPath: string;
  name: string;
  lastOpenedAt: string;
}

declare global {
  interface Window {
    clawpm?: {
      chooseProject(): Promise<VaultSnapshot | null>;
      createProject(projectPath: string): Promise<VaultSnapshot>;
      openProject(projectPath: string): Promise<VaultSnapshot>;
      recentProjects(): Promise<RecentProject[]>;
      writeVaultFiles(projectPath: string, files: VaultWrite[]): Promise<void>;
    };
  }
}

export function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && window.clawpm !== undefined;
}

function requireDesktop(): NonNullable<Window['clawpm']> {
  if (!window.clawpm) throw new Error('ClawPM 必须在桌面客户端中运行。');
  return window.clawpm;
}

export async function pickVault(): Promise<VaultSnapshot | null> {
  return requireDesktop().chooseProject();
}

export async function openVault(projectPath: string): Promise<VaultSnapshot> {
  return requireDesktop().openProject(projectPath);
}

export async function writeVaultFiles(projectPath: string, files: VaultWrite[]): Promise<void> {
  await requireDesktop().writeVaultFiles(projectPath, files);
}
