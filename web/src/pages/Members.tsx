import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';

const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#16a34a', '#0891b2', '#475569'];
type FormState = { name: string; identifier: string; color: string; description: string };
const EMPTY_FORM: FormState = { name: '', identifier: '', color: COLORS[0], description: '' };

function makeIdentifier(name: string) {
  const ascii = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
  return ascii || `person-${Date.now().toString().slice(-6)}`;
}

export default function Members() {
  const project = useActiveProject();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState('');
  const { data: members = [], isLoading } = useQuery({ queryKey: ['members', project], queryFn: () => api.getMembers() });

  const save = useMutation({
    mutationFn: () => editing?.identifier
      ? api.updateMember(editing.identifier, { name: form.name.trim(), color: form.color, description: form.description.trim() })
      : api.createMember({ name: form.name.trim(), identifier: form.identifier.trim() || makeIdentifier(form.name), color: form.color, description: form.description.trim(), type: 'human' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members', project] }); setEditing(null); setForm(EMPTY_FORM); setError(''); },
    onError: (err: any) => setError(err?.message || '保存失败'),
  });
  const remove = useMutation({
    mutationFn: (identifier: string) => api.removeProjectMember(identifier),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', project] }),
  });

  const startEdit = (member: any) => {
    setEditing(member);
    setForm({ name: member.name, identifier: member.identifier, color: member.color || COLORS[0], description: member.description || '' });
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-7">
      <div className="mb-6 flex items-start justify-between">
        <div><h1 className="text-xl font-semibold text-gray-900">人员配置</h1><p className="mt-1 text-sm text-gray-500">维护当前工程可选的协作人员。</p></div>
        <button type="button" onClick={() => { setEditing({ identifier: '' }); setForm(EMPTY_FORM); }} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Plus className="h-4 w-4" /> 添加人员</button>
      </div>

      {isLoading ? <div className="py-20 text-center text-sm text-gray-400">加载中...</div> : members.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center border-y border-gray-200 text-center"><Users className="mb-3 h-9 w-9 text-gray-300" /><p className="text-sm font-medium text-gray-700">当前工程还没有人员</p><p className="mt-1 text-xs text-gray-400">添加后即可在需求中选择协作人员。</p></div>
      ) : (
        <div className="divide-y divide-gray-200 border-y border-gray-200">
          {(members as any[]).map(member => (
            <div key={member.identifier} className="flex items-center gap-4 px-2 py-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: member.color || '#64748b' }}>{member.name.slice(0, 1)}</span>
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-gray-900">{member.name}</div><div className="truncate text-xs text-gray-400">{member.identifier}{member.description ? ` · ${member.description}` : ''}</div></div>
              <span className="text-xs text-gray-400">关联 {member.taskCount || 0} 个需求</span>
              <button type="button" title="编辑" onClick={() => startEdit(member)} className="rounded p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><Pencil className="h-4 w-4" /></button>
              <button type="button" title="从工程移除" onClick={() => { if (confirm(`从当前工程移除“${member.name}”？`)) remove.mutate(member.identifier); }} className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b border-gray-100 px-5 py-4"><h2 className="text-base font-semibold text-gray-900">{editing.identifier ? '编辑人员' : '添加人员'}</h2></div>
            <div className="space-y-4 px-5 py-5">
              <label className="block text-xs font-medium text-gray-600">姓名<input autoFocus value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value, identifier: editing.identifier ? v.identifier : makeIdentifier(e.target.value) }))} className="mt-1.5 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" placeholder="例如：张三" /></label>
              {!editing.identifier && <label className="block text-xs font-medium text-gray-600">本地标识<input value={form.identifier} onChange={e => setForm(v => ({ ...v, identifier: e.target.value }))} className="mt-1.5 w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-400" placeholder="zhang-san" /></label>}
              <label className="block text-xs font-medium text-gray-600">备注<input value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} className="mt-1.5 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" placeholder="例如：前端协作" /></label>
              <div><div className="mb-2 text-xs font-medium text-gray-600">标识颜色</div><div className="flex gap-2">{COLORS.map(color => <button key={color} type="button" onClick={() => setForm(v => ({ ...v, color }))} className={`h-7 w-7 rounded-full ${form.color === color ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`} style={{ backgroundColor: color }} aria-label={color} />)}</div></div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4"><button type="button" onClick={() => setEditing(null)} className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">取消</button><button type="button" disabled={!form.name.trim() || save.isPending} onClick={() => save.mutate()} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">保存</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
