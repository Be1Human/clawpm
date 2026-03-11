import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useRecentTasks } from '@/lib/useRecentTasks';
import { useFavorites } from '@/lib/useFavorites';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { formatDate, formatRelative, cn } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import PermissionPanel from '@/components/PermissionPanel';
import MarkdownPreview from '@/components/MarkdownPreview';

const ATTACHMENT_TYPES = [
  { key: 'doc', label: '文档', icon: '📄' },
  { key: 'link', label: '链接', icon: '🔗' },
  { key: 'tapd', label: 'TAPD', icon: '🎫' },
] as const;

const LINK_ICONS: Record<string, string> = {
  'iwiki.woa.com': '📖',
  'feishu.cn': '📋',
  'figma.com': '🎨',
  'github.com': '🐙',
  'tapd.cn': '🎫',
  'docs.google.com': '📝',
  'notion.so': '📓',
};

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

function EditableField({ value, onSave, type = 'text', placeholder, className, disabled }: {
  value: string; onSave: (v: string) => void; type?: string; placeholder?: string; className?: string; disabled?: boolean;
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
        onClick={() => { if (!disabled) { setVal(value); setEditing(true); } }}
        className={cn('rounded px-1 -mx-1 transition-colors', disabled ? 'cursor-default' : 'cursor-pointer hover:bg-gray-100', className)}
        title={disabled ? undefined : '点击编辑'}
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

function SelectField({ value, options, onSave, renderValue, disabled }: {
  value: string; options: { value: string; label: string }[]; onSave: (v: string) => void;
  renderValue?: (v: string) => React.ReactNode; disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <span onClick={() => { if (!disabled) setEditing(true); }} className={cn('rounded px-1 -mx-1 transition-colors', disabled ? 'cursor-default' : 'cursor-pointer hover:bg-gray-100')} title={disabled ? undefined : '点击修改'}>
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

export default function TaskDetail({ taskId: propTaskId, onClose }: { taskId?: string; onClose?: () => void } = {}) {
  const params = useParams<{ taskId: string }>();
  const resolvedTaskId = propTaskId || params.taskId;
  const taskId = resolvedTaskId;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const activeProject = useActiveProject();
  const currentUser = useCurrentUser();
  const { recordVisit } = useRecentTasks();
  const { isFavorite, toggleFavorite } = useFavorites();

  const { data: task, isLoading } = useQuery({ queryKey: ['task', taskId], queryFn: () => api.getTask(taskId!) });
  const { data: history = [] } = useQuery({ queryKey: ['task-history', taskId], queryFn: () => api.getTaskHistory(taskId!) });
  const { data: notes = [] } = useQuery({ queryKey: ['task-notes', taskId], queryFn: () => api.getTaskNotes(taskId!) });
  const { data: children = [] } = useQuery({ queryKey: ['task-children', taskId], queryFn: () => api.getTaskChildren(taskId!) });
  const { data: domains = [] } = useQuery({ queryKey: ['domains', activeProject], queryFn: () => api.getDomains() });
  const { data: milestones = [] } = useQuery({ queryKey: ['milestones', activeProject], queryFn: () => api.getMilestones() });
  const { data: members = [] } = useQuery({ queryKey: ['members', activeProject], queryFn: () => api.getMembers() });
  const { data: customFieldDefs = [] } = useQuery({ queryKey: ['custom-fields', activeProject], queryFn: () => api.getCustomFields() });
  const { data: attachments = [] } = useQuery({ queryKey: ['attachments', taskId], queryFn: () => api.getAttachments(taskId!) });

  const [progressVal, setProgressVal] = useState('');
  const [progressSummary, setProgressSummary] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [blockerText, setBlockerText] = useState('');
  const [showBlocker, setShowBlocker] = useState(false);
  const [showAddChild, setShowAddChild] = useState(false);
  const [childTitle, setChildTitle] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState('');
  const [showDescPreview, setShowDescPreview] = useState(true);
  const [uploading, setUploading] = useState(false);
  const descTextareaRef = useRef<HTMLTextAreaElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // 图片上传处理
  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      const textarea = descTextareaRef.current;
      const insertText = `![${file.name}](${url})`;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newVal = descVal.slice(0, start) + insertText + descVal.slice(end);
        setDescVal(newVal);
        // 恢复光标位置
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + insertText.length;
          textarea.focus();
        }, 0);
      } else {
        setDescVal(prev => prev + '\n' + insertText);
      }
    } catch (e: any) {
      alert('图片上传失败：' + (e.message || '未知错误'));
    } finally {
      setUploading(false);
    }
  };

  const handleDescPaste = (e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
      if (imageFile) {
        e.preventDefault();
        handleImageUpload(imageFile);
      }
    }
  };

  const handleDescDrop = (e: React.DragEvent) => {
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const imageFile = Array.from(files).find(f => f.type.startsWith('image/'));
      if (imageFile) {
        e.preventDefault();
        handleImageUpload(imageFile);
      }
    }
  };
  const [attachTab, setAttachTab] = useState<'doc' | 'link' | 'tapd'>('doc');
  const [showAddAttach, setShowAddAttach] = useState(false);
  const [attachTitle, setAttachTitle] = useState('');
  const [attachContent, setAttachContent] = useState('');
  const [editingAttachId, setEditingAttachId] = useState<number | null>(null);
  const [editingAttachContent, setEditingAttachContent] = useState('');
  const [previewAttachId, setPreviewAttachId] = useState<number | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['task', taskId] });
    qc.invalidateQueries({ queryKey: ['task-history', taskId] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['task-tree'] });
    qc.invalidateQueries({ queryKey: ['attachments', taskId] });
  };

  // Record recent visit
  useEffect(() => {
    if (task && taskId) recordVisit(taskId, (task as any).title);
  }, [task, taskId]);

  // Escape 关闭附件预览抽屉
  useEffect(() => {
    if (!previewAttachId) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPreviewAttachId(null);
        setEditingAttachId(null);
        setEditingAttachContent('');
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [previewAttachId]);

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



  const noteMut = useMutation({
    mutationFn: () => api.addNote(taskId!, noteContent),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['task-notes', taskId] }); setNoteContent(''); },
  });

  const blockerMut = useMutation({
    mutationFn: () => api.reportBlocker(taskId!, blockerText),
    onSuccess: () => { invalidate(); setShowBlocker(false); setBlockerText(''); },
  });

  const addAttachMut = useMutation({
    mutationFn: (data: { type: string; title: string; content: string }) => api.addAttachment(taskId!, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attachments', taskId] }); invalidate(); setShowAddAttach(false); setAttachTitle(''); setAttachContent(''); },
  });

  const updateAttachMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.updateAttachment(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attachments', taskId] }); setEditingAttachId(null); setEditingAttachContent(''); },
  });

  const deleteAttachMut = useMutation({
    mutationFn: (id: number) => api.deleteAttachment(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['attachments', taskId] }); invalidate(); },
  });

  const chartData = (history as any[]).map((h: any) => ({
    date: new Date(h.recordedAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
    progress: h.progress,
  }));

  if (isLoading) return <div className="p-6 text-gray-500">加载中...</div>;
  if (!task) return <div className="p-6 text-gray-500">节点不存在</div>;

  const myPerm = task._myPermission as string | undefined;
  const canEdit = !currentUser || !myPerm || myPerm === 'owner' || myPerm === 'edit';
  const isOwner = !currentUser || myPerm === 'owner' || currentUser === task.owner;

  const labels: string[] = (() => { try { return Array.isArray(task.labels) ? task.labels : JSON.parse(task.labels || '[]'); } catch { return []; } })();

  function toggleLabel(label: string) {
    if (!canEdit) return;
    const next = labels.includes(label) ? labels.filter(l => l !== label) : [...labels, label];
    updateMut.mutate({ labels: next });
  }

  return (
    <div className="flex w-full h-full min-h-0 bg-white relative overflow-hidden">
      {/* 主要内容区（可滚动） */}
      <div className={cn('flex-1 min-w-0 overflow-y-auto relative custom-scrollbar transition-[padding-right] duration-300 ease-in-out', previewAttachId ? 'pr-[440px]' : '')}>
        <div className={cn('p-6 mx-auto transition-all', editingDesc ? 'max-w-7xl' : 'max-w-4xl')}>
          {/* 只读模式提示 */}
      {!canEdit && (
        <div className="mb-4 flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          你对此节点仅有查看权限，无法编辑
        </div>
      )}

      <div className="flex items-start gap-4 mb-6">
        <button onClick={() => onClose ? onClose() : navigate(-1)} className="text-gray-400 hover:text-gray-700 mt-1 transition-colors">{onClose ? '✕ 关闭' : '← 返回'}</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-mono text-sm text-gray-400">{task.taskId}</span>
            <SelectField
              value={task.status}
              options={STATUS_OPTIONS}
              onSave={v => updateMut.mutate({ status: v })}
              renderValue={() => <StatusBadge status={task.status} />}
              disabled={!canEdit}
            />
            <SelectField
              value={task.priority}
              options={PRIORITY_OPTIONS.map(p => ({ value: p, label: p }))}
              onSave={v => updateMut.mutate({ priority: v })}
              renderValue={() => <PriorityBadge priority={task.priority} />}
              disabled={!canEdit}
            />
            {/* 收藏星标 */}
            <button
              onClick={() => toggleFavorite(task.taskId, task.title)}
              className={`w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors ${isFavorite(task.taskId) ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400'}`}
              title={isFavorite(task.taskId) ? '取消收藏' : '收藏'}
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill={isFavorite(task.taskId) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                <path d="M8 1.5l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9L4.4 12.6l.7-4-2.9-2.8 4-.6L8 1.5z" strokeLinejoin="round" />
              </svg>
            </button>
            {/* 归档按钮 */}
            {canEdit && !task.archivedAt && (
              <button
                onClick={async () => { await api.archiveTask(task.taskId); invalidate(); navigate('/tasks'); }}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-2"
                title="归档此任务"
              >
                归档
              </button>
            )}
            {task.archivedAt && (
              <span className="text-xs text-amber-500 bg-amber-50 px-2 py-0.5 rounded ml-2">已归档</span>
            )}
          </div>
          <EditableField
            value={task.title}
            onSave={v => updateMut.mutate({ title: v })}
            className="text-xl font-semibold text-gray-900 block w-full"
            placeholder="输入标题"
            disabled={!canEdit}
          />
        </div>
        {(() => {
          if (!canEdit) return null;
          const flow = STATUS_OPTIONS.map(s => s.value);
          const idx = flow.indexOf(task.status);
          if (idx < 0 || idx >= flow.length - 1) return null; // 已是最后状态(done)则不显示
          const next = STATUS_OPTIONS[idx + 1];
          const colors: Record<string, string> = {
            planned: 'bg-blue-600 hover:bg-blue-700',
            active: 'bg-indigo-600 hover:bg-indigo-700',
            review: 'bg-amber-600 hover:bg-amber-700',
            done: 'bg-emerald-600 hover:bg-emerald-700',
          };
          return (
            <button onClick={() => updateMut.mutate({ status: next.value })}
              className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors flex-shrink-0 ${colors[next.value] || 'bg-gray-600 hover:bg-gray-700'}`}>
              → {next.label}
            </button>
          );
        })()}
      </div>

      {/* 编辑描述时全宽展开 */}
      {editingDesc && (
        <div className="mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">描述</h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">支持 Markdown 语法</span>
                <button
                  onClick={() => setShowDescPreview(v => !v)}
                  className={cn('text-[10px] px-2 py-0.5 rounded border transition-colors',
                    showDescPreview
                      ? 'border-indigo-200 text-indigo-600 bg-indigo-50'
                      : 'border-gray-200 text-gray-400 hover:text-gray-600')}
                >
                  {showDescPreview ? '收起预览' : '显示预览'}
                </button>
              </div>
            </div>
            <div className={cn('grid gap-4', showDescPreview ? 'grid-cols-2' : 'grid-cols-1')}>
              {/* 左栏：编辑器 */}
              <div className="min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">编辑</div>
                  <div className="flex items-center gap-1.5">
                    <input
                      ref={imgInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                        e.target.value = '';
                      }}
                    />
                    <button
                      onClick={() => imgInputRef.current?.click()}
                      disabled={uploading}
                      className={cn('text-[10px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1',
                        uploading
                          ? 'border-gray-200 text-gray-300 cursor-not-allowed'
                          : 'border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-200')}
                      title="上传图片（也可粘贴截图或拖拽图片）"
                    >
                      🖼 {uploading ? '上传中...' : '插入图片'}
                    </button>
                  </div>
                </div>
                <textarea
                  ref={descTextareaRef}
                  value={descVal}
                  onChange={e => setDescVal(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 min-h-[350px] resize-y outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 font-mono leading-relaxed"
                  autoFocus
                  placeholder="添加描述（支持 Markdown、粘贴截图、拖拽图片）..."
                  onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') { updateMut.mutate({ description: descVal }); setEditingDesc(false); } }}
                  onPaste={handleDescPaste}
                  onDrop={handleDescDrop}
                  onDragOver={e => e.preventDefault()}
                />
              </div>
              {/* 右栏：实时预览 */}
              {showDescPreview && (
                <div className="min-w-0 min-h-0">
                  <div className="text-[10px] text-gray-400 mb-1.5 font-medium uppercase tracking-wider">预览</div>
                  <div className="border border-gray-200 rounded-lg p-4 min-h-[350px] max-h-[550px] overflow-y-auto bg-gray-50/50">
                    {descVal.trim() ? (
                      <MarkdownPreview content={descVal} />
                    ) : (
                      <p className="text-sm text-gray-400 italic">输入 Markdown 内容后此处显示实时预览...</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-3 justify-end">
              <span className="text-[10px] text-gray-400 mr-auto">Ctrl+Enter 保存</span>
              <button onClick={() => setEditingDesc(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
              <button onClick={() => { updateMut.mutate({ description: descVal }); setEditingDesc(false); }}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">保存</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          {/* 描述（非编辑态 — Markdown 只读预览） */}
          {!editingDesc && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">描述</h3>
                {canEdit && (
                  <button onClick={() => { setDescVal(task.description || ''); setEditingDesc(true); }}
                    className="text-xs text-indigo-500 hover:text-indigo-700 transition-colors">编辑</button>
                )}
              </div>
              <div
                onClick={() => { if (canEdit) { setDescVal(task.description || ''); setEditingDesc(true); } }}
                className={canEdit ? 'cursor-text' : ''}
              >
                {task.description ? (
                  <MarkdownPreview content={task.description} />
                ) : (
                  <p className="text-sm text-gray-400">暂无描述，点击编辑添加</p>
                )}
              </div>
            </div>
          )}

          {/* 附件（v2.2） */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                附件
                {(attachments as any[]).length > 0 && (
                  <span className="ml-1.5 text-gray-400">({(attachments as any[]).length})</span>
                )}
              </h3>
              <button
                onClick={() => setShowAddAttach(v => !v)}
                className={cn('text-xs px-2.5 py-1 rounded-lg border transition-colors',
                  showAddAttach
                    ? 'border-indigo-300 text-indigo-600 bg-indigo-50'
                    : 'border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-200',
                  !canEdit && 'hidden')}
              >
                {showAddAttach ? '收起' : '+ 添加'}
              </button>
            </div>

            {/* 类型 Tab */}
            <div className="flex gap-1 mb-3">
              {ATTACHMENT_TYPES.map(t => {
                const count = (attachments as any[]).filter((a: any) => a.type === t.key).length;
                return (
                  <button
                    key={t.key}
                    onClick={() => setAttachTab(t.key)}
                    className={cn('flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      attachTab === t.key ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' : 'text-gray-500 hover:bg-gray-50')}
                  >
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                    {count > 0 && <span className="text-[10px] text-gray-400">({count})</span>}
                  </button>
                );
              })}
            </div>

            {/* 添加附件表单 */}
            {showAddAttach && (
              <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-100 space-y-2">
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                  placeholder={attachTab === 'doc' ? '文档标题（如"需求文档"）' : attachTab === 'link' ? '链接标题（如"Figma设计稿"）' : 'TAPD 单标题'}
                  value={attachTitle} onChange={e => setAttachTitle(e.target.value)} autoFocus
                />
                {attachTab === 'doc' ? (
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 font-mono"
                    placeholder="Markdown 内容..."
                    value={attachContent} onChange={e => setAttachContent(e.target.value)}
                  />
                ) : (
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                    placeholder={attachTab === 'link' ? 'https://...' : 'TAPD 单 ID 或 URL'}
                    value={attachContent} onChange={e => setAttachContent(e.target.value)}
                  />
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={() => { setShowAddAttach(false); setAttachTitle(''); setAttachContent(''); }}
                    className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">取消</button>
                  <button
                    onClick={() => { if (attachTitle.trim() && attachContent.trim()) addAttachMut.mutate({ type: attachTab, title: attachTitle.trim(), content: attachContent.trim() }); }}
                    disabled={!attachTitle.trim() || !attachContent.trim() || addAttachMut.isPending}
                    className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >{addAttachMut.isPending ? '...' : '添加'}</button>
                </div>
              </div>
            )}

            {/* 附件列表 */}
            <div className="space-y-2">
              {(attachments as any[]).filter((a: any) => a.type === attachTab).length === 0 && !showAddAttach && (
                <p className="text-xs text-gray-400 py-1">暂无{ATTACHMENT_TYPES.find(t => t.key === attachTab)?.label}</p>
              )}
              {(attachments as any[]).filter((a: any) => a.type === attachTab).map((att: any) => (
                <div key={att.id} className="group relative">
                  {att.type === 'doc' ? (
                    <div className="border border-gray-100 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setPreviewAttachId(previewAttachId === att.id ? null : att.id)}
                        className={cn("w-full flex items-center gap-2 p-2.5 hover:bg-gray-50 transition-colors text-left", previewAttachId === att.id && 'bg-indigo-50/50')}
                      >
                        <span className="text-sm">📄</span>
                        <span className="flex-1 text-sm font-medium text-gray-700">{att.title}</span>
                        <span className="text-[10px] text-gray-400">{previewAttachId === att.id ? '收起预览' : '右侧预览'}</span>
                      </button>
                    </div>
                  ) : att.type === 'link' ? (
                    <a href={att.content} target="_blank" rel="noopener noreferrer"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); const url = att.content.startsWith('http') ? att.content : 'https://' + att.content; window.open(url, '_blank', 'noopener,noreferrer'); }}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
                      <span className="text-sm">{(() => { try { const h = new URL(att.content).hostname; return LINK_ICONS[h] || '🔗'; } catch { return '🔗'; } })()}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-700 truncate">{att.title}</div>
                        <div className="text-[10px] text-gray-400 truncate">{(() => { try { return new URL(att.content).hostname; } catch { return att.content; } })()}</div>
                      </div>
                      <span className="text-gray-300 text-sm flex-shrink-0">↗</span>
                    </a>
                  ) : (
                    <a href={att.content.startsWith('http') ? att.content : `https://www.tapd.cn/${att.metadata?.workspaceId || ''}/bugtrace/bugs/view/${att.content}`}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => { e.preventDefault(); e.stopPropagation(); const url = att.content.startsWith('http') ? att.content : `https://www.tapd.cn/${(att.metadata as any)?.workspaceId || ''}/bugtrace/bugs/view/${att.content}`; window.open(url, '_blank', 'noopener,noreferrer'); }}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer">
                      <span className="text-sm">🎫</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-700 truncate">{att.title}</div>
                        <div className="text-[10px] text-gray-400 truncate">
                          {att.metadata?.tapdType && <span className="mr-1">{att.metadata.tapdType}</span>}
                          #{att.content}
                          {att.metadata?.status && <span className="ml-1">· {att.metadata.status}</span>}
                        </div>
                      </div>
                      <span className="text-gray-300 text-sm flex-shrink-0">↗</span>
                    </a>
                  )}
                  <button
                    onClick={() => { if (confirm('确认删除此附件？')) deleteAttachMut.mutate(att.id); }}
                    className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all text-xs"
                  >×</button>
                </div>
              ))}
            </div>
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

          {task.status !== 'done' && canEdit && (
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
          {/* 树上下文小视图 */}
          <TreeContextWidget taskId={task.taskId} />

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
                  disabled={!canEdit}
                />
              </MetaRow>

              <MetaRow label="里程碑">
                <SelectField
                  value={task.milestone?.name || ''}
                  options={[{ value: '', label: '无' }, ...(milestones as any[]).map((m: any) => ({ value: m.name, label: m.name }))]}
                  onSave={v => updateMut.mutate({ milestone: v || undefined })}
                  renderValue={(v) => <span className="text-sm text-gray-700">{v || '—'}</span>}
                  disabled={!canEdit}
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
                  disabled={!canEdit}
                />
              </MetaRow>

              <MetaRow label="开始日期">
                <EditableField
                  value={task.startDate || ''}
                  onSave={v => updateMut.mutate({ start_date: v || undefined })}
                  type="date"
                  className="text-sm text-gray-600"
                  placeholder="点击设置"
                  disabled={!canEdit}
                />
              </MetaRow>
              <MetaRow label="截止日期">
                <EditableField
                  value={task.dueDate || ''}
                  onSave={v => updateMut.mutate({ due_date: v || undefined })}
                  type="date"
                  className="text-sm text-gray-600"
                  placeholder="点击设置"
                  disabled={!canEdit}
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
                    : 'border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-200',
                  !canEdit && 'hidden')}
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

          {/* 权限管理（v2.5） */}
          <PermissionPanel taskId={task.taskId} owner={task.owner} />
        </div>
      </div>
    </div>
  </div>

    {/* ── 右侧附件预览抽屉 ── */}
    <div className={cn(
      'absolute top-0 right-0 h-full w-[440px] bg-white z-20',
      'flex flex-col border-l border-gray-100',
      'transition-transform duration-300 ease-in-out',
      previewAttachId
        ? 'translate-x-0 shadow-[-16px_0_48px_-8px_rgba(0,0,0,0.12)]'
        : 'translate-x-full pointer-events-none'
    )}>
      {/* 抽屉头部 */}
      <div className="h-13 border-b border-gray-100 flex items-center justify-between px-4 py-3 flex-shrink-0 bg-white/95 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-800 truncate leading-tight">
            {(attachments as any[])?.find((a: any) => a.id === previewAttachId)?.title || '文档预览'}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {/* 编辑按钮（仅文档类型且有权限时显示） */}
          {canEdit && previewAttachId && (() => {
            const att = (attachments as any[])?.find((a: any) => a.id === previewAttachId);
            if (!att || att.type !== 'doc') return null;
            const isEditing = editingAttachId === att.id;
            return (
              <button
                onClick={() => {
                  if (isEditing) { setEditingAttachId(null); setEditingAttachContent(''); }
                  else { setEditingAttachId(att.id); setEditingAttachContent(att.content); }
                }}
                className={cn(
                  'p-1.5 rounded-lg transition-colors text-xs font-medium flex items-center gap-1',
                  isEditing
                    ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                )}
                title={isEditing ? '取消编辑' : '编辑文档'}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                {isEditing ? '取消' : '编辑'}
              </button>
            );
          })()}
          {/* 关闭按钮 */}
          <button
            onClick={() => { setPreviewAttachId(null); setEditingAttachId(null); setEditingAttachContent(''); }}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title="关闭预览 (Esc)"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 抽屉内容区 */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {previewAttachId ? (() => {
          const att = (attachments as any[])?.find((a: any) => a.id === previewAttachId);
          if (!att) return (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
              附件不存在或已删除
            </div>
          );

          if (editingAttachId === att.id) {
            return (
              <div className="h-full flex flex-col p-4 gap-3">
                <textarea
                  className="flex-1 w-full border border-gray-200 rounded-xl p-4 text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 font-mono bg-white shadow-sm leading-relaxed"
                  value={editingAttachContent}
                  onChange={e => setEditingAttachContent(e.target.value)}
                  autoFocus
                  placeholder="Markdown 内容..."
                />
                <div className="flex justify-end gap-2 flex-shrink-0 pb-1">
                  <button
                    onClick={() => { setEditingAttachId(null); setEditingAttachContent(''); }}
                    className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => updateAttachMut.mutate({ id: att.id, data: { content: editingAttachContent } })}
                    disabled={updateAttachMut.isPending}
                    className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {updateAttachMut.isPending ? '保存中...' : '保存修改'}
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div className="p-5 pb-8">
              <div className="prose prose-sm max-w-none text-gray-700">
                <MarkdownPreview content={att.content} />
              </div>
            </div>
          );
        })() : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400 px-6">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
              <svg className="w-7 h-7 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="text-sm text-center">点击文档附件右侧预览</span>
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
      <span className="text-xs text-gray-500">{label}</span>
      <div className="max-w-[60%]">{children}</div>
    </div>
  );
}

// ── 树上下文小视图 ──────────────────────────────────────────────────

const CTX_STATUS_DOT: Record<string, string> = {
  backlog: 'bg-slate-400', planned: 'bg-blue-400', active: 'bg-indigo-500',
  review: 'bg-amber-500', done: 'bg-emerald-500',
};

function TreeContextWidget({ taskId }: { taskId: string }) {
  const navigate = useNavigate();
  const { data: ctx, isLoading } = useQuery({
    queryKey: ['task-context', taskId],
    queryFn: () => api.getTaskContext(taskId),
    enabled: !!taskId,
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">节点位置</h3>
        <div className="text-xs text-gray-400">加载中...</div>
      </div>
    );
  }

  if (!ctx) return null;

  const { current, ancestors, siblings, children } = ctx;

  const goToTask = (tid: string) => navigate(`/tasks/${tid}`);
  const goToMindMap = () => navigate(`/my/tasks/mindmap?focus=${taskId}`);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider font-medium">节点位置</h3>
        <button
          onClick={goToMindMap}
          className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline transition-colors flex items-center gap-1"
          title="在脑图中定位"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          脑图定位
        </button>
      </div>

      <div className="space-y-0.5">
        {/* 祖先链 */}
        {ancestors.map((a: any, i: number) => (
          <CtxTreeRow
            key={a.taskId}
            task={a}
            depth={i}
            isCurrent={false}
            onClick={() => goToTask(a.taskId)}
          />
        ))}

        {/* 当前节点 */}
        <CtxTreeRow
          task={current}
          depth={ancestors.length}
          isCurrent={true}
          onClick={undefined}
        />

        {/* 子节点 */}
        {children.map((c: any) => (
          <CtxTreeRow
            key={c.taskId}
            task={c}
            depth={ancestors.length + 1}
            isCurrent={false}
            onClick={() => goToTask(c.taskId)}
          />
        ))}

        {/* 同级节点（折叠显示） */}
        {siblings.length > 0 && (
          <CtxSiblings siblings={siblings} depth={ancestors.length} onNavigate={goToTask} />
        )}
      </div>
    </div>
  );
}

function CtxTreeRow({ task, depth, isCurrent, onClick }: {
  task: any; depth: number; isCurrent: boolean; onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 py-1 px-1.5 rounded-md text-xs transition-colors',
        isCurrent
          ? 'bg-indigo-50 border border-indigo-200 font-medium text-indigo-700'
          : 'hover:bg-gray-50 cursor-pointer text-gray-600',
      )}
      style={{ paddingLeft: `${depth * 16 + 6}px` }}
      onClick={onClick}
    >
      {/* 树线指示 */}
      {depth > 0 && (
        <svg className="w-3 h-3 text-gray-300 flex-shrink-0" viewBox="0 0 12 12" fill="none">
          <path d="M2 0v6h10" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      )}
      <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', CTX_STATUS_DOT[task.status] || 'bg-gray-400')} />
      <span className="truncate flex-1">{task.title}</span>
      {isCurrent && (
        <span className="text-[10px] text-indigo-400 flex-shrink-0">当前</span>
      )}
    </div>
  );
}

function CtxSiblings({ siblings, depth, onNavigate }: {
  siblings: any[]; depth: number; onNavigate: (taskId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? siblings : siblings.slice(0, 2);

  return (
    <div className="mt-0.5">
      <div
        className="flex items-center gap-1 py-0.5 px-1.5 text-[10px] text-gray-400 cursor-pointer hover:text-gray-600 transition-colors"
        style={{ paddingLeft: `${depth * 16 + 6}px` }}
        onClick={() => setExpanded(v => !v)}
      >
        <svg className={cn('w-3 h-3 transition-transform', expanded && 'rotate-90')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        同级节点 ({siblings.length})
      </div>
      {shown.map((s: any) => (
        <div
          key={s.taskId}
          className="flex items-center gap-1.5 py-0.5 px-1.5 rounded text-[11px] text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors"
          style={{ paddingLeft: `${depth * 16 + 22}px` }}
          onClick={() => onNavigate(s.taskId)}
        >
          <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', CTX_STATUS_DOT[s.status] || 'bg-gray-400')} />
          <span className="truncate">{s.title}</span>
        </div>
      ))}
      {!expanded && siblings.length > 2 && (
        <div
          className="text-[10px] text-gray-400 cursor-pointer hover:text-indigo-500 transition-colors"
          style={{ paddingLeft: `${depth * 16 + 22}px` }}
          onClick={() => setExpanded(true)}
        >
          ... 还有 {siblings.length - 2} 个
        </div>
      )}
    </div>
  );
}
