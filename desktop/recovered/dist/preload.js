"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('clawpm', {
    chooseProject: () => electron_1.ipcRenderer.invoke('project:choose'),
    createProject: (projectPath) => electron_1.ipcRenderer.invoke('project:create', projectPath),
    openProject: (projectPath) => electron_1.ipcRenderer.invoke('project:open', projectPath),
    recentProjects: () => electron_1.ipcRenderer.invoke('project:recent'),
    syncAgentSkill: (projectPath) => electron_1.ipcRenderer.invoke('agent-skill:sync', projectPath),
    getSkillInjectionTargets: (projectPath) => electron_1.ipcRenderer.invoke('skill-injection:targets', projectPath),
    injectSkill: (request) => electron_1.ipcRenderer.invoke('skill-injection:inject', request),
    installRecommendedSkill: (projectPath) => electron_1.ipcRenderer.invoke('skill-injection:install-recommended', projectPath),
    onProjectOpened: (callback) => {
        const listener = (_event, snapshot) => callback(snapshot);
        electron_1.ipcRenderer.on('project:opened', listener);
        return () => electron_1.ipcRenderer.removeListener('project:opened', listener);
    },
    onVaultChanged: (callback) => {
        const listener = (_event, snapshot) => callback(snapshot);
        electron_1.ipcRenderer.on('vault:changed', listener);
        return () => electron_1.ipcRenderer.removeListener('vault:changed', listener);
    },
    minimizeWindow: () => electron_1.ipcRenderer.invoke('window:minimize'),
    toggleMaximizeWindow: () => electron_1.ipcRenderer.invoke('window:toggle-maximize'),
    closeWindow: () => electron_1.ipcRenderer.invoke('window:close'),
    writeVaultFiles: (projectPath, files) => electron_1.ipcRenderer.invoke('vault:write', projectPath, files),
});
//# sourceMappingURL=preload.js.map
