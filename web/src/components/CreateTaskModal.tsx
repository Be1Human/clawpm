import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';

const TYPE_OPTIONS = [
  { value: 'epic',    label: '史诗 (Epic)' },
  { value: 'story',   label: '用户故事 (Story)' },
  { value: 'task',    label: '任务 (Task)' },
  { value: 'subtask', label: '子任务 (Subtask)' },
];

const CHILD_TYPE: Record<string, string> = {
  epic: 'story', story: 'task', task: 'subtask',
};

interface Props {
  onClose: () => void;
  /** 预设父任务 ID（taskId 字符串，如 U-005），有则自动推导 type */
  defaultParentId?: string;
  /** 预设 type */
  defaultType?: string;
}

export default function CreateTaskModal({ onClose, defaultParentId, defaultType }: Props) {
  const qc = useQueryClient();

  const [form, setForm] = useState({
    title: '',
    description: '',
    type: defaultType || (defaultParentId ? '' : 'task'),
    parent_task_id: defaultParentId || '',
    priority: 'P2',
    owner: '',
    due_date: '',
    domain: '',
    milestone: '',
  });

  const { data: domains = [] } = useQuery({ queryKey: ['domains'], queryFn: api.getDomains });
  const { data: milestones = [] } = useQuery({ queryKey: ['milestones'], queryFn: api.getMilestones });

  // 当 parent_task_id 变化时，自动推导 type
  const handleParentChange = (val: string) => {
    setForm(f => ({ ...f, parent_task_id: val, type: f.type }));
  };

  const mut = useMutation({
    mutationFn: (data: any) => api.createTask(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task-tree'] });
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    const payload: Record<string, any> = {
      title: form.title.trim(),
      description: form.description || undefined,
      priority: form.priority,
      owner: form.owner || undefined,
      due_date: form.due_date || undefined,
      domain: form.domain || undefined,
      milestone: form.milestone || undefined,
      parent_task_id: form.parent_task_id || undefined,
    };
    // type: 有父节点且未选type时自动推导，否则用选中的
    if (form.type) {
      payload.type = form.type;
    }
    mut.mutate(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="card w-full max-w-lg p-6 animate-slide-up mx-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-slate-100 mb-5">新建任务</h2>

        <div className="space-y-4">
          {/* 标题 */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">标题 *</label>
            <input
              className="input w-full"
              placeholder="任务标题"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              autoFocus
            />
          </div>

          {/* 类型 + 父任务 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">类型</label>
              <select
                className="input w-full"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              >
                <option value="">自动推导</option>
                {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">父任务 ID</label>
              <input
                className="input w-full"
                placeholder="如 U-005（可选）"
                value={form.parent_task_id}
                onChange={e => handleParentChange(e.target.value)}
              />
            </div>
          </div>

          {/* 描述 */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">描述</label>
            <textarea
              className="input w-full resize-none"
              rows={2}
              placeholder="任务描述（可选）"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* 优先级 + 负责人 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">优先级</label>
              <select className="input w-full" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                {['P0', 'P1', 'P2', 'P3'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">负责人</label>
              <input className="input w-full" placeholder="agent-01" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} />
            </div>
          </div>

          {/* 板块 + 里程碑 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">业务板块</label>
              <select className="input w-full" value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}>
                <option value="">不选</option>
                {(domains as any[]).map((d: any) => <option key={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">里程碑</label>
              <select className="input w-full" value={form.milestone} onChange={e => setForm(f => ({ ...f, milestone: e.target.value }))}>
                <option value="">不选</option>
                {(milestones as any[]).map((m: any) => <option key={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>

          {/* 截止日期 */}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">截止日期</label>
            <input type="date" className="input w-full" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-ghost">取消</button>
          <button
            onClick={handleSubmit}
            disabled={!form.title.trim() || mut.isPending}
            className="btn-primary disabled:opacity-50"
          >
            {mut.isPending ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}
