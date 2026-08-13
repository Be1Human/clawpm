import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, FolderOpen, Minus, Square, X } from 'lucide-react';
import { chooseVault } from '@/vault/session';
import { isElectronRuntime } from '@/vault/desktop';

export default function DesktopTitleBar() {
  const navigate = useNavigate();
  const [fileOpen, setFileOpen] = useState(false);
  if (!isElectronRuntime()) return null;

  async function openOrInitialize() {
    setFileOpen(false);
    await chooseVault();
  }

  function openSkillInstallation() {
    setFileOpen(false);
    navigate('/skill-injection');
  }

  return (
    <header className="desktop-titlebar flex h-8 shrink-0 items-center border-b border-gray-200 bg-white text-gray-700">
      <span className="px-3 text-xs font-semibold">ClawPM</span>
      <div className="relative h-full">
        <button type="button" onClick={() => setFileOpen(value => !value)} className="h-full px-3 text-xs hover:bg-gray-100">
          File
        </button>
        {fileOpen && (
          <div className="desktop-titlebar-menu absolute left-0 top-8 z-50 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <button type="button" onClick={() => void openOrInitialize()} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
              <FolderOpen size={15} />
              打开或初始化项目...
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button type="button" onClick={openSkillInstallation} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-indigo-700 hover:bg-indigo-50">
              <Bot size={15} />
              安装 / 查看 Agent Skill...
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button type="button" onClick={() => void window.clawpm?.closeWindow()} className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
              退出
            </button>
          </div>
        )}
      </div>
      <div className="ml-auto flex h-full">
        <button type="button" title="最小化" onClick={() => void window.clawpm?.minimizeWindow()} className="desktop-window-control px-3 hover:bg-gray-100"><Minus size={15} /></button>
        <button type="button" title="最大化" onClick={() => void window.clawpm?.toggleMaximizeWindow()} className="desktop-window-control px-3 hover:bg-gray-100"><Square size={13} /></button>
        <button type="button" title="关闭" onClick={() => void window.clawpm?.closeWindow()} className="desktop-window-control px-3 hover:bg-rose-600 hover:text-white"><X size={16} /></button>
      </div>
    </header>
  );
}
