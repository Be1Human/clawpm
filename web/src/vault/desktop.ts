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

export type SkillPlatform = 'claude' | 'cursor' | 'codex' | 'codebuddy';
export type SkillScope = 'user' | 'project';
export type SkillInjectionStatus = 'not_installed' | 'current' | 'update_available';

export interface SkillInjectionTarget {
  platform: SkillPlatform;
  platformName: string;
  scope: SkillScope;
  path: string;
  additionalPaths: string[];
  note: string;
  status: SkillInjectionStatus;
  installedFileCount: number;
  matchingFileCount: number;
  totalFileCount: number;
}

export interface SkillInjectionRequest {
  projectPath: string;
  platform: SkillPlatform;
  scope: SkillScope;
}

export interface SkillInjectionResult {
  ok: boolean;
  changed: boolean;
  backupPath: string | null;
  backupPaths: string[];
  target: SkillInjectionTarget;
  files: string[];
}

export interface RecommendedSkillInstallationResult {
  ok: boolean;
  installedPlatforms: number;
  installedPaths: string[];
  globalAgentsPath: string | null;
  manifestPath: string;
  backupPaths: string[];
  failures: Array<{ platform: SkillPlatform; message: string }>;
}

declare global {
  interface Window {
    clawpm?: {
      chooseProject(): Promise<VaultSnapshot | null>;
      createProject(projectPath: string): Promise<VaultSnapshot>;
      openProject(projectPath: string): Promise<VaultSnapshot>;
      recentProjects(): Promise<RecentProject[]>;
      syncAgentSkill(projectPath: string): Promise<{ ok: boolean; files: string[] }>;
      getSkillInjectionTargets(projectPath: string): Promise<SkillInjectionTarget[]>;
      injectSkill(request: SkillInjectionRequest): Promise<SkillInjectionResult>;
      installRecommendedSkill(projectPath: string): Promise<RecommendedSkillInstallationResult>;
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

export async function getSkillInjectionTargets(projectPath: string): Promise<SkillInjectionTarget[]> {
  return requireDesktop().getSkillInjectionTargets(projectPath);
}

export async function injectSkill(request: SkillInjectionRequest): Promise<SkillInjectionResult> {
  return requireDesktop().injectSkill(request);
}

export async function installRecommendedSkill(projectPath: string): Promise<RecommendedSkillInstallationResult> {
  return requireDesktop().installRecommendedSkill(projectPath);
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
