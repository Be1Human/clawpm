import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useActiveProject } from '@/lib/useActiveProject';

interface Props {
  taskId: string;
  owner: string | null;
}

export default function PermissionPanel({ taskId, owner }: Props) {
  const currentUser = useCurrentUser();
  const activeProject = useActiveProject();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [newGrantee, setNewGrantee] = useState('');
  const [newLevel, setNewLevel] = useState<'edit' | 'view'>('view');

  const isOwner = currentUser === owner;

  const { data: permData } = useQuery({
    queryKey: ['permissions', taskId],
    queryFn: () => api.getTaskPermissions(taskId),
    enabled: isOpen,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members', activeProject],
    queryFn: () => api.getMembers(),
    enabled: isOpen && addMode,
  });

  const grantMutation = useMutation({
    mutationFn: ({ grantee, level }: { grantee: string; level: 'edit' | 'view' }) =>
      api.grantPermission(taskId, grantee, level),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', taskId] });
      setAddMode(false);
      setNewGrantee('');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (grantee: string) => api.revokePermission(taskId, grantee),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', taskId] });
    },
  });

  const updateLevelMutation = useMutation({
    mutationFn: ({ grantee, level }: { grantee: string; level: 'edit' | 'view' }) =>
      api.grantPermission(taskId, grantee, level),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', taskId] });
    },
  });

  if (!isOwner) {
    // 非 Owner 只展示当前权限标识
    const myPerm = permData?.myPermission;
    if (!myPerm || myPerm === 'owner' || myPerm === 'edit') return null;
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-400 px-2 py-1 bg-gray-50 rounded">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        仅查看
      </div>
    );
  }

  const permissions = permData?.permissions || [];
  const existingGrantees = new Set(permissions.map((p: any) => p.grantee));
  const availableMembers = (members as any[]).filter(
    (m: any) => m.identifier !== owner && !existingGrantees.has(m.identifier)
  );

  return (
    <div className="mt-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        权限管理
        {permissions.length > 0 && (
          <span className="bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full text-[10px] font-medium">
            {permissions.length}
          </span>
        )}
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-2 border border-gray-100 rounded-lg p-3 bg-gray-50/50 space-y-2 animate-fade-in">
          {permissions.length === 0 && !addMode && (
            <p className="text-xs text-gray-400">暂无授权。此节点当前为公开模式。</p>
          )}

          {permissions.map((perm: any) => (
            <div key={perm.grantee} className="flex items-center justify-between gap-2 py-1.5 px-2 bg-white rounded border border-gray-100">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: perm.granteeInfo?.color || '#94a3b8' }}
                >
                  {(perm.granteeInfo?.name || perm.grantee)[0]?.toUpperCase()}
                </div>
                <span className="text-xs font-medium text-gray-700 truncate">
                  {perm.granteeInfo?.name || perm.grantee}
                </span>
                {perm.granteeInfo?.type === 'agent' && (
                  <span className="text-[10px] bg-violet-100 text-violet-600 px-1 rounded">Agent</span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  value={perm.level}
                  onChange={(e) => updateLevelMutation.mutate({ grantee: perm.grantee, level: e.target.value as 'edit' | 'view' })}
                  className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white hover:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                >
                  <option value="edit">可编辑</option>
                  <option value="view">仅查看</option>
                </select>
                <button
                  onClick={() => revokeMutation.mutate(perm.grantee)}
                  className="text-gray-300 hover:text-red-500 transition-colors p-0.5"
                  title="撤销权限"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}

          {addMode ? (
            <div className="flex items-center gap-2 pt-1">
              <select
                value={newGrantee}
                onChange={(e) => setNewGrantee(e.target.value)}
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
              >
                <option value="">选择成员...</option>
                {availableMembers.map((m: any) => (
                  <option key={m.identifier} value={m.identifier}>
                    {m.name} ({m.identifier})
                  </option>
                ))}
              </select>
              <select
                value={newLevel}
                onChange={(e) => setNewLevel(e.target.value as 'edit' | 'view')}
                className="text-xs border border-gray-200 rounded px-1.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
              >
                <option value="edit">可编辑</option>
                <option value="view">仅查看</option>
              </select>
              <button
                onClick={() => {
                  if (newGrantee) grantMutation.mutate({ grantee: newGrantee, level: newLevel });
                }}
                disabled={!newGrantee || grantMutation.isPending}
                className="text-xs bg-indigo-500 text-white px-2.5 py-1.5 rounded hover:bg-indigo-600 disabled:opacity-40 transition-colors"
              >
                确定
              </button>
              <button
                onClick={() => { setAddMode(false); setNewGrantee(''); }}
                className="text-xs text-gray-400 hover:text-gray-600 px-1"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddMode(true)}
              className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors pt-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              添加协作者
            </button>
          )}
        </div>
      )}
    </div>
  );
}
