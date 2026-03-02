import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { api } from '@/api/client';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { formatDate, formatRelative, cn } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const LABEL_COLORS: Record<string, { bg: string; text: string }> = {
  epic: { bg: '#ede9fe', text: '#7c3aed' }, feature: { bg: '#dbeafe', text: '#1d4ed8' },
  bug: { bg: '#fee2e2', text: '#b91c1c' }, spike: { bg: '#ffedd5', text: '#c2410c' },
  chore: { bg: '#f1f5f9', text: '#475569' },
};

const STATUS_OPTIONS = [
  { value: 'backlog', label: '未排期' },
  { value: 'planned', label: '未开始' },
  { value: 'active', label: '进行中' },
  { value: 'review', label: '验收中' },
  { value: 'done', label: '已完成' },
];

const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];

const PRESET_LABELS = ['epic', 'feature', 'bug', 'spike', 'chore'];

const STATUS_DOT: Record<string, string> = {
  backlog: 'bg-slate-400', planned: 'bg-blue-400', active: 'bg-indigo-500',
  review: 'bg-amber-500', done: 'bg-emerald-500',
};

function EditableField({ value, onSave, type = 'text', placeholder, className }: {
  value: string; onSave: (v: string) => void; type?: string; placeholder?: string; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  useEffect(() => { setVal(value); }, [value]);

  function commit() {
    setEditing(false);
    if (val !== value) onSave(val);
  }

  if (!editing) {
    return (
      <span
        onClick={() => { setVal(value); setEditing(true); }}
        className={cn('cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1 transition-colors', className)}
        title="点击编辑"
      >
        {value || <span className="text-gray-400">{placeholder || '点击设置'}</span>}
      </span>
    );
  }

  return (
    <input
      ref={ref}
      type={type}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(value); setEditing(false); } }}
      className={cn('border border-indigo-300 rounded px-1.5 py-0.5 text-sm outline-none bg-white', className)}
      placeholder={placeholder}
    />
  );
}

function SelectField({ value, options, onSave, renderValue }: {
  value: string; options: { value: string; label: string }[]; onSave: (v: string) => void;
  renderValue?: (v: string) => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <span onClick={() => setEditing(true)} className="cursor-pointer hover:bg-gray-100 rounded px-1 -mx-1 transition-colors" title="点击修改">
        {renderValue ? renderValue(value) : options.find(o => o.value === value)?.label || value}
      </span>
    );
  }

  return (
    <select
      value={value}
      onChange={e => { onSave(e.target.value); setEditing(false); }}
      onBlur={() => setEditing(false)}
      autoFocus
      className="border border-indigo-300 rounded px-1.5 py-0.5 text-sm outline-none bg-white"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export default function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: task, isLoading } = useQuery({ queryKey: ['task', taskId], queryFn: () => api.getTask(taskId!) });
  const { data: history = [] } = useQuery({ queryKey: ['task-history', taskId], queryFn: () => api.getTaskHistory(taskId!) });
  const { data: notes = [] } = useQuery({ queryKey: ['task-notes', taskId], queryFn: () => api.getTaskNotes(taskId!) });
  const { data: children = [] } = useQuery({ queryKey: ['task-children', taskId], queryFn: () => api.getTaskChildren(taskId!) });
  const { data: domains = [] } = useQuery({ queryKey: ['domains'], queryFn: () => api.getDomains() });
  const { data: milestones = [] } = useQuery({ queryKey: ['milestones'], queryFn: () => api.getMilestones() });
  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: () => api.getMembers() });
  const { data: customFieldDefs = [] } = useQuery({ queryKey: ['custom-fields'], queryFn: () => api.getCustomFields() });

  const [progressVal, setProgressVal] = useState('');
  const [progressSummary, setProgressSummary] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [blockerText, setBlockerText] = useState('');
  const [showBlocker, setShowBlocker] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [childTitle, setChildTitle] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState('');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['task', taskId] });
    qc.invalidateQueries({ queryKey: ['task-history', taskId] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['task-tree'] });
  };

  const setFieldMut = useMutation({
    mutationFn: (values: Record<number, string>) => api.setTaskFields(taskId!, values),
    onSuccess: invalidate,
  });

  const updateMut = useMutation({
    mutationFn: (data: any) => api.updateTask(taskId!, data),
    onSuccess: invalidate,
  });

  const addChildMut = useMutation({
    mutationFn: (data: any) => api.createTask(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-children', taskId] });
      qc.invalidateQueries({ queryKey: ['task-tree'] });
      setChildTitle('');
      setShowAddChild(false);
    },
  });

  const progressMut = useMutation({
    mutationFn: () => api.updateProgress(taskId!, parseInt(progressVal), progressSummary || undefined),
    onSuccess: () => { invalidate(); setProgressVal(''); setProgressSummary(''); },
  });

  const completeMut = useMutation({
    mutationFn: () => api.completeTask(taskId!),
    onSuccess: invalidate,
  });

  const noteMut = useMutation({
    mutationFn: () => api.addNote(taskId!, noteContent),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task-notes', taskId] }); setNoteContent(''); },
  });

  const blockerMut = useMutation({
    mutationFn: () => api.reportBlocker(taskId!, blockerText),
    onSuccess: () => { invalidate(); setShowBlocker(false); setBlockerText(''); },
  });

  const chartData = (history as any[]).map((h: any) => ({
    date: new Date(h.recordedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
    progress: h.progress,
  }));

  if (isLoading) return <div className="p-6 text-gray-500">加载中...</div>;
  if (!task) return <div className="p-6 text-gray-500">节点不存在</div>;

  const labels: string[] = (() => { try { return Array.isArray(task.labels) ? task.labels : JSON.parse(task.labels || '[]'); } catch { return []; } })();

  function toggleLabel(label: string) {
    const next = labels.includes(label) ? labels.filter(l => l !== label) : [...labels, label];
    updateMut.mutate({ labels: next });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-700 mt-1 transition-colors">← 返回</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-mono text-sm text-gray-400">{task.taskId}</span>
            <SelectField
              value={task.status}
              options={STATUS_OPTIONS}
              onSave={v => updateMut.mutate({ status: v })}
              renderValue={() => <StatusBadge status={task.status} />}
            />
            <SelectField
              value={task.priority}
              options={PRIORITY_OPTIONS.map(p => ({ value: p, label: p }))}
              onSave={v => updateMut.mutate({ priority: v })}
              renderValue={() => <PriorityBadge priority={task.priority} />}
            />
          </div>
          <EditableField
            value={task.title}
            onSave={v => updateMut.mutate({ title: v })}
            className="text-xl font-semibold text-gray-900 block w-full"
            placeholder="输入标题"
          />
        </div>
        {task.status !== 'done' && (
          <button onClick={() => completeMut.mutate()}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors flex-shrink-0">
            标记完成
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          {/* 描述（可编辑） */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">描述</h3>
              {!editingDesc && (
                <button onClick={() => { setDescVal(task.description || ''); setEditingDesc(true); }}
                  className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors">编辑</button>
              )}
            </div>
            {editingDesc ? (
              <div>
                <textarea
                  value={descVal}
                  onChange={e => setDescVal(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 min-h-[100px] resize-y outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                  autoFocus
                  placeholder="添加描述..."
                />
                <div className="flex gap-2 mt-2 justify-end">
                  <button onClick={() => setEditingDesc(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
                  <button onClick={() => { updateMut.mutate({ description: descVal }); setEditingDesc(false); }}
                    className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">保存</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                {task.description || <span className="text-gray-400">暂无描述，点击"编辑"添加</span>}
              </p>
            )}
          </div>

          {/* 标签（可编辑） */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">标签</h3>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_LABELS.map(l => {
                const active = labels.includes(l);
                const c = LABEL_COLORS[l] || { bg: '#f1f5f9', text: '#475569' };
                return (
                  <button key={l} onClick={() => toggleLabel(l)}
                    className={cn('text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full transition-all',
                      active ? 'ring-2 ring-offset-1' : 'opacity-40 hover:opacity-70')}
                    style={{ backgroundColor: c.bg, color: c.text, '--tw-ring-color': c.text } as React.CSSProperties}>
                    {l}
                  </button>
                );
              })}
            </div>
          </div>

          {task.blocker && (
            <div className="border border-red-200 bg-red-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-red-500">⚠</span>
                <span className="text-sm font-medium text-red-600">阻塞</span>
              </div>
              <p className="text-sm text-red-600">{task.blocker}</p>
            </div>
          )}

          {task.status !== 'done' && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">更新进度</h3>
              <div className="flex gap-3 mb-3">
                <input type="number" min="0" max="100"
                  className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                  placeholder="0-100"
                  value={progressVal} onChange={e => setProgressVal(e.target.value)} />
                <input
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                  placeholder="本次进展摘要（可选）"
                  value={progressSummary} onChange={e => setProgressSummary(e.target.value)} />
                <button onClick={() => progressMut.mutate()} disabled={!progressVal || progressMut.isPending}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">更新</button>
              </div>
              {!showBlocker ? (
                <button onClick={() => setShowBlocker(true)} className="text-xs text-red-500 hover:text-red-600">
                  + 报告阻塞
                </button>
              ) : (
                <div className="flex gap-2 mt-2">
                  <input className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30" placeholder="阻塞原因..."
                    value={blockerText} onChange={e => setBlockerText(e.target.value)} />
                  <button onClick={() => blockerMut.mutate()} disabled={!blockerText}
                    className="px-3 py-2 rounded-lg bg-red-500 text-white text-sm disabled:opacity-50 transition-colors">确认</button>
                  <button onClick={() => setShowBlocker(false)}
                    className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
                </div>
              )}
            </div>
          )}

          {chartData.length > 1 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">进度历史</h3>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} width={25} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
                  <Line type="monotone" dataKey="progress" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">备注</h3>
            <div className="space-y-2.5 mb-3">
              {(notes as any[]).length === 0 && <p className="text-sm text-gray-400">还没有备注</p>}
              {(notes as any[]).map((note: any) => (
                <div key={note.id} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-700">{note.content}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                    {note.author && <span>{note.author}</span>}
                    <span>{formatRelative(note.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                placeholder="添加备注..."
                value={noteContent} onChange={e => setNoteContent(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && noteContent && noteMut.mutate()} />
              <button onClick={() => noteMut.mutate()} disabled={!noteContent}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">添加</button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* 节点信息（可编辑） */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-4">节点信息</h3>
            <div className="space-y-3">
              <MetaRow label="当前进度">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${task.progress}%` }} />
                  </div>
                  <span className="text-xs text-gray-500">{task.progress}%</span>
                </div>
              </MetaRow>

              <MetaRow label="业务板块">
                <SelectField
                  value={task.domain?.name || ''}
                  options={[{ value: '', label: '无' }, ...(domains as any[]).map((d: any) => ({ value: d.name, label: d.name }))]}
                  onSave={v => updateMut.mutate({ domain: v || undefined })}
                  renderValue={(v) => v ? (
                    <span className="text-xs px-2 py-0.5 rounded" style={{
                      backgroundColor: `${(domains as any[]).find((d: any) => d.name === v)?.color || '#6366f1'}20`,
                      color: (domains as any[]).find((d: any) => d.name === v)?.color || '#6366f1',
                    }}>{v}</span>
                  ) : <span className="text-sm text-gray-400">—</span>}
                />
              </MetaRow>

              <MetaRow label="里程碑">
                <SelectField
                  value={task.milestone?.name || ''}
                  options={[{ value: '', label: '无' }, ...(milestones as any[]).map((m: any) => ({ value: m.name, label: m.name }))]}
                  onSave={v => updateMut.mutate({ milestone: v || undefined })}
                  renderValue={(v) => <span className="text-sm text-gray-700">{v || '—'}</span>}
                />
              </MetaRow>

              <MetaRow label="负责人">
                <SelectField
                  value={task.owner || ''}
                  options={[{ value: '', label: '未分配' }, ...(members as any[]).map((m: any) => ({ value: m.identifier, label: `${m.name} (${m.identifier})` }))]}
                  onSave={v => updateMut.mutate({ owner: v || undefined })}
                  renderValue={(v) => v ? (
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-xs text-indigo-600 font-medium">
                        {v[0].toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-700">{v}</span>
                    </div>
                  ) : <span className="text-sm text-gray-400">—</span>}
                />
              </MetaRow>

              <MetaRow label="开始日期">
                <EditableField
                  value={task.startDate || ''}
                  onSave={v => updateMut.mutate({ start_date: v || undefined })}
                  type="date"
                  className="text-sm text-gray-600"
                  placeholder="点击设置"
                />
              </MetaRow>
              <MetaRow label="截止日期">
                <EditableField
                  value={task.dueDate || ''}
                  onSave={v => updateMut.mutate({ due_date: v || undefined })}
                  type="date"
                  className="text-sm text-gray-600"
                  placeholder="点击设置"
                />
              </MetaRow>

              <MetaRow label="健康度">
                <span className={cn('text-sm font-medium',
                  task.healthScore >= 80 ? 'text-green-600' : task.healthScore >= 60 ? 'text-amber-500' : 'text-red-500')}>
                  {task.healthScore}/100
                </span>
              </MetaRow>
              <MetaRow label="更新时间"><span className="text-xs text-gray-400">{formatRelative(task.updatedAt)}</span></MetaRow>
            </div>
          </div>

          {(customFieldDefs as any[]).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-4">自定义字段</h3>
              <div className="space-y-3">
                {(customFieldDefs as any[]).map((fd: any) => {
                  const fieldType = fd.fieldType || fd.field_type;
                  const cfValues: Record<string, string> = task.customFields || {};
                  const currentValue = cfValues[fd.name] || '';
                  const options: string[] = typeof fd.options === 'string' ? JSON.parse(fd.options || '[]') : (fd.options || []);

                  return (
                    <MetaRow key={fd.id} label={fd.name}>
                      {fieldType === 'select' ? (
                        <SelectField
                          value={currentValue}
                          options={[{ value: '', label: '—' }, ...options.map((o: string) => ({ value: o, label: o }))]}
                          onSave={v => setFieldMut.mutate({ [fd.id]: v })}
                          renderValue={(v) => <span className="text-sm text-gray-700">{v || '—'}</span>}
                        />
                      ) : fieldType === 'multi_select' ? (
                        <div className="flex flex-wrap gap-1">
                          {options.map((opt: string) => {
                            let selected: string[] = [];
                            try { selected = JSON.parse(currentValue || '[]'); } catch { if (currentValue) selected = [currentValue]; }
                            const isOn = selected.includes(opt);
                            return (
                              <button
                                key={opt}
                                onClick={() => {
                                  const next = isOn ? selected.filter(s => s !== opt) : [...selected, opt];
                                  setFieldMut.mutate({ [fd.id]: JSON.stringify(next) });
                                }}
                                className={cn('text-[11px] px-2 py-0.5 rounded-full transition-all border',
                                  isOn ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-gray-50 text-gray-400 border-gray-100 hover:text-gray-600')}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      ) : fieldType === 'date' ? (
                        <EditableField
                          value={currentValue}
                          onSave={v => setFieldMut.mutate({ [fd.id]: v })}
                          type="date"
                          className="text-sm text-gray-600"
                          placeholder="点击设置"
                        />
                      ) : fieldType === 'number' ? (
                        <EditableField
                          value={currentValue}
                          onSave={v => setFieldMut.mutate({ [fd.id]: v })}
                          type="number"
                          className="text-sm text-gray-600"
                          placeholder="输入数值"
                        />
                      ) : (
                        <EditableField
                          value={currentValue}
                          onSave={v => setFieldMut.mutate({ [fd.id]: v })}
                          className="text-sm text-gray-600"
                          placeholder="输入文本"
                        />
                      )}
                    </MetaRow>
                  );
                })}
              </div>
            </div>
          )}

          {task.tags?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">标签</h3>
              <div className="flex flex-wrap gap-1.5">
                {task.tags.map((tag: string) => (
                  <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{tag}</span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                子节点
                {(children as any[]).length > 0 && (
                  <span className="ml-1.5 text-gray-400">({(children as any[]).length})</span>
                )}
              </h3>
              <button
                onClick={() => setShowAddChild(v => !v)}
                className={cn('text-xs px-2.5 py-1 rounded-lg border transition-colors',
                  showAddChild
                    ? 'border-indigo-300 text-indigo-600 bg-indigo-50'
                    : 'border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-200')}
              >
                {showAddChild ? '收起' : '+ 添加'}
              </button>
            </div>

            {showAddChild && (
              <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-2">
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                  placeholder="子节点标题" value={childTitle}
                  onChange={e => setChildTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && childTitle.trim()) {
                      addChildMut.mutate({ title: childTitle.trim(), parent_task_id: task.taskId, domain: task.domain?.name });
                    }
                  }}
                  autoFocus />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 flex-1">Enter 确认</span>
                  <button
                    onClick={() => {
                      if (!childTitle.trim()) return;
                      addChildMut.mutate({ title: childTitle.trim(), parent_task_id: task.taskId, domain: task.domain?.name });
                    }}
                    disabled={!childTitle.trim() || addChildMut.isPending}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs disabled:opacity-50 transition-colors"
                  >
                    {addChildMut.isPending ? '...' : '创建'}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              {(children as any[]).length === 0 && !showAddChild && (
                <p className="text-xs text-gray-400 py-1">暂无子节点</p>
              )}
              {(children as any[]).map((child: any) => (
                <Link key={child.id} to={`/tasks/${child.taskId}`}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors group">
                  <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', STATUS_DOT[child.status] || 'bg-gray-400')} />
                  <span className="flex-1 text-sm text-gray-700 group-hover:text-gray-900 truncate">{child.title}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{child.progress}%</span>
                  <span className="font-mono text-xs text-gray-400 flex-shrink-0">{child.taskId}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="max-w-[60%]">{children}</div>
    </div>
  );
}
