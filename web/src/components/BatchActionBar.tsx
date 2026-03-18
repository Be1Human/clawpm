import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

interface BatchActionBarProps {
  selectedTaskIds: string[];
  onClear: () => void;
}

const STATUS_OPTIONS = [
  { value: 'backlog', label: '待规划' },
  { value: 'planned', label: '已规划' },
  { value: 'active', label: '进行中' },
  { value: 'review', label: '评审中' },
  { value: 'done', label: '已完成' },
];

const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3'];

export default function BatchActionBar({ selectedTaskIds, onClear }: BatchActionBarProps) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');

  const batchUpdate = useMutation({
    mutationFn: (updates: Record<string, any>) => api.batchUpdateTasks(selectedTaskIds, updates),
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => {
        const key = q.queryKey[0];
        return typeof key === 'string' && (key.startsWith('task') || key === 'backlog' || key.startsWith('my-task'));
      }});
      onClear();
      setStatus('');
      setPriority('');
    },
  });

  const handleApply = () => {
    const updates: Record<string, any> = {};
    if (status) updates.status = status;
    if (priority) updates.priority = priority;
    if (Object.keys(updates).length === 0) return;
    batchUpdate.mutate(updates);
  };

  if (selectedTaskIds.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 flex items-center gap-3">
      <span className="text-sm font-medium text-gray-700">
        已选 <span className="text-indigo-600">{selectedTaskIds.length}</span> 项
      </span>

      <div className="w-px h-6 bg-gray-200" />

      <select
        value={status}
        onChange={e => setStatus(e.target.value)}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:ring-1 focus:ring-indigo-300 outline-none"
      >
        <option value="">修改状态...</option>
        {STATUS_OPTIONS.map(s => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      <select
        value={priority}
        onChange={e => setPriority(e.target.value)}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:ring-1 focus:ring-indigo-300 outline-none"
      >
        <option value="">修改优先级...</option>
        {PRIORITY_OPTIONS.map(p => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>

      <button
        onClick={handleApply}
        disabled={(!status && !priority) || batchUpdate.isPending}
        className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {batchUpdate.isPending ? '应用中...' : '应用'}
      </button>

      <button
        onClick={onClear}
        className="text-xs text-gray-400 hover:text-gray-600 ml-1"
      >
        取消
      </button>
    </div>
  );
}
