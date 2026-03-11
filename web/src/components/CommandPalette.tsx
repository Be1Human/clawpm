import { useEffect, useState, useCallback } from 'react';
import { Command } from 'cmdk';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, setActiveProject } from '../api/client';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-for-search'],
    queryFn: () => api.getTasks(),
    enabled: open,
    staleTime: 10_000,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
    enabled: open,
  });

  // Reset search on close
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  // Escape 关闭面板
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const runAction = useCallback((action: () => void) => {
    action();
    onClose();
  }, [onClose]);

  // Filter tasks by search
  const filteredTasks = search.length >= 1
    ? (tasks as any[]).filter((t: any) => {
        const q = search.toLowerCase();
        return t.title?.toLowerCase().includes(q) || t.taskId?.toLowerCase().includes(q);
      }).slice(0, 10)
    : [];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="flex items-start justify-center pt-[20vh]">
        <div
          className="relative w-[560px] bg-white rounded-xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-gray-400 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
            <div className="flex items-center border-b border-gray-200 px-4">
              <svg className="w-4 h-4 text-gray-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" strokeLinecap="round" />
              </svg>
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="搜索任务、跳转页面..."
                className="flex-1 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
                autoFocus
              />
              <kbd className="text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">ESC</kbd>
            </div>

            <Command.List className="max-h-[360px] overflow-y-auto p-2">
              <Command.Empty className="text-sm text-gray-500 text-center py-6">
                无匹配结果
              </Command.Empty>

              {/* 任务搜索结果 */}
              {filteredTasks.length > 0 && (
                <Command.Group heading="任务">
                  {filteredTasks.map((t: any) => (
                    <Command.Item
                      key={t.taskId}
                      onSelect={() => runAction(() => navigate(`/tasks/${t.taskId}`))}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 cursor-pointer data-[selected=true]:bg-indigo-50 data-[selected=true]:text-indigo-700"
                    >
                      <span className="text-xs text-gray-400 font-mono w-14 flex-shrink-0">{t.taskId}</span>
                      <span className="truncate">{t.title}</span>
                      <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
                        t.status === 'done' ? 'bg-green-100 text-green-700' :
                        t.status === 'active' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>{t.status}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* 导航 */}
              <Command.Group heading="导航">
                {[
                  { label: '项目仪表盘', to: '/dashboard' },
                  { label: '任务列表', to: '/tasks' },
                  { label: '看板', to: '/board' },
                  { label: '需求树', to: '/requirements' },
                  { label: '思维导图', to: '/mindmap' },
                  { label: '甘特图', to: '/gantt' },
                  { label: '迭代管理', to: '/iterations' },
                  { label: '归档箱', to: '/archive' },
                  { label: '需求池', to: '/backlog' },
                  { label: '里程碑', to: '/milestones' },
                  { label: '我的仪表盘', to: '/my/dashboard' },
                  { label: '我的任务', to: '/my/tasks/list' },
                ].map(nav => (
                  <Command.Item
                    key={nav.to}
                    onSelect={() => runAction(() => navigate(nav.to))}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 cursor-pointer data-[selected=true]:bg-indigo-50 data-[selected=true]:text-indigo-700"
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {nav.label}
                  </Command.Item>
                ))}
              </Command.Group>

              {/* 快捷操作 */}
              <Command.Group heading="操作">
                <Command.Item
                  onSelect={() => runAction(() => {
                    navigate('/tasks');
                    // createTask modal will be triggered from TaskList
                  })}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 cursor-pointer data-[selected=true]:bg-indigo-50 data-[selected=true]:text-indigo-700"
                >
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                  创建新任务
                </Command.Item>
                {/* 项目切换 */}
                {(projects as any[]).map((p: any) => (
                  <Command.Item
                    key={p.slug}
                    onSelect={() => runAction(() => {
                      setActiveProject(p.slug);
                      navigate('/dashboard');
                    })}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-700 cursor-pointer data-[selected=true]:bg-indigo-50 data-[selected=true]:text-indigo-700"
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                    </svg>
                    切换到: {p.name}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </div>
      </div>
    </div>
  );
}
