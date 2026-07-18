import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('clawpm', {
  chooseProject: () => ipcRenderer.invoke('project:choose'),
  createProject: (projectPath: string) => ipcRenderer.invoke('project:create', projectPath),
  openProject: (projectPath: string) => ipcRenderer.invoke('project:open', projectPath),
  recentProjects: () => ipcRenderer.invoke('project:recent'),
  writeVaultFiles: (projectPath: string, files: Array<{ path: string; content: string }>) =>
    ipcRenderer.invoke('vault:write', projectPath, files),
});
