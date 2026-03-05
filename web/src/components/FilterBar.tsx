import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { FilterState, SavedView } from '../lib/useFilters';

interface FilterBarProps {
  filters: FilterState;
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  toggleSetValue: (key: 'status' | 'priority', value: string) => void;
  clearAll: () => void;
  savedViews: SavedView[];
  saveView: (name: string) => void;
  loadView: (view: SavedView) => void;
  deleteView: (name: string) => void;
  hasActiveFilters: boolean;
  /** 可用的筛选维度，不传则全部显示 */
  dimensions?: ('status' | 'priority' | 'owner' | 'milestone' | 'label' | 'date' | 'search')[];
}

const STATUS_OPTIONS = ['backlog', 'planned', 'active', 'review', 'done'];
const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];
const STATUS_LABELS: Record<string, string> = {
  backlog: '待规划', planned: '已规划', active: '进行中', review: '评审中', done: '已完成',
};

export default function FilterBar({
  filters, setFilter, toggleSetValue, clearAll,
  savedViews, saveView, loadView, deleteView,
  hasActiveFilters,
  dimensions,
}: FilterBarProps) {
  const [showViewSave, setShowViewSave] = useState(false);
  const [viewName, setViewName] = useState('');

  const show = (dim: string) => !dimensions || dimensions.includes(dim as any);

  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: () => api.getMembers() });
  const { data: milestones = [] } = useQuery({ queryKey: ['milestones'], queryFn: () => api.getMilestones() });

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {/* 搜索 */}
      {show('search') && (
        <input
          type="text"
          placeholder="搜索任务..."
          value={filters.search}
          onChange={e => setFilter('search', e.target.value)}
          className="px-2 py-1 rounded border border-gray-600 bg-gray-800 text-white w-44 focus:ring-1 focus:ring-indigo-500 outline-none"
        />
      )}

      {/* 状态 */}
      {show('status') && (
        <div className="flex items-center gap-1">
          <span className="text-gray-400 text-xs">状态:</span>
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => toggleSetValue('status', s)}
              className={`px-2 py-0.5 rounded text-xs ${
                filters.status.has(s)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>
      )}

      {/* 优先级 */}
      {show('priority') && (
        <div className="flex items-center gap-1">
          <span className="text-gray-400 text-xs">优先级:</span>
          {PRIORITY_OPTIONS.map(p => (
            <button
              key={p}
              onClick={() => toggleSetValue('priority', p)}
              className={`px-2 py-0.5 rounded text-xs ${
                filters.priority.has(p)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* 负责人 */}
      {show('owner') && (
        <select
          value={filters.owner}
          onChange={e => setFilter('owner', e.target.value)}
          className="px-2 py-1 rounded border border-gray-600 bg-gray-800 text-white text-xs"
        >
          <option value="">全部负责人</option>
          {members.map((m: any) => (
            <option key={m.identifier} value={m.identifier}>{m.name || m.identifier}</option>
          ))}
        </select>
      )}

      {/* 里程碑 */}
      {show('milestone') && (
        <select
          value={filters.milestone}
          onChange={e => setFilter('milestone', e.target.value)}
          className="px-2 py-1 rounded border border-gray-600 bg-gray-800 text-white text-xs"
        >
          <option value="">全部里程碑</option>
          {milestones.map((m: any) => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
        </select>
      )}

      {/* 标签 */}
      {show('label') && (
        <input
          type="text"
          placeholder="标签筛选"
          value={filters.label}
          onChange={e => setFilter('label', e.target.value)}
          className="px-2 py-1 rounded border border-gray-600 bg-gray-800 text-white w-24 text-xs"
        />
      )}

      {/* 日期范围 */}
      {show('date') && (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={e => setFilter('dateFrom', e.target.value)}
            className="px-1 py-0.5 rounded border border-gray-600 bg-gray-800 text-white text-xs"
          />
          <span className="text-gray-500">~</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={e => setFilter('dateTo', e.target.value)}
            className="px-1 py-0.5 rounded border border-gray-600 bg-gray-800 text-white text-xs"
          />
        </div>
      )}

      {/* 清除 & 视图管理 */}
      {hasActiveFilters && (
        <button onClick={clearAll} className="text-xs text-red-400 hover:text-red-300 ml-1">
          清除筛选
        </button>
      )}

      <div className="relative ml-auto flex items-center gap-1">
        {/* 已保存视图 */}
        {savedViews.length > 0 && (
          <select
            onChange={e => {
              const view = savedViews.find(v => v.name === e.target.value);
              if (view) loadView(view);
              e.target.value = '';
            }}
            className="px-2 py-1 rounded border border-gray-600 bg-gray-800 text-white text-xs"
            defaultValue=""
          >
            <option value="" disabled>加载视图</option>
            {savedViews.map(v => (
              <option key={v.name} value={v.name}>{v.name}</option>
            ))}
          </select>
        )}

        {/* 保存视图 */}
        {showViewSave ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              placeholder="视图名称"
              value={viewName}
              onChange={e => setViewName(e.target.value)}
              className="px-2 py-0.5 rounded border border-gray-600 bg-gray-800 text-white text-xs w-24"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && viewName.trim()) { saveView(viewName.trim()); setViewName(''); setShowViewSave(false); } }}
            />
            <button
              onClick={() => { if (viewName.trim()) { saveView(viewName.trim()); setViewName(''); setShowViewSave(false); } }}
              className="text-xs text-green-400 hover:text-green-300"
            >
              保存
            </button>
            <button onClick={() => setShowViewSave(false)} className="text-xs text-gray-400 hover:text-gray-300">取消</button>
          </div>
        ) : (
          <button onClick={() => setShowViewSave(true)} className="text-xs text-indigo-400 hover:text-indigo-300">
            保存视图
          </button>
        )}
      </div>
    </div>
  );
}
