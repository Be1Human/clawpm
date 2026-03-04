import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  active:    { label: '进行中', dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
  completed: { label: '已完成', dot: 'bg-green-500', bg: 'bg-green-50', text: 'text-green-700' },
  archived:  { label: '已归档', dot: 'bg-gray-400', bg: 'bg-gray-100', text: 'text-gray-500' },
};

function MilestoneModal({ milestone, onClose }: { milestone?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!milestone;

  const [form, setForm] = useState({
    name: milestone?.name || '',
    target_date: milestone?.targetDate || milestone?.target_date || '',
    description: milestone?.description || '',
    status: milestone?.status || 'active',
  });

  const createMut = useMutation({
    mutationFn: () => api.createMilestone({ name: form.name, target_date: form.target_date || undefined, description: form.description || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['milestones'] }); onClose(); },
  });

  const updateMut = useMutation({
    mutationFn: () => api.updateMilestone(milestone!.id, {
      name: form.name,
      target_date: form.target_date || null,
      description: form.description || null,
      status: form.status,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['milestones'] }); onClose(); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    isEdit ? updateMut.mutate() : createMut.mutate();
  }

  const pending = createMut.isPending || updateMut.isPending;
  const error = createMut.error || updateMut.error;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? '编辑里程碑' : '新建里程碑'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">名称 *</label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="如：v1.0-MVP"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">目标日期</label>
              <input
                type="date"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors"
                value={form.target_date}
                onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))}
              />
            </div>
            {isEdit && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">状态</label>
                <select
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors"
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                >
                  <option value="active">进行中</option>
                  <option value="completed">已完成</option>
                  <option value="archived">已归档</option>
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">描述</label>
            <textarea
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors min-h-[60px] resize-none"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="里程碑的目标和范围..."
            />
          </div>

          {error && <p className="text-sm text-red-500">{(error as Error).message}</p>}

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
            <button type="submit" disabled={pending} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {pending ? '保存中...' : isEdit ? '保存更改' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MilestoneCard({ m, onEdit, onDelete }: { m: any; onEdit: () => void; onDelete: () => void }) {
  const qc = useQueryClient();
  const sc = STATUS_CONFIG[m.status] || STATUS_CONFIG.active;

  const daysLeft = m.targetDate
    ? Math.floor((new Date(m.targetDate).getTime() - Date.now()) / 86400000)
    : null;

  const toggleMut = useMutation({
    mutationFn: () => {
      const next = m.status === 'active' ? 'completed' : 'active';
      return api.updateMilestone(m.id, { status: next });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['milestones'] }),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 group hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{m.name}</h3>
            <span className={cn('inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium', sc.bg, sc.text)}>
              <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
              {sc.label}
            </span>
          </div>
          {m.description && <p className="text-xs text-gray-500 line-clamp-2 mt-1">{m.description}</p>}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0">
          <button
            onClick={() => toggleMut.mutate()}
            className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-green-600 hover:bg-green-50 text-xs transition-colors"
            title={m.status === 'active' ? '标记完成' : '恢复进行中'}
          >
            {m.status === 'active' ? '✓' : '↺'}
          </button>
          <button onClick={onEdit} className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xs transition-colors" title="编辑">✎</button>
          <button onClick={onDelete} className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 text-xs transition-colors" title="删除">✕</button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1.5">
          <span>{m.doneCount ?? 0}/{m.taskCount ?? 0} 任务完成</span>
          <span className="font-medium text-gray-700">{m.progress ?? 0}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500',
              (m.progress ?? 0) === 100 ? 'bg-green-500' : 'bg-indigo-500')}
            style={{ width: `${m.progress ?? 0}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">
          {m.targetDate
            ? `目标: ${new Date(m.targetDate).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })}`
            : '未设置目标日期'}
        </span>
        {daysLeft !== null && (
          <span className={cn('font-medium',
            daysLeft < 0 ? 'text-red-500' : daysLeft <= 7 ? 'text-amber-500' : 'text-gray-500'
          )}>
            {daysLeft < 0 ? `逾期 ${Math.abs(daysLeft)} 天` : daysLeft === 0 ? '今天到期' : `剩余 ${daysLeft} 天`}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Milestones() {
  const qc = useQueryClient();
  const activeProject = useActiveProject();
  const [showModal, setShowModal] = useState(false);
  const [editMs, setEditMs] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const { data: milestones = [], isLoading } = useQuery({
    queryKey: ['milestones', activeProject],
    queryFn: api.getMilestones,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteMilestone(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['milestones'] }); setDeleteConfirm(null); },
  });

  const filtered = statusFilter
    ? (milestones as any[]).filter((m: any) => m.status === statusFilter)
    : (milestones as any[]);

  const activeCount = (milestones as any[]).filter((m: any) => m.status === 'active').length;
  const completedCount = (milestones as any[]).filter((m: any) => m.status === 'completed').length;
  const overdueCount = (milestones as any[]).filter((m: any) => {
    if (!m.targetDate || m.status === 'completed' || m.status === 'archived') return false;
    return new Date(m.targetDate).getTime() < Date.now();
  }).length;

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      {/* 头部 */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">里程碑</h1>
          <p className="text-sm text-gray-500 mt-0.5">管理项目的关键节点和交付目标</p>
        </div>
        <button
          onClick={() => { setEditMs(null); setShowModal(true); }}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          + 新建里程碑
        </button>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: '全部', value: (milestones as any[]).length, color: 'text-gray-900' },
          { label: '进行中', value: activeCount, color: 'text-blue-600' },
          { label: '已完成', value: completedCount, color: 'text-green-600' },
          { label: '已逾期', value: overdueCount, color: 'text-red-500' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className={cn('text-2xl font-bold mt-0.5', stat.color)}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* 筛选 */}
      <div className="flex gap-2 mb-4">
        {[
          ['', '全部'],
          ['active', '进行中'],
          ['completed', '已完成'],
          ['archived', '已归档'],
        ].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setStatusFilter(val)}
            className={cn('px-4 py-1.5 rounded-lg text-sm transition-colors',
              statusFilter === val
                ? 'bg-indigo-600 text-white'
                : 'text-gray-500 hover:bg-gray-100')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      {isLoading ? (
        <div className="text-gray-400 text-sm py-8 text-center">加载中...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🎯</p>
          <p className="text-sm">{statusFilter ? '该状态下暂无里程碑' : '暂无里程碑，点击右上角创建'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((m: any) => (
            <MilestoneCard
              key={m.id}
              m={m}
              onEdit={() => { setEditMs(m); setShowModal(true); }}
              onDelete={() => setDeleteConfirm(m)}
            />
          ))}
        </div>
      )}

      {/* 弹窗 */}
      {showModal && (
        <MilestoneModal milestone={editMs} onClose={() => { setShowModal(false); setEditMs(null); }} />
      )}

      {/* 删除确认 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">确认删除</h3>
            <p className="text-sm text-gray-500 mb-4">
              删除里程碑 <span className="text-gray-800 font-medium">{deleteConfirm.name}</span>？
              关联的任务不会被删除，但会取消里程碑归属。
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
              <button
                onClick={() => deleteMut.mutate(deleteConfirm.id)}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm transition-colors"
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
