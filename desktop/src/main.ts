import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'fs/promises';
import { existsSync, watch, type FSWatcher } from 'fs';
import path from 'path';

// Some Windows systems create the BrowserWindow but fail to paint its GPU surface.
app.disableHardwareAcceleration();

const VAULT_FORMAT = 'clawpm-vault@1';
const VAULT_DIRECTORY = '.clawpm';
const ROOT_FILES = ['clawpm.json', 'domains.json', 'milestones.json', 'fields.json', 'links.json', 'people.json'] as const;
const RECENTS_FILE = 'recent-projects.json';

type RecentProject = {
  projectPath: string;
  vaultPath: string;
  name: string;
  lastOpenedAt: string;
};

type VaultSnapshot = {
  path: string;
  projectPath: string;
  name: string;
  files: Record<string, string>;
};

type VaultWrite = {
  path: string;
  content: string;
};

let mainWindow: BrowserWindow | null = null;
let activeProjectPath: string | null = null;
let vaultWatcher: FSWatcher | null = null;
let vaultRefreshTimer: NodeJS.Timeout | null = null;

function vaultPathForProject(projectPath: string): string {
  return path.join(projectPath, VAULT_DIRECTORY);
}

function recentsPath(): string {
  return path.join(app.getPath('userData'), RECENTS_FILE);
}

function writeDiagnostic(message: string): void {
  void fs.appendFile(path.join(app.getPath('userData'), 'renderer.log'), `${new Date().toISOString()} ${message}\n`);
}

async function atomicWrite(target: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.clawpm-tmp-${process.pid}`);
  await fs.writeFile(temporary, content, 'utf8');
  await fs.rename(temporary, target);
}

async function readRecents(): Promise<RecentProject[]> {
  try {
    const data = JSON.parse(await fs.readFile(recentsPath(), 'utf8')) as RecentProject[];
    if (!Array.isArray(data)) return [];
    const normalized = data.map(item => ({ ...item, vaultPath: vaultPathForProject(item.projectPath) }));
    if (JSON.stringify(normalized) !== JSON.stringify(data)) {
      await atomicWrite(recentsPath(), `${JSON.stringify(normalized, null, 2)}\n`);
    }
    return normalized;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw new Error('无法读取最近项目记录');
  }
}

async function rememberProject(snapshot: VaultSnapshot): Promise<RecentProject[]> {
  const item: RecentProject = {
    projectPath: snapshot.projectPath,
    vaultPath: snapshot.path,
    name: snapshot.name,
    lastOpenedAt: new Date().toISOString(),
  };
  const previous = (await readRecents()).map(project => ({
    ...project,
    vaultPath: vaultPathForProject(project.projectPath),
  }));
  const next = [item, ...previous.filter(project => project.projectPath.toLowerCase() !== item.projectPath.toLowerCase())]
    .slice(0, 10);
  await atomicWrite(recentsPath(), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

async function validateVault(vaultPath: string): Promise<{ name: string }> {
  const configPath = path.join(vaultPath, 'clawpm.json');
  let config: { format?: string; name?: string };
  try {
    config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  } catch {
    throw new Error(`不是有效需求库：缺少或无法读取 ${configPath}`);
  }
  if (config.format !== VAULT_FORMAT) {
    throw new Error(`不是有效需求库：clawpm.json 的 format 必须为 ${VAULT_FORMAT}`);
  }
  return { name: config.name?.trim() || path.basename(path.dirname(path.dirname(vaultPath))) };
}

function safeRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    throw new Error(`非法 Vault 文件路径：${value}`);
  }
  const allowedRoot = ROOT_FILES.includes(normalized as typeof ROOT_FILES[number]);
  const allowedShard = /^(tasks|archive)\/[^/]+\.json$/.test(normalized);
  if (!allowedRoot && !allowedShard) {
    throw new Error(`不允许写入 Vault 文件：${value}`);
  }
  return normalized;
}

async function readSnapshot(projectPath: string): Promise<VaultSnapshot> {
  const inputPath = path.resolve(projectPath);
  const absoluteProject = path.basename(inputPath).toLowerCase() === VAULT_DIRECTORY
    && existsSync(path.join(inputPath, 'clawpm.json'))
    ? path.dirname(inputPath)
    : inputPath;
  const vaultPath = vaultPathForProject(absoluteProject);
  const { name } = await validateVault(vaultPath);
  const files: Record<string, string> = {};
  for (const rootFile of ROOT_FILES) {
    const fullPath = path.join(vaultPath, rootFile);
    if (existsSync(fullPath)) files[rootFile] = await fs.readFile(fullPath, 'utf8');
  }
  for (const folder of ['tasks', 'archive']) {
    const directory = path.join(vaultPath, folder);
    if (!existsSync(directory)) continue;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.filter(item => item.isFile() && item.name.endsWith('.json')).sort((left, right) => left.name.localeCompare(right.name))) {
      files[`${folder}/${entry.name}`] = await fs.readFile(path.join(directory, entry.name), 'utf8');
    }
  }
  const snapshot = { path: vaultPath, projectPath: absoluteProject, name, files };
  await rememberProject(snapshot);
  return snapshot;
}

function notifyVaultChanged(snapshot: VaultSnapshot): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('vault:changed', snapshot);
}

function clearVaultWatcher(): void {
  vaultWatcher?.close();
  vaultWatcher = null;
  if (vaultRefreshTimer) clearTimeout(vaultRefreshTimer);
  vaultRefreshTimer = null;
}

function refreshActiveVault(): void {
  if (!activeProjectPath) return;
  void readSnapshot(activeProjectPath)
    .then(notifyVaultChanged)
    .catch(error => writeDiagnostic(`[vault] refresh failed: ${error.message}`));
}

function watchProjectVault(projectPath: string): void {
  const normalizedProjectPath = path.resolve(projectPath);
  if (activeProjectPath === normalizedProjectPath && vaultWatcher) return;

  clearVaultWatcher();
  activeProjectPath = normalizedProjectPath;
  const vaultPath = vaultPathForProject(normalizedProjectPath);

  try {
    vaultWatcher = watch(vaultPath, { recursive: true }, () => {
      if (vaultRefreshTimer) clearTimeout(vaultRefreshTimer);
      vaultRefreshTimer = setTimeout(() => {
        vaultRefreshTimer = null;
        refreshActiveVault();
      }, 250);
    });
    vaultWatcher.on('error', error => writeDiagnostic(`[vault] watch failed: ${error.message}`));
  } catch (error) {
    writeDiagnostic(`[vault] watch unavailable for ${vaultPath}: ${(error as Error).message}`);
  }
}

async function openProject(projectPath: string): Promise<VaultSnapshot> {
  const snapshot = await readSnapshot(projectPath);
  watchProjectVault(snapshot.projectPath);
  return snapshot;
}

async function createVault(projectPath: string): Promise<VaultSnapshot> {
  const absoluteProject = path.resolve(projectPath);
  const vaultPath = vaultPathForProject(absoluteProject);
  if (existsSync(path.join(vaultPath, 'clawpm.json'))) return readSnapshot(absoluteProject);
  const name = path.basename(absoluteProject);
  await atomicWrite(path.join(vaultPath, 'clawpm.json'), `${JSON.stringify({
    format: VAULT_FORMAT,
    name,
    workflow: {
      statuses: [
        { id: 'backlog', label: '待规划', kanban: 'backlog' },
        { id: 'planned', label: '已计划', kanban: 'planned' },
        { id: 'active', label: '进行中', kanban: 'active' },
        { id: 'review', label: '待评审', kanban: 'review' },
        { id: 'done', label: '已完成', kanban: 'done' },
      ],
    },
  }, null, 2)}\n`);
  await atomicWrite(path.join(vaultPath, 'domains.json'), '{\n  "format": "clawpm-domains@1",\n  "domains": []\n}\n');
  await atomicWrite(path.join(vaultPath, 'milestones.json'), '{\n  "format": "clawpm-milestones@1",\n  "milestones": []\n}\n');
  await atomicWrite(path.join(vaultPath, 'fields.json'), '{\n  "format": "clawpm-fields@1",\n  "fields": []\n}\n');
  await atomicWrite(path.join(vaultPath, 'links.json'), '{\n  "format": "clawpm-links@1",\n  "links": []\n}\n');
  await atomicWrite(path.join(vaultPath, 'people.json'), '{\n  "format": "clawpm-people@1",\n  "people": []\n}\n');
  return readSnapshot(absoluteProject);
}

async function selectProjectDirectory(): Promise<string | null> {
  const result = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
}

function notifyProjectOpened(snapshot: VaultSnapshot): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('project:opened', snapshot);
}

async function chooseProject(allowCreate: boolean, notifyRenderer = false): Promise<VaultSnapshot | null> {
  const projectPath = await selectProjectDirectory();
  if (!projectPath) return null;
  try {
    const snapshot = await openProject(projectPath);
    if (notifyRenderer) notifyProjectOpened(snapshot);
    return snapshot;
  } catch (error) {
    if (!allowCreate) throw error;
    const confirmation = await dialog.showMessageBox(mainWindow!, {
      type: 'question',
      buttons: ['创建需求库', '取消'],
      defaultId: 0,
      cancelId: 1,
      message: '所选目录尚未创建 ClawPM 需求库。',
      detail: `将在 ${vaultPathForProject(projectPath)} 创建需求库文件。`,
    });
    if (confirmation.response !== 0) return null;
    const snapshot = await createVault(projectPath);
    watchProjectVault(snapshot.projectPath);
    if (notifyRenderer) notifyProjectOpened(snapshot);
    return snapshot;
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    frame: false,
    backgroundColor: '#f4f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const developmentUrl = process.env.CLAWPM_DESKTOP_DEV_URL;
  if (developmentUrl) {
    void mainWindow.loadURL(developmentUrl)
      .then(() => writeDiagnostic(`[renderer] loaded ${developmentUrl}`))
      .catch(error => writeDiagnostic(`[renderer] unable to load ${developmentUrl}: ${error.message}`));
  } else {
    const entry = app.isPackaged
      ? path.join(process.resourcesPath, 'web', 'index.html')
      : path.resolve(__dirname, '../../web/dist/index.html');
    void mainWindow.loadFile(entry)
      .then(() => writeDiagnostic(`[renderer] loaded ${entry}`))
      .catch(error => writeDiagnostic(`[renderer] unable to load ${entry}: ${error.message}`));
  }
  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedUrl) => {
    writeDiagnostic(`[renderer] failed to load ${validatedUrl}: ${code} ${description}`);
  });
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    writeDiagnostic(`[renderer] console ${level} ${sourceId}:${line} ${message}`);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    writeDiagnostic(`[renderer] process gone: ${details.reason}`);
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

app.whenReady().then(() => {
  ipcMain.handle('project:choose', () => chooseProject(true));
  ipcMain.handle('project:create', async (_event, projectPath: string) => {
    const snapshot = await createVault(projectPath);
    watchProjectVault(snapshot.projectPath);
    return snapshot;
  });
  ipcMain.handle('project:open', async (_event, projectPath: string) => openProject(projectPath));
  ipcMain.handle('project:recent', () => readRecents());
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggle-maximize', () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle('window:close', () => mainWindow?.close());
  ipcMain.handle('vault:write', async (_event, projectPath: string, files: VaultWrite[]) => {
    const snapshot = await readSnapshot(projectPath);
    for (const file of files) {
      const relative = safeRelativePath(file.path);
      await atomicWrite(path.join(snapshot.path, relative), file.content);
    }
  });
  createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', clearVaultWatcher);
