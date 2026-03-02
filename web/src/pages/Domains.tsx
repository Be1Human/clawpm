import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';

const PRESET_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981',
  '#f59e0b', '#f97316', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#84cc16', '#64748b',
];

function DomainModal({ domain, onClose }: { domain?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!domain;

  const [form, setForm] = useState({
    name: domain?.name || '',
    task_prefix: domain?.task_prefix || domain?.taskPrefix || '',
    color: domain?.color || PRESET_COLORS[0],
    keywords: (domain?.keywords ? (typeof domain.keywords === 'string' ? JSON.parse(domain.keywords) : domain.keywords) : []).join(', '),
  });

  const createMut = useMutation({
    mutationFn: () => api.createDomain({
      name: form.name,
      task_prefix: form.task_prefix,
      color: form.color,
      keywords: form.keywords.split(',').map((k: string) => k.trim()).filter(Boolean),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['domains'] }); onClose(); },
  });

  const updateMut = useMutation({
    mutationFn: () => api.updateDomain(domain!.id, {
      name: form.name,
      task_prefix: form.task_prefix,
      color: form.color,
      keywords: form.keywords.split(',').map((k: string) => k.trim()).filter(Boolean),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['domains'] }); onClose(); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.task_prefix) return;
    isEdit ? updateMut.mutate() : createMut.mutate();
  }

  const pending = createMut.isPending || updateMut.isPending;
  const error = createMut.error || updateMut.error;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? '编辑业务板块' : '新建业务板块'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: form.color }}
            >
              {form.task_prefix.slice(0, 4) || '?'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map(c => (
                <button
                  key={c} type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={cn('w-6 h-6 rounded-full border-2 transition-all',
                    form.color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">板块名称 *</label>
              <input
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="如：frontend"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">任务前缀 *</label>
              <input
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors"
                value={form.task_prefix}
                onChange={e => setForm(f => ({ ...f, task_prefix: e.target.value }))}
                placeholder="如：FE、前端、Auth"
                required
              />
              <p className="text-[11px] text-gray-400 mt-1">{isEdit ? '修改后已有任务编号会同步更新' : '中英文均可，用于任务编号如 前端-001'}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">关键词（逗号分隔）</label>
            <input
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition-colors"
              value={form.keywords}
              onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))}
              placeholder="ui, page, component"
            />
            <p className="text-[11px] text-gray-400 mt-1">用于自动归类任务到该板块</p>
          </div>

          {error && <p className="text-sm text-red-500">{(error as Error).message}</p>}

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
            <button type="submit" disabled={pending} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {pending ? '保存中...' : isEdit ? '保存更改' : '创建板块'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DomainCard({ domain, taskCount, onEdit, onDelete }: { domain: any; taskCount: number; onEdit: () => void; onDelete: () => void }) {
  const keywords: string[] = typeof domain.keywords === 'string' ? JSON.parse(domain.keywords || '[]') : (domain.keywords || []);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 group hover:border-gray-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: domain.color }}
          >
            {(domain.taskPrefix || domain.task_prefix || '?').slice(0, 4)}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{domain.name}</h3>
            <p className="text-xs text-gray-400">{domain.taskPrefix || domain.task_prefix}-xxx</p>
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 text-xs transition-colors" title="编辑">✎</button>
          <button onClick={onDelete} className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 text-xs transition-colors" title="删除">✕</button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {keywords.length > 0 ? keywords.map(k => (
            <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{k}</span>
          )) : (
            <span className="text-[11px] text-gray-400">未设关键词</span>
          )}
        </div>
        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{taskCount} 个任务</span>
      </div>
    </div>
  );
}

export default function Domains() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editDomain, setEditDomain] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: () => api.getDomains(),
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.getTasks(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteDomain(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['domains'] }); qc.invalidateQueries({ queryKey: ['tasks'] }); setDeleteConfirm(null); },
  });

  function taskCountForDomain(domainId: number) {
    return (allTasks as any[]).filter((t: any) => t.domainId === domainId || t.domain_id === domainId).length;
  }

  const totalTasks = (allTasks as any[]).length;
  const assignedTasks = (allTasks as any[]).filter((t: any) => t.domainId || t.domain_id).length;

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      {/* 头部 */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">业务板块</h1>
          <p className="text-sm text-gray-500 mt-0.5">管理项目的业务域，每个板块拥有独立的任务编号前缀</p>
        </div>
        <button
          onClick={() => { setEditDomain(null); setShowModal(true); }}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
        >
          + 新建板块
        </button>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: '板块数量', value: (domains as any[]).length },
          { label: '总任务数', value: totalTasks },
          { label: '未分配板块', value: totalTasks - assignedTasks },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* 板块列表 */}
      {isLoading ? (
        <div className="text-gray-400 text-sm py-8 text-center">加载中...</div>
      ) : (domains as any[]).length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-sm">暂无业务板块，点击右上角"新建板块"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(domains as any[]).map((d: any) => (
            <DomainCard
              key={d.id}
              domain={d}
              taskCount={taskCountForDomain(d.id)}
              onEdit={() => { setEditDomain(d); setShowModal(true); }}
              onDelete={() => setDeleteConfirm(d)}
            />
          ))}
        </div>
      )}

      {/* 弹窗 */}
      {showModal && (
        <DomainModal domain={editDomain} onClose={() => { setShowModal(false); setEditDomain(null); }} />
      )}

      {/* 删除确认 */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">确认删除</h3>
            <p className="text-sm text-gray-500 mb-4">
              删除板块 <span className="text-gray-800 font-medium">{deleteConfirm.name}</span>？
              该板块下的任务不会被删除，但会取消板块归属。
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
