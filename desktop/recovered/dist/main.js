"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
// Some Windows systems create the BrowserWindow but fail to paint its GPU surface.
electron_1.app.disableHardwareAcceleration();
const VAULT_FORMAT = 'clawpm-vault@1';
const VAULT_DIRECTORY = '.clawpm';
const ROOT_FILES = ['clawpm.json', 'domains.json', 'milestones.json', 'fields.json', 'links.json', 'people.json'];
const RECENTS_FILE = 'recent-projects.json';
const AGENTS_FILE = 'AGENTS.md';
function buildAgentSkillDoc(vaultName) {
    return [
        '# ClawPM 项目 Agent 操作规范',
        '',
        `本目录就是“${vaultName}”的 ClawPM Vault。所有需求数据都在 .clawpm 内，并应随 Git 提交。`,
        '',
        '## 先读再写',
        '',
        '1. 先读取 clawpm.json、domains.json、milestones.json、people.json 和目标任务分片。',
        '2. workflow.statuses[].id 是唯一合法状态来源；不要从其他项目复制状态。',
        '3. 修改前执行 git diff -- .clawpm，保留已有未提交变更。',
        '4. 不使用 docs/需求管理、SQLite、HTTP API、端口或 token；.clawpm 本身就是 Vault。',
        '',
        '## 目录与数据',
        '',
        '```text',
        'clawpm.json          工作流状态',
        'domains.json         领域定义',
        'milestones.json      里程碑',
        'fields.json          自定义字段',
        'links.json           任务关联',
        'people.json          人员',
        'tasks/<CODE>.json    活跃任务',
        'archive/<CODE>.json  已归档任务',
        '```',
        '',
        '## 创建和更新任务',
        '',
        '- 任务是扁平 JSON 记录；父子关系使用 parent 指向父任务 id。',
        '- id 在整个 Vault 唯一。直接创建时，按领域已有最大编号递增，禁止复用或重写现有 id。',
        '- 有领域的任务写入 tasks/<CODE>.json，且 domain 必须等于该领域 code；无领域任务写入 tasks/_inbox.json。',
        '- 任务至少应有 id、title、status。description 使用字符串数组，一行一个元素。',
        '- 更新进度时，写入 progress、updatedAt，并在 history 追加 { at, progress, summary }。',
        '- 完成实现前必须填写可验证的验收标准；完成后补充交付证据，例如代码路径、提交、测试命令或产物位置。',
        '',
        '## 人员、依赖和归档',
        '',
        '- 人员写入 people.json 的 people 数组，identifier 必须唯一。',
        '- 前置依赖写入 deps，跨任务关系写入 links.json。',
        '- 归档任务时设置 archivedAt，并移动到 archive/<CODE>.json。',
        '',
        '## 写入后的自检',
        '',
        '1. 确认修改过的 JSON 可解析。',
        '2. 确认任务 id、父任务、领域、状态、人员和依赖引用有效。',
        '3. 执行 git diff --check -- .clawpm 与 git diff -- .clawpm。',
        '4. 不覆盖无关文件，不做无意义格式化。',
        '',
    ].join('\n');
}
let mainWindow = null;
let activeProjectPath = null;
let vaultWatcher = null;
let vaultRefreshTimer = null;
function vaultPathForProject(projectPath) {
    return path_1.default.join(projectPath, VAULT_DIRECTORY);
}
function recentsPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), RECENTS_FILE);
}
function writeDiagnostic(message) {
    void promises_1.default.appendFile(path_1.default.join(electron_1.app.getPath('userData'), 'renderer.log'), `${new Date().toISOString()} ${message}\n`);
}
async function atomicWrite(target, content) {
    await promises_1.default.mkdir(path_1.default.dirname(target), { recursive: true });
    const temporary = path_1.default.join(path_1.default.dirname(target), `.${path_1.default.basename(target)}.clawpm-tmp-${process.pid}`);
    await promises_1.default.writeFile(temporary, content, 'utf8');
    await promises_1.default.rename(temporary, target);
}
async function readRecents() {
    try {
        const data = JSON.parse(await promises_1.default.readFile(recentsPath(), 'utf8'));
        if (!Array.isArray(data))
            return [];
        const normalized = data.map(item => ({ ...item, vaultPath: vaultPathForProject(item.projectPath) }));
        if (JSON.stringify(normalized) !== JSON.stringify(data)) {
            await atomicWrite(recentsPath(), `${JSON.stringify(normalized, null, 2)}\n`);
        }
        return normalized;
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return [];
        throw new Error('无法读取最近项目记录');
    }
}
async function rememberProject(snapshot) {
    const item = {
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
async function validateVault(vaultPath) {
    const configPath = path_1.default.join(vaultPath, 'clawpm.json');
    let config;
    try {
        config = JSON.parse(await promises_1.default.readFile(configPath, 'utf8'));
    }
    catch {
        throw new Error(`不是有效需求库：缺少或无法读取 ${configPath}`);
    }
    if (config.format !== VAULT_FORMAT) {
        throw new Error(`不是有效需求库：clawpm.json 的 format 必须为 ${VAULT_FORMAT}`);
    }
    return { name: config.name?.trim() || path_1.default.basename(path_1.default.dirname(path_1.default.dirname(vaultPath))) };
}
function safeRelativePath(value) {
    const normalized = value.replace(/\\/g, '/');
    if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
        throw new Error(`非法 Vault 文件路径：${value}`);
    }
    const allowedRoot = ROOT_FILES.includes(normalized);
    const allowedShard = /^(tasks|archive)\/[^/]+\.json$/.test(normalized);
    if (!allowedRoot && !allowedShard) {
        throw new Error(`不允许写入 Vault 文件：${value}`);
    }
    return normalized;
}
async function readSnapshot(projectPath) {
    const inputPath = path_1.default.resolve(projectPath);
    const absoluteProject = path_1.default.basename(inputPath).toLowerCase() === VAULT_DIRECTORY
        && (0, fs_1.existsSync)(path_1.default.join(inputPath, 'clawpm.json'))
        ? path_1.default.dirname(inputPath)
        : inputPath;
    const vaultPath = vaultPathForProject(absoluteProject);
    const { name } = await validateVault(vaultPath);
    const files = {};
    for (const rootFile of ROOT_FILES) {
        const fullPath = path_1.default.join(vaultPath, rootFile);
        if ((0, fs_1.existsSync)(fullPath))
            files[rootFile] = await promises_1.default.readFile(fullPath, 'utf8');
    }
    for (const folder of ['tasks', 'archive']) {
        const directory = path_1.default.join(vaultPath, folder);
        if (!(0, fs_1.existsSync)(directory))
            continue;
        const entries = await promises_1.default.readdir(directory, { withFileTypes: true });
        for (const entry of entries.filter(item => item.isFile() && item.name.endsWith('.json')).sort((left, right) => left.name.localeCompare(right.name))) {
            files[`${folder}/${entry.name}`] = await promises_1.default.readFile(path_1.default.join(directory, entry.name), 'utf8');
        }
    }
    const snapshot = { path: vaultPath, projectPath: absoluteProject, name, files };
    await rememberProject(snapshot);
    return snapshot;
}
function notifyVaultChanged(snapshot) {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    mainWindow.webContents.send('vault:changed', snapshot);
}
function clearVaultWatcher() {
    vaultWatcher?.close();
    vaultWatcher = null;
    if (vaultRefreshTimer)
        clearTimeout(vaultRefreshTimer);
    vaultRefreshTimer = null;
}
function refreshActiveVault() {
    if (!activeProjectPath)
        return;
    void readSnapshot(activeProjectPath)
        .then(notifyVaultChanged)
        .catch(error => writeDiagnostic(`[vault] refresh failed: ${error.message}`));
}
function watchProjectVault(projectPath) {
    const normalizedProjectPath = path_1.default.resolve(projectPath);
    if (activeProjectPath === normalizedProjectPath && vaultWatcher)
        return;
    clearVaultWatcher();
    activeProjectPath = normalizedProjectPath;
    const vaultPath = vaultPathForProject(normalizedProjectPath);
    try {
        vaultWatcher = (0, fs_1.watch)(vaultPath, { recursive: true }, () => {
            if (vaultRefreshTimer)
                clearTimeout(vaultRefreshTimer);
            vaultRefreshTimer = setTimeout(() => {
                vaultRefreshTimer = null;
                refreshActiveVault();
            }, 250);
        });
        vaultWatcher.on('error', error => writeDiagnostic(`[vault] watch failed: ${error.message}`));
    }
    catch (error) {
        writeDiagnostic(`[vault] watch unavailable for ${vaultPath}: ${error.message}`);
    }
}
async function openProject(projectPath) {
    const snapshot = await readSnapshot(projectPath);
    watchProjectVault(snapshot.projectPath);
    return snapshot;
}
async function createVault(projectPath) {
    const absoluteProject = path_1.default.resolve(projectPath);
    const vaultPath = vaultPathForProject(absoluteProject);
    if ((0, fs_1.existsSync)(path_1.default.join(vaultPath, 'clawpm.json')))
        return readSnapshot(absoluteProject);
    const name = path_1.default.basename(absoluteProject);
    await atomicWrite(path_1.default.join(vaultPath, 'clawpm.json'), `${JSON.stringify({
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
    await atomicWrite(path_1.default.join(vaultPath, 'domains.json'), '{\n  "format": "clawpm-domains@1",\n  "domains": []\n}\n');
    await atomicWrite(path_1.default.join(vaultPath, 'milestones.json'), '{\n  "format": "clawpm-milestones@1",\n  "milestones": []\n}\n');
    await atomicWrite(path_1.default.join(vaultPath, 'fields.json'), '{\n  "format": "clawpm-fields@1",\n  "fields": []\n}\n');
    await atomicWrite(path_1.default.join(vaultPath, 'links.json'), '{\n  "format": "clawpm-links@1",\n  "links": []\n}\n');
    await atomicWrite(path_1.default.join(vaultPath, 'people.json'), '{\n  "format": "clawpm-people@1",\n  "people": []\n}\n');
    await atomicWrite(path_1.default.join(vaultPath, AGENTS_FILE), buildAgentSkillDoc(name));
    return readSnapshot(absoluteProject);
}
async function selectProjectDirectory() {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
}
function notifyProjectOpened(snapshot) {
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('project:opened', snapshot);
}
async function chooseProject(allowCreate, notifyRenderer = false) {
    const projectPath = await selectProjectDirectory();
    if (!projectPath)
        return null;
    try {
        const snapshot = await openProject(projectPath);
        if (notifyRenderer)
            notifyProjectOpened(snapshot);
        return snapshot;
    }
    catch (error) {
        if (!allowCreate)
            throw error;
        const confirmation = await electron_1.dialog.showMessageBox(mainWindow, {
            type: 'question',
            buttons: ['创建需求库', '取消'],
            defaultId: 0,
            cancelId: 1,
            message: '所选目录尚未创建 ClawPM 需求库。',
            detail: `将在 ${vaultPathForProject(projectPath)} 创建需求库文件。`,
        });
        if (confirmation.response !== 0)
            return null;
        const snapshot = await createVault(projectPath);
        watchProjectVault(snapshot.projectPath);
        if (notifyRenderer)
            notifyProjectOpened(snapshot);
        return snapshot;
    }
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 720,
        frame: false,
        backgroundColor: '#f4f5f7',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    const developmentUrl = process.env.CLAWPM_DESKTOP_DEV_URL;
    if (developmentUrl) {
        void mainWindow.loadURL(developmentUrl)
            .then(() => writeDiagnostic(`[renderer] loaded ${developmentUrl}`))
            .catch(error => writeDiagnostic(`[renderer] unable to load ${developmentUrl}: ${error.message}`));
    }
    else {
        const entry = electron_1.app.isPackaged
            ? path_1.default.join(process.resourcesPath, 'web', 'index.html')
            : path_1.default.resolve(__dirname, '../../web/dist/index.html');
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
const hasSingleInstanceLock = electron_1.app.requestSingleInstanceLock();
if (!hasSingleInstanceLock)
    electron_1.app.quit();
electron_1.app.whenReady().then(() => {
    electron_1.ipcMain.handle('project:choose', () => chooseProject(true));
    electron_1.ipcMain.handle('project:create', async (_event, projectPath) => {
        const snapshot = await createVault(projectPath);
        watchProjectVault(snapshot.projectPath);
        return snapshot;
    });
    electron_1.ipcMain.handle('project:open', async (_event, projectPath) => openProject(projectPath));
    electron_1.ipcMain.handle('project:recent', () => readRecents());
    electron_1.ipcMain.handle('window:minimize', () => mainWindow?.minimize());
    electron_1.ipcMain.handle('window:toggle-maximize', () => {
        if (!mainWindow)
            return false;
        if (mainWindow.isMaximized())
            mainWindow.unmaximize();
        else
            mainWindow.maximize();
        return mainWindow.isMaximized();
    });
    electron_1.ipcMain.handle('window:close', () => mainWindow?.close());
    electron_1.ipcMain.handle('vault:write', async (_event, projectPath, files) => {
        const snapshot = await readSnapshot(projectPath);
        for (const file of files) {
            const relative = safeRelativePath(file.path);
            await atomicWrite(path_1.default.join(snapshot.path, relative), file.content);
        }
    });
    createWindow();
});
electron_1.app.on('window-all-closed', () => electron_1.app.quit());
electron_1.app.on('before-quit', clearVaultWatcher);
//# sourceMappingURL=main.js.map
