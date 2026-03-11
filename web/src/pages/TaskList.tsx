import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { useFilters, applyFilters } from '@/lib/useFilters';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { formatDate, getDaysUntil, cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import CreateTaskModal from '@/components/CreateTaskModal';
import FilterBar from '@/components/FilterBar';
import BatchActionBar from '@/components/BatchActionBar';

const LABEL_COLORS: Record<string, { bg: string; text: string }> = {
  epic:    { bg: '#ede9fe', text: '#7c3aed' },
  feature: { bg: '#dbeafe', text: '#1d4ed8' },
  bug:     { bg: '#fee2e2', text: '#b91c1c' },
  spike:   { bg: '#ffedd5', text: '#c2410c' },
  chore:   { bg: '#f1f5f9', text: '#475569' },
};

function getLabels(task: any): string[] {
  try { return JSON.parse(task.labels || '[]'); } catch { return []; }
}

export default function TaskList() {
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const activeProject = useActiveProject();

  const filterHook = useFilters('task-list');

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', activeProject],
    queryFn: () => api.getTasks(),
  });

  // Apply filters client-side
  const filtered = applyFilters(tasks as any[], filterHook.filters);

  // Batch selection
  const toggleSelect = useCallback((taskId: string, shiftKey: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((t: any) => t.taskId)));
    }
  }, [selectedIds.size, filtered]);

  return (
    <div className="p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">节点列表</h1>
          <p className="text-sm text-slate-500 mt-0.5">{filtered.length} / {(tasks as any[]).length} 个节点</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">+ 新建节点</button>
      </div>

      {/* 统一筛选栏 */}
      <div className="mb-5">
        <FilterBar {...filterHook} />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="px-2 py-3 w-8">
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && selectedIds.size === filtered.length}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-500"
                />
              </th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">{t('taskList.thId')}</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium">{t('taskList.thTitle')}</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-20">{t('taskList.thLabel')}</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">{t('taskList.thStatus')}</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-16">{t('taskList.thPriority')}</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">{t('taskList.thDomain')}</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">{t('taskList.thOwner')}</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-28">{t('taskList.thProgress')}</th>
              <th className="text-left px-4 py-3 text-xs text-slate-500 font-medium w-24">{t('taskList.thDueDate')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-800/50">
                  <td colSpan={10} className="px-4 py-3"><div className="h-4 bg-slate-800 rounded animate-pulse" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-12 text-slate-600">没有节点</td></tr>
            ) : (
              filtered.map((task: any) => {
                const days = getDaysUntil(task.dueDate);
                const isOverdue = days !== null && days < 0;
                const labels = getLabels(task);
                const isSelected = selectedIds.has(task.taskId);
                return (
                  <tr key={task.id} className={cn(
                    'border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors',
                    isSelected && 'bg-indigo-900/20'
                  )}>
                    <td className="px-2 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => toggleSelect(task.taskId, e.nativeEvent instanceof MouseEvent && (e.nativeEvent as MouseEvent).shiftKey)}
                        className="rounded border-gray-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/tasks/${task.taskId}`} className="font-mono text-xs text-slate-500 hover:text-brand-400">{task.taskId}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/tasks/${task.taskId}`} className="text-slate-200 hover:text-brand-400 line-clamp-1">{task.title}</Link>
                      {task.blocker && <div className="text-xs text-red-400 mt-0.5 truncate">! {task.blocker}</div>}
                    </td>
                    <td className="px-4 py-3">
                      {labels.slice(0, 1).map(l => {
                        const c = LABEL_COLORS[l] || { bg: '#f1f5f9', text: '#475569' };
                        return (
                          <span key={l} className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: c.bg, color: c.text }}>{l}</span>
                        );
                      })}
                      {labels.length === 0 && <span className="text-slate-700">-</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={task.status} /></td>
                    <td className="px-4 py-3"><PriorityBadge priority={task.priority} /></td>
                    <td className="px-4 py-3">
                      {task.domain ? (
                        <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${task.domain.color}20`, color: task.domain.color }}>
                          {task.domain.name}
                        </span>
                      ) : <span className="text-slate-700">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {task.owner ? (
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-brand-500/30 flex items-center justify-center text-xs text-brand-400">{task.owner[0].toUpperCase()}</span>
                          <span className="text-xs text-slate-400">{task.owner}</span>
                        </div>
                      ) : <span className="text-slate-700">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${task.progress}%` }} />
                        </div>
                        <span className="text-xs text-slate-600 w-7">{task.progress}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs', isOverdue ? 'text-red-400' : 'text-slate-500')}>
                        {task.dueDate ? formatDate(task.dueDate) : '-'}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 批量操作栏 */}
      <BatchActionBar
        selectedTaskIds={Array.from(selectedIds)}
        onClear={() => setSelectedIds(new Set())}
      />

      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
