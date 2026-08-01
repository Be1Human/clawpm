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
      syncAgentSkill(projectPath: string): Promise<{ ok: boolean; files: string[] }>;
      onProjectOpened(callback: (snapshot: VaultSnapshot) => void): () => void;
      onVaultChanged(callback: (snapshot: VaultSnapshot) => void): () => void;
      minimizeWindow(): Promise<void>;
      toggleMaximizeWindow(): Promise<boolean>;
      closeWindow(): Promise<void>;
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

export async function listDesktopProjects(): Promise<RecentProject[]> {
  return requireDesktop().recentProjects();
}

export async function syncProjectAgentSkill(projectPath: string): Promise<{ ok: boolean; files: string[] }> {
  return requireDesktop().syncAgentSkill(projectPath);
}

export function onVaultOpened(callback: (snapshot: VaultSnapshot) => void): () => void {
  return requireDesktop().onProjectOpened(callback);
}

export function onVaultChanged(callback: (snapshot: VaultSnapshot) => void): () => void {
  return requireDesktop().onVaultChanged(callback);
}

export async function writeVaultFiles(projectPath: string, files: VaultWrite[]): Promise<void> {
  await requireDesktop().writeVaultFiles(projectPath, files);
}
