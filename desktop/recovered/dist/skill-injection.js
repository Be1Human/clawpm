"use strict";

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const AGENT_SKILL = "clawpm-project-workflow";
const AGENT_SKILL_FILES = [
    "SKILL.md",
    "agents/openai.yaml",
    "references/vault-protocol.md",
];

const PLATFORM_DEFINITIONS = Object.freeze({
    claude: Object.freeze({
        id: "claude",
        name: "Claude Code",
        directory: ".claude",
        note: "个人 Skill 会覆盖同名项目 Skill；新建顶层 skills 目录后可能需要重启 Claude Code。",
    }),
    cursor: Object.freeze({
        id: "cursor",
        name: "Cursor",
        directory: ".cursor",
        note: "使用 Cursor 原生 Skill 目录，IDE 与 CLI 均可直接发现。",
    }),
    codex: Object.freeze({
        id: "codex",
        name: "Codex",
        directory: ".agents",
        note: "使用开放 Agent Skills 标准目录；如果当前会话未发现，请重启 Codex。",
    }),
    codebuddy: Object.freeze({
        id: "codebuddy",
        name: "CodeBuddy",
        directory: ".codebuddy",
        note: "同名 Skill 存在时，项目级配置优先于用户级配置。",
    }),
});

function assertPlatform(platform) {
    const definition = PLATFORM_DEFINITIONS[platform];
    if (!definition)
        throw new Error(`不支持的 Agent 平台：${platform}`);
    return definition;
}

function assertScope(scope) {
    if (scope !== "user" && scope !== "project")
        throw new Error(`不支持的 Skill 作用域：${scope}`);
    return scope;
}

function targetBasePath({ homePath, projectPath, platform, scope }) {
    const definition = assertPlatform(platform);
    assertScope(scope);
    if (scope === "project" && !projectPath)
        throw new Error("注入项目级 Skill 前必须打开 ClawPM 项目。");
    const root = scope === "user" ? homePath : projectPath;
    if (!root)
        throw new Error("无法确定 Skill 安装目录。");
    return path.resolve(root, definition.directory, "skills");
}

function resolveSkillTarget(options) {
    const basePath = targetBasePath(options);
    const targetPath = path.resolve(basePath, AGENT_SKILL);
    const relative = path.relative(basePath, targetPath);
    if (relative !== AGENT_SKILL || relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("Skill 安装目标超出允许目录。");
    return { basePath, targetPath };
}

function bundledSkillRoot(appPath) {
    return path.resolve(appPath, "skills", AGENT_SKILL);
}

async function pathKind(target) {
    try {
        const stat = await fs.lstat(target);
        if (stat.isSymbolicLink())
            return "symlink";
        if (stat.isDirectory())
            return "directory";
        if (stat.isFile())
            return "file";
        return "other";
    }
    catch (error) {
        if (error.code === "ENOENT")
            return "missing";
        throw error;
    }
}

async function readRegularFile(target) {
    const kind = await pathKind(target);
    if (kind !== "file")
        throw new Error(`Skill 文件不存在或不是普通文件：${target}`);
    return fs.readFile(target);
}

function digest(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
}

async function inspectTarget(sourceRoot, targetRoot) {
    let installedFileCount = 0;
    let matchingFileCount = 0;
    for (const relative of AGENT_SKILL_FILES) {
        const source = await readRegularFile(path.join(sourceRoot, relative));
        const targetPath = path.join(targetRoot, relative);
        if (await pathKind(targetPath) !== "file")
            continue;
        installedFileCount += 1;
        const target = await fs.readFile(targetPath);
        if (digest(source) === digest(target))
            matchingFileCount += 1;
    }
    const totalFileCount = AGENT_SKILL_FILES.length;
    const status = installedFileCount === 0
        ? "not_installed"
        : matchingFileCount === totalFileCount
            ? "current"
            : "update_available";
    return { status, installedFileCount, matchingFileCount, totalFileCount };
}

async function describeTarget(options) {
    const definition = assertPlatform(options.platform);
    const { targetPath } = resolveSkillTarget(options);
    const sourceRoot = bundledSkillRoot(options.appPath);
    const inspection = await inspectTarget(sourceRoot, targetPath);
    return {
        platform: definition.id,
        platformName: definition.name,
        scope: options.scope,
        path: targetPath,
        note: definition.note,
        ...inspection,
    };
}

async function listTargets(options) {
    const targets = [];
    for (const definition of Object.values(PLATFORM_DEFINITIONS)) {
        for (const scope of ["user", "project"]) {
            if (scope === "project" && !options.projectPath)
                continue;
            targets.push(await describeTarget({ ...options, platform: definition.id, scope }));
        }
    }
    return targets;
}

function backupStamp(now = new Date()) {
    return now.toISOString().replace(/[:.]/g, "-");
}

async function copyBundledFiles(sourceRoot, targetRoot) {
    for (const relative of AGENT_SKILL_FILES) {
        const content = await readRegularFile(path.join(sourceRoot, relative));
        const target = path.join(targetRoot, relative);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content);
    }
}

async function injectSkill(options) {
    const definition = assertPlatform(options.platform);
    assertScope(options.scope);
    const sourceRoot = bundledSkillRoot(options.appPath);
    const { basePath, targetPath } = resolveSkillTarget(options);
    for (const directory of [path.dirname(basePath), basePath]) {
        const kind = await pathKind(directory);
        if (kind === "symlink")
            throw new Error(`拒绝通过符号链接写入 Skill：${directory}`);
        if (kind !== "missing" && kind !== "directory")
            throw new Error(`Skill 父路径不是目录：${directory}`);
    }
    const targetKind = await pathKind(targetPath);
    if (targetKind === "symlink")
        throw new Error(`拒绝覆盖符号链接 Skill 目录：${targetPath}`);
    if (targetKind !== "missing" && targetKind !== "directory")
        throw new Error(`Skill 目标已被非目录文件占用：${targetPath}`);

    const currentTarget = await describeTarget(options);
    if (currentTarget.status === "current") {
        return {
            ok: true,
            changed: false,
            backupPath: null,
            target: currentTarget,
            files: AGENT_SKILL_FILES.map(relative => path.join(targetPath, relative)),
        };
    }

    await fs.mkdir(basePath, { recursive: true });
    const transactionId = `${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const stagingPath = path.join(basePath, `.${AGENT_SKILL}.clawpm-install-${transactionId}`);
    let backupPath = null;

    try {
        await copyBundledFiles(sourceRoot, stagingPath);
        if (targetKind === "directory") {
            backupPath = path.resolve(
                options.backupRoot,
                `${backupStamp()}-${transactionId}`,
                definition.id,
                options.scope,
                AGENT_SKILL,
            );
            await fs.mkdir(path.dirname(backupPath), { recursive: true });
            await fs.cp(targetPath, backupPath, { recursive: true, errorOnExist: true });
            await fs.rm(targetPath, { recursive: true, force: false });
        }
        await fs.rename(stagingPath, targetPath);
    }
    catch (error) {
        await fs.rm(stagingPath, { recursive: true, force: true }).catch(() => undefined);
        if (backupPath && await pathKind(targetPath) === "missing")
            await fs.cp(backupPath, targetPath, { recursive: true }).catch(() => undefined);
        throw error;
    }

    return {
        ok: true,
        changed: true,
        backupPath,
        target: await describeTarget(options),
        files: AGENT_SKILL_FILES.map(relative => path.join(targetPath, relative)),
    };
}

module.exports = {
    AGENT_SKILL,
    AGENT_SKILL_FILES,
    PLATFORM_DEFINITIONS,
    bundledSkillRoot,
    describeTarget,
    injectSkill,
    listTargets,
    resolveSkillTarget,
};
