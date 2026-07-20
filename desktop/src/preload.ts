import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('clawpm', {
  chooseProject: () => ipcRenderer.invoke('project:choose'),
  createProject: (projectPath: string) => ipcRenderer.invoke('project:create', projectPath),
  openProject: (projectPath: string) => ipcRenderer.invoke('project:open', projectPath),
  recentProjects: () => ipcRenderer.invoke('project:recent'),
  onProjectOpened: (callback: (snapshot: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: unknown) => callback(snapshot);
    ipcRenderer.on('project:opened', listener);
    return () => ipcRenderer.removeListener('project:opened', listener);
  },
  onVaultChanged: (callback: (snapshot: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: unknown) => callback(snapshot);
    ipcRenderer.on('vault:changed', listener);
    return () => ipcRenderer.removeListener('vault:changed', listener);
  },
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  writeVaultFiles: (projectPath: string, files: Array<{ path: string; content: string }>) =>
    ipcRenderer.invoke('vault:write', projectPath, files),
});
