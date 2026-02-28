import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { api } from '@/api/client';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { formatDate, formatRelative, cn } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const CHILD_TYPE: Record<string, string> = {
  epic: 'story', story: 'task', task: 'subtask',
};
const TYPE_LABEL: Record<string, string> = {
  epic: '史诗', story: '用户故事', task: '任务', subtask: '子任务',
};

export default function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: task, isLoading } = useQuery({ queryKey: ['task', taskId], queryFn: () => api.getTask(taskId!) });
  const { data: history = [] } = useQuery({ queryKey: ['task-history', taskId], queryFn: () => api.getTaskHistory(taskId!) });
  const { data: notes = [] } = useQuery({ queryKey: ['task-notes', taskId], queryFn: () => api.getTaskNotes(taskId!) });
  const { data: children = [] } = useQuery({ queryKey: ['task-children', taskId], queryFn: () => api.getTaskChildren(taskId!) });

  const [progressVal, setProgressVal] = useState('');
  const [progressSummary, setProgressSummary] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [blockerText, setBlockerText] = useState('');
  const [showBlocker, setShowBlocker] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [childTitle, setChildTitle] = useState('');
  const [childPriority, setChildPriority] = useState('P2');

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['task', taskId] });
    qc.invalidateQueries({ queryKey: ['task-history', taskId] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['task-tree'] });
  };

  const addChildMut = useMutation({
    mutationFn: (data: any) => api.createTask(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-children', taskId] });
      qc.invalidateQueries({ queryKey: ['task-tree'] });
      setChildTitle('');
      setChildPriority('P2');
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

  if (isLoading) return <div className="p-6 text-slate-500">加载中...</div>;
  if (!task) return <div className="p-6 text-slate-500">任务不存在</div>;

  return (
    <div className="p-6 max-w-4xl animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="btn-ghost mt-0.5 text-slate-500">← 返回</button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-sm text-slate-500">{task.taskId}</span>
            {task.type && task.type !== 'task' && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                {TYPE_LABEL[task.type] || task.type}
              </span>
            )}
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
          <h1 className="text-xl font-semibold text-slate-100">{task.title}</h1>
        </div>
        {task.status !== 'done' && (
          <button onClick={() => completeMut.mutate()} className="btn-primary">标记完成</button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left */}
        <div className="col-span-2 space-y-5">
          {/* Description */}
          {task.description && (
            <div className="card p-4">
              <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3">描述</h3>
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Blocker */}
          {task.blocker && (
            <div className="border border-red-500/30 bg-red-500/10 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-red-400">🚧</span>
                <span className="text-sm font-medium text-red-400">阻塞</span>
              </div>
              <p className="text-sm text-red-300">{task.blocker}</p>
            </div>
          )}

          {/* Progress Update */}
          {task.status !== 'done' && (
            <div className="card p-4">
              <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3">更新进度</h3>
              <div className="flex gap-3 mb-3">
                <input
                  type="number" min="0" max="100"
                  className="input w-24"
                  placeholder="0-100"
                  value={progressVal}
                  onChange={e => setProgressVal(e.target.value)}
                />
                <input
                  className="input flex-1"
                  placeholder="本次进展摘要（可选）"
                  value={progressSummary}
                  onChange={e => setProgressSummary(e.target.value)}
                />
                <button
                  onClick={() => progressMut.mutate()}
                  disabled={!progressVal || progressMut.isPending}
                  className="btn-primary disabled:opacity-50"
                >
                  更新
                </button>
              </div>
              {!showBlocker ? (
                <button onClick={() => setShowBlocker(true)} className="text-xs text-red-400 hover:text-red-300">
                  + 报告阻塞
                </button>
              ) : (
                <div className="flex gap-2 mt-2">
                  <input
                    className="input flex-1 text-sm"
                    placeholder="阻塞原因..."
                    value={blockerText}
                    onChange={e => setBlockerText(e.target.value)}
                  />
                  <button onClick={() => blockerMut.mutate()} disabled={!blockerText} className="btn-primary text-sm disabled:opacity-50">
                    确认
                  </button>
                  <button onClick={() => setShowBlocker(false)} className="btn-ghost text-sm">取消</button>
                </div>
              )}
            </div>
          )}

          {/* Progress Chart */}
          {chartData.length > 1 && (
            <div className="card p-4">
              <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3">进度历史</h3>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} width={25} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                  />
                  <Line type="monotone" dataKey="progress" stroke="#6366f1" strokeWidth={2} dot={{ fill: '#6366f1', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Notes */}
          <div className="card p-4">
            <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3">备注</h3>
            <div className="space-y-2.5 mb-3">
              {(notes as any[]).length === 0 && (
                <p className="text-sm text-slate-700">还没有备注</p>
              )}
              {(notes as any[]).map((note: any) => (
                <div key={note.id} className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-sm text-slate-300">{note.content}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-600">
                    {note.author && <span>{note.author}</span>}
                    <span>{formatRelative(note.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm"
                placeholder="添加备注..."
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && noteContent && noteMut.mutate()}
              />
              <button onClick={() => noteMut.mutate()} disabled={!noteContent} className="btn-primary disabled:opacity-50">
                添加
              </button>
            </div>
          </div>
        </div>

        {/* Right: Meta */}
        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-4">任务信息</h3>
            <div className="space-y-3">
              {task.type && (
                <MetaRow label="类型">
                  <span className="text-sm text-slate-300">{TYPE_LABEL[task.type] || task.type}</span>
                </MetaRow>
              )}
              <MetaRow label="当前进度">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-brand-500 rounded-full" style={{ width: `${task.progress}%` }} />
                  </div>
                  <span className="text-xs text-slate-400">{task.progress}%</span>
                </div>
              </MetaRow>
              <MetaRow label="业务板块">
                {task.domain ? (
                  <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${task.domain.color}20`, color: task.domain.color }}>
                    {task.domain.name}
                  </span>
                ) : '—'}
              </MetaRow>
              <MetaRow label="里程碑">
                <span className="text-sm text-slate-300">{task.milestone?.name || '—'}</span>
              </MetaRow>
              <MetaRow label="负责人">
                {task.owner ? (
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-brand-500/30 flex items-center justify-center text-xs text-brand-400">
                      {task.owner[0].toUpperCase()}
                    </span>
                    <span className="text-sm text-slate-300">{task.owner}</span>
                  </div>
                ) : '—'}
              </MetaRow>
              <MetaRow label="开始日期"><span className="text-sm text-slate-400">{formatDate(task.startDate)}</span></MetaRow>
              <MetaRow label="截止日期"><span className="text-sm text-slate-400">{formatDate(task.dueDate)}</span></MetaRow>
              <MetaRow label="来源"><span className="text-sm text-slate-500">{task.source}</span></MetaRow>
              <MetaRow label="健康度">
                <span className={cn(
                  'text-sm font-medium',
                  task.healthScore >= 80 ? 'text-green-400' : task.healthScore >= 60 ? 'text-yellow-400' : 'text-red-400'
                )}>
                  {task.healthScore}/100
                </span>
              </MetaRow>
              <MetaRow label="更新时间"><span className="text-xs text-slate-600">{formatRelative(task.updatedAt)}</span></MetaRow>
            </div>
          </div>

          {task.tags?.length > 0 && (
            <div className="card p-4">
              <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3">标签</h3>
              <div className="flex flex-wrap gap-1.5">
                {task.tags.map((tag: string) => (
                  <span key={tag} className="badge bg-slate-800 text-slate-400">{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* 子任务 */}
          {CHILD_TYPE[task.type] && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs text-slate-500 uppercase tracking-wider">
                  {TYPE_LABEL[CHILD_TYPE[task.type]] || '子任务'}
                  {(children as any[]).length > 0 && (
                    <span className="ml-1.5 text-slate-600">({(children as any[]).length})</span>
                  )}
                </h3>
                <button
                  onClick={() => setShowAddChild(v => !v)}
                  className={cn(
                    'text-xs px-2 py-1 rounded border transition-colors',
                    showAddChild
                      ? 'border-brand-500/50 text-brand-400 bg-brand-500/10'
                      : 'border-slate-700 text-slate-500 hover:text-brand-400 hover:border-brand-500/30'
                  )}
                >
                  {showAddChild ? '收起' : `+ 添加${TYPE_LABEL[CHILD_TYPE[task.type]]}`}
                </button>
              </div>

              {/* 添加子任务表单 */}
              {showAddChild && (
                <div className="mb-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 space-y-2">
                  <input
                    className="input w-full text-sm"
                    placeholder={`${TYPE_LABEL[CHILD_TYPE[task.type]]}标题`}
                    value={childTitle}
                    onChange={e => setChildTitle(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && childTitle.trim()) {
                        addChildMut.mutate({
                          title: childTitle.trim(),
                          type: CHILD_TYPE[task.type],
                          parent_task_id: task.taskId,
                          priority: childPriority,
                          domain: task.domain?.name,
                        });
                      }
                    }}
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <select
                      className="input text-xs py-1"
                      value={childPriority}
                      onChange={e => setChildPriority(e.target.value)}
                    >
                      {['P0', 'P1', 'P2', 'P3'].map(p => <option key={p}>{p}</option>)}
                    </select>
                    <span className="text-xs text-slate-600 flex-1">Enter 确认 / 点击创建</span>
                    <button
                      onClick={() => {
                        if (!childTitle.trim()) return;
                        addChildMut.mutate({
                          title: childTitle.trim(),
                          type: CHILD_TYPE[task.type],
                          parent_task_id: task.taskId,
                          priority: childPriority,
                          domain: task.domain?.name,
                        });
                      }}
                      disabled={!childTitle.trim() || addChildMut.isPending}
                      className="btn-primary text-xs py-1 px-3 disabled:opacity-50"
                    >
                      {addChildMut.isPending ? '...' : '创建'}
                    </button>
                  </div>
                </div>
              )}

              {/* 子任务列表 */}
              <div className="space-y-1.5">
                {(children as any[]).length === 0 && !showAddChild && (
                  <p className="text-xs text-slate-700 py-1">暂无子项，点击上方按钮添加</p>
                )}
                {(children as any[]).map((child: any) => (
                  <Link
                    key={child.id}
                    to={`/tasks/${child.taskId}`}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-800/50 transition-colors group"
                  >
                    <div className={cn(
                      'w-1.5 h-1.5 rounded-full flex-shrink-0',
                      child.status === 'done' ? 'bg-emerald-500' :
                      child.status === 'active' ? 'bg-brand-500' :
                      child.status === 'blocked' ? 'bg-red-500' : 'bg-slate-600'
                    )} />
                    <span className="flex-1 text-sm text-slate-300 group-hover:text-slate-100 truncate">{child.title}</span>
                    <span className="text-xs text-slate-600 flex-shrink-0">{child.progress}%</span>
                    <span className="font-mono text-xs text-slate-700 flex-shrink-0">{child.taskId}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-600">{label}</span>
      <div className="max-w-[60%]">{children}</div>
    </div>
  );
}
