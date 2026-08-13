"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const skill_injection_1 = require("./skill-injection");
// Some Windows systems create the BrowserWindow but fail to paint its GPU surface.
electron_1.app.disableHardwareAcceleration();
const VAULT_FORMAT = 'clawpm-vault@1';
const SUPPORTED_VAULT_FORMATS = new Set([VAULT_FORMAT, 'clawpm-vault@2']);
const VAULT_DIRECTORY = '.clawpm';
const ROOT_FILES = ['clawpm.json', 'domains.json', 'milestones.json', 'fields.json', 'links.json', 'people.json', 'AGENTS.md'];
const RECENTS_FILE = 'recent-projects.json';
const AGENTS_FILE = 'AGENTS.md';
function buildAgentSkillDoc(vaultName) {
    return [
        '<!-- clawpm:vault-agent:start -->',
        '# ClawPM Vault Agent 约束',
        '',
        `当前 Vault 属于“${vaultName}”。业务数据只允许写入本项目 .clawpm，并随 Git 提交。`,
        '',
        '## 强制流程',
        '',
        '1. 使用项目 Skill：`.agents/skills/clawpm-project-workflow/SKILL.md`。',
        '2. 修改前读取 clawpm.json、domains.json、milestones.json、people.json、links.json 和相关任务文件。',
        '3. 修改前执行 `git status --short -- .clawpm` 与 `git diff -- .clawpm`；同一任务存在并行修改时停止。',
        '4. 先按“结果目标 → 阶段/问题 → 可独立验证叶子”递归拆解，只领取叶子任务。',
        '5. 工作必须经历：拆分/创建 → 领取 → 执行 → 测试 → Gate 验收。',
        '6. `workflow.statuses[].id` 是唯一合法状态来源，禁止直接把任务改成 done。',
        '',
        '## 项目边界',
        '',
        '- 不使用 Server、SQLite、HTTP API、端口或 token；`.clawpm` 本身就是事实源。',
        '- 每个任务使用 `tasks/<TASK-ID>.json` 的 `clawpm-task@2` 单任务格式。',
        '- 领域和依赖不能代替父子分解；禁止创建一批全部 `parent: null` 的平铺大任务。',
        '- 完成前必须有验收标准、通过的测试、交付证据，且依赖和子任务均已完成。',
        '',
        '<!-- clawpm:vault-agent:end -->',
    ].join('\n');
}
function buildRootAgentSection() {
    return [
        '<!-- clawpm:project-agent:start -->',
        '## ClawPM 项目工作流',
        '',
        '- 开始项目任务前先读取 `.clawpm/AGENTS.md`。',
        '- 规划、拆分、创建、领取、推进、测试或验收任务时，使用 `.agents/skills/clawpm-project-workflow/SKILL.md`。',
        '- `.clawpm` 是任务事实源；不要建立平行的需求文档、数据库或服务端。',
        '',
        '<!-- clawpm:project-agent:end -->',
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
function skillBackupRoot() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'skill-backups');
}
function skillInstallationManifestPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'skill-installations', `${skill_injection_1.AGENT_SKILL}.json`);
}
function globalAgentInstructionsPath() {
    return path_1.default.join(electron_1.app.getPath('home'), '.codex', AGENTS_FILE);
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
async function readTextIfExists(target) {
    try {
        return await promises_1.default.readFile(target, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return '';
        throw error;
    }
}
function upsertManagedSection(current, section, startMarker, endMarker) {
    const start = current.indexOf(startMarker);
    const end = current.indexOf(endMarker);
    if (start >= 0 && end >= start) {
        const after = end + endMarker.length;
        return `${current.slice(0, start).trimEnd()}${current.slice(0, start).trim() ? '\n\n' : ''}${section}${current.slice(after).trim() ? `\n\n${current.slice(after).trimStart()}` : '\n'}`;
    }
    return `${current.trimEnd()}${current.trim() ? '\n\n' : ''}${section}\n`;
}
function migrateLegacyVaultAgentDocument(current) {
    const managed = current.includes('<!-- clawpm:vault-agent:start -->');
    const legacy = current.includes('# ClawPM 项目 Agent 操作规范')
        && current.includes('任务是扁平 JSON 记录')
        && current.includes('tasks/<CODE>.json');
    return !managed && legacy ? '' : current;
}
async function syncAgentSkill(projectPath) {
    const absoluteProject = path_1.default.resolve(projectPath);
    const vaultPath = vaultPathForProject(absoluteProject);
    const { name } = await validateVault(vaultPath);
    const injection = await (0, skill_injection_1.injectSkill)({
        appPath: electron_1.app.getAppPath(),
        homePath: electron_1.app.getPath('home'),
        projectPath: absoluteProject,
        backupRoot: skillBackupRoot(),
        platform: 'codex',
        scope: 'project',
    });
    const installed = injection.files.map(target => path_1.default.relative(absoluteProject, target).replace(/\\/g, '/'));
    const vaultAgentsPath = path_1.default.join(vaultPath, AGENTS_FILE);
    const existingVaultAgents = migrateLegacyVaultAgentDocument(await readTextIfExists(vaultAgentsPath));
    const vaultAgents = upsertManagedSection(existingVaultAgents, buildAgentSkillDoc(name), '<!-- clawpm:vault-agent:start -->', '<!-- clawpm:vault-agent:end -->');
    await atomicWrite(vaultAgentsPath, vaultAgents);
    installed.push('.clawpm/AGENTS.md');
    const rootAgentsPath = path_1.default.join(absoluteProject, AGENTS_FILE);
    const rootAgents = upsertManagedSection(await readTextIfExists(rootAgentsPath), buildRootAgentSection(), '<!-- clawpm:project-agent:start -->', '<!-- clawpm:project-agent:end -->');
    await atomicWrite(rootAgentsPath, rootAgents);
    installed.push('AGENTS.md');
    return { ok: true, files: installed };
}
async function skillInjectionTargets(projectPath) {
    const absoluteProject = projectPath ? path_1.default.resolve(projectPath) : null;
    if (absoluteProject)
        await validateVault(vaultPathForProject(absoluteProject));
    return (0, skill_injection_1.listTargets)({
        appPath: electron_1.app.getAppPath(),
        homePath: electron_1.app.getPath('home'),
        projectPath: absoluteProject,
    });
}
async function injectAgentSkill(request) {
    if (!request || typeof request !== 'object')
        throw new Error('Skill 注入参数无效。');
    const projectPath = typeof request.projectPath === 'string' && request.projectPath.trim()
        ? path_1.default.resolve(request.projectPath)
        : null;
    if (request.scope === 'project') {
        if (!projectPath)
            throw new Error('注入项目级 Skill 前必须打开 ClawPM 项目。');
        await validateVault(vaultPathForProject(projectPath));
    }
    return (0, skill_injection_1.injectSkill)({
        appPath: electron_1.app.getAppPath(),
        homePath: electron_1.app.getPath('home'),
        projectPath,
        backupRoot: skillBackupRoot(),
        platform: request.platform,
        scope: request.scope,
    });
}
async function installRecommendedAgentSkill(projectPath) {
    const installed = await (0, skill_injection_1.installRecommended)({
        appPath: electron_1.app.getAppPath(),
        appVersion: electron_1.app.getVersion(),
        homePath: electron_1.app.getPath('home'),
        projectPath: null,
        backupRoot: skillBackupRoot(),
        globalAgentsPath: globalAgentInstructionsPath(),
        manifestPath: skillInstallationManifestPath(),
    });
    const project = typeof projectPath === 'string' && projectPath.trim()
        ? await syncAgentSkill(projectPath)
        : { files: [] };
    return { ...installed, projectFiles: project.files };
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
    if (!SUPPORTED_VAULT_FORMATS.has(config.format)) {
        throw new Error(`不是有效需求库：clawpm.json 的 format 必须为 ${[...SUPPORTED_VAULT_FORMATS].join(' 或 ')}`);
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
            version: 2,
            statuses: [
                { id: 'backlog', label: '待规划', kanban: 'backlog' },
                { id: 'planned', label: '已计划', kanban: 'planned' },
                { id: 'active', label: '进行中', kanban: 'active' },
                { id: 'review', label: '待评审', kanban: 'review' },
                { id: 'done', label: '已完成', kanban: 'done' },
            ],
            transitions: [
                { from: 'backlog', to: 'planned' },
                { from: 'planned', to: 'backlog' },
                { from: 'planned', to: 'active' },
                { from: 'active', to: 'planned' },
                { from: 'active', to: 'review' },
                { from: 'review', to: 'active' },
                { from: 'review', to: 'done' },
                { from: 'done', to: 'active' },
            ],
            gates: {
                done: ['acceptance', 'blocker', 'dependencies', 'children', 'verification', 'evidence'],
            },
            agents: {
                claimLeaseMinutes: 120,
            },
        },
    }, null, 2)}\n`);
    await atomicWrite(path_1.default.join(vaultPath, 'domains.json'), '{\n  "format": "clawpm-domains@1",\n  "domains": []\n}\n');
    await atomicWrite(path_1.default.join(vaultPath, 'milestones.json'), '{\n  "format": "clawpm-milestones@1",\n  "milestones": []\n}\n');
    await atomicWrite(path_1.default.join(vaultPath, 'fields.json'), '{\n  "format": "clawpm-fields@1",\n  "fields": []\n}\n');
    await atomicWrite(path_1.default.join(vaultPath, 'links.json'), '{\n  "format": "clawpm-links@1",\n  "links": []\n}\n');
    await atomicWrite(path_1.default.join(vaultPath, 'people.json'), '{\n  "format": "clawpm-people@1",\n  "people": []\n}\n');
    await syncAgentSkill(absoluteProject);
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
            : path_1.default.resolve(__dirname, '../../../web/dist/index.html');
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
    electron_1.ipcMain.handle('agent-skill:sync', async (_event, projectPath) => syncAgentSkill(projectPath));
    electron_1.ipcMain.handle('skill-injection:targets', async (_event, projectPath) => skillInjectionTargets(projectPath));
    electron_1.ipcMain.handle('skill-injection:inject', async (_event, request) => injectAgentSkill(request));
    electron_1.ipcMain.handle('skill-injection:install-recommended', async (_event, projectPath) => installRecommendedAgentSkill(projectPath));
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
