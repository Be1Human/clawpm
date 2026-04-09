import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { cn } from '@/lib/utils';

const PRESET_LABELS = [
  { value: 'epic',    label: 'Epic',    color: '#8b5cf6', bg: '#ede9fe' },
  { value: 'feature', label: 'Feature', color: '#3b82f6', bg: '#dbeafe' },
  { value: 'bug',     label: 'Bug',     color: '#ef4444', bg: '#fee2e2' },
  { value: 'spike',   label: 'Spike',   color: '#f97316', bg: '#ffedd5' },
  { value: 'chore',   label: 'Chore',   color: '#64748b', bg: '#f1f5f9' },
];

interface Props {
  onClose: () => void;
  defaultParentId?: string;
  defaultDomain?: string;
  /** 创建成功后回调，传回创建的任务数据（含 taskId）和创建时的 payload，用于 undo/redo */
  onCreated?: (task: any, payload: Record<string, any>) => void;
}

export default function CreateTaskModal({ onClose, defaultParentId, defaultDomain, onCreated }: Props) {
  const qc = useQueryClient();
  const activeProject = useActiveProject();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const [showMore, setShowMore] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    labels: [] as string[],
    parent_task_id: defaultParentId || '',
    priority: 'P2',
    owner: '',
    due_date: '',
    domain: defaultDomain || '',
    milestone: '',
    customLabel: '',
    schedule_mode: 'once',
  });

  const { data: domains = [] } = useQuery({ queryKey: ['domains', activeProject], queryFn: api.getDomains });
  const { data: milestones = [] } = useQuery({ queryKey: ['milestones', activeProject], queryFn: api.getMilestones });
  const { data: members = [] } = useQuery({ queryKey: ['members', activeProject], queryFn: () => api.getMembers() });

  function toggleLabel(val: string) {
    setForm(f => ({
      ...f,
      labels: f.labels.includes(val) ? f.labels.filter(l => l !== val) : [...f.labels, val],
    }));
  }

  function addCustomLabel() {
    const v = form.customLabel.trim().toLowerCase();
    if (!v || form.labels.includes(v)) { setForm(f => ({ ...f, customLabel: '' })); return; }
    setForm(f => ({ ...f, labels: [...f.labels, v], customLabel: '' }));
  }

  const [errorMsg, setErrorMsg] = useState('');

  // 保存最近一次提交的 payload，供 onSuccess 回调使用
  const lastPayloadRef = useRef<Record<string, any>>({});

  const mut = useMutation({
    mutationFn: (data: any) => api.createTask(data),
    onSuccess: (createdTask: any) => {
      setErrorMsg('');
      // invalidate 所有与任务相关的查询（task-tree、task-tree-kanban、task-tree-req、tasks 等）
      qc.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0];
        return typeof key === 'string' && (key.startsWith('task') || key === 'backlog');
      }});
      // 通知父组件创建成功（用于 undo/redo）
      onCreated?.(createdTask, lastPayloadRef.current);
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err?.message || '创建失败，请重试');
    },
  });

  function handleSubmit() {
    if (!form.title.trim()) return;
    const payload: Record<string, any> = {
      title: form.title.trim(),
      parent_task_id: form.parent_task_id || undefined,
    };
    if (form.description) payload.description = form.description;
    if (form.labels.length) payload.labels = form.labels;
    if (form.priority !== 'P2') payload.priority = form.priority;
    if (form.owner) payload.owner = form.owner;
    if (form.due_date) payload.due_date = form.due_date;
    if (form.domain) payload.domain = form.domain;
    if (form.milestone) payload.milestone = form.milestone;
    if (form.schedule_mode && form.schedule_mode !== 'once') payload.schedule_mode = form.schedule_mode;
    lastPayloadRef.current = payload;
    mut.mutate(payload);
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-lg mx-4 max-h-[92vh] overflow-y-auto">
        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">新建节点</h2>
          <p className="text-xs text-gray-400 mt-0.5">只需填写标题即可创建，其他信息可以后续完善</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">标题 <span className="text-red-400">*</span></label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-transparent"
              placeholder="输入节点标题，回车创建"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && form.title.trim()) handleSubmit(); }}
              autoFocus
            />
          </div>

          {form.parent_task_id && (
            <div className="text-xs text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg">
              将作为 <span className="font-mono font-medium">{form.parent_task_id}</span> 的子节点创建
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowMore(v => !v)}
            className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
          >
            {showMore ? '▼ 收起选项' : '▶ 更多选项（标签、负责人、优先级...）'}
          </button>

          {showMore && (
            <div className="space-y-4 border-t border-gray-100 pt-4">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">标签（可选）</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {PRESET_LABELS.map(l => {
                    const active = form.labels.includes(l.value);
                    return (
                      <button key={l.value} onClick={() => toggleLabel(l.value)}
                        className={cn('text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border transition-all',
                          active ? 'border-transparent' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300')}
                        style={active ? { backgroundColor: l.bg, color: l.color, borderColor: l.color + '40' } : {}}>
                        {active ? '✓ ' : ''}{l.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <input className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    placeholder="自定义标签（回车添加）" value={form.customLabel}
                    onChange={e => setForm(f => ({ ...f, customLabel: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomLabel(); } }} />
                  <button onClick={addCustomLabel} className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg">添加</button>
                </div>
                {form.labels.filter(l => !PRESET_LABELS.map(p => p.value).includes(l)).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {form.labels.filter(l => !PRESET_LABELS.map(p => p.value).includes(l)).map(l => (
                      <span key={l} className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full flex items-center gap-1">
                        #{l}
                        <button onClick={() => setForm(f => ({ ...f, labels: f.labels.filter(x => x !== l) }))} className="text-gray-400 hover:text-red-400">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {!form.parent_task_id && (
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">父节点 ID</label>
                  <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    placeholder="如 U-005（留空则为根节点）" value={form.parent_task_id}
                    onChange={e => setForm(f => ({ ...f, parent_task_id: e.target.value }))} />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">描述</label>
                <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  rows={2} placeholder="详细描述（可选）" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">优先级</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    {[{ value: 'P0', label: 'P0 — 紧急' }, { value: 'P1', label: 'P1 — 重要' }, { value: 'P2', label: 'P2 — 普通' }, { value: 'P3', label: 'P3 — 可推迟' }]
                      .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">负责人</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}>
                    <option value="">不指定</option>
                    {(members as any[]).map((m: any) => <option key={m.identifier} value={m.identifier}>{m.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">业务板块</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}>
                    <option value="">不选</option>
                    {(domains as any[]).map((d: any) => <option key={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">里程碑</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={form.milestone} onChange={e => setForm(f => ({ ...f, milestone: e.target.value }))}>
                    <option value="">不选</option>
                    {(milestones as any[]).map((m: any) => <option key={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">调度类型</label>
                  <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={form.schedule_mode} onChange={e => setForm(f => ({ ...f, schedule_mode: e.target.value }))}>
                    {[
                      { value: 'once', label: '🎯 一次性' },
                      { value: 'recurring', label: '🔄 周期循环' },
                      { value: 'scheduled', label: '⏰ 定时触发' },
                      { value: 'milestone_driven', label: '🏁 里程碑驱动' },
                      { value: 'on_demand', label: '⚡ 按需触发' },
                    ].map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1.5 block">截止日期</label>
                  <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="px-6 pb-2">
            <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">⚠️ {errorMsg}</div>
          </div>
        )}

        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
          <button onClick={handleSubmit} disabled={!form.title.trim() || mut.isPending}
            className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
            {mut.isPending ? '创建中...' : '创建节点'}
          </button>
        </div>
      </div>
    </div>
  );
}
