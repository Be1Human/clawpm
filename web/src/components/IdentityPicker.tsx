import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { setCurrentUser } from '../lib/useCurrentUser';

interface IdentityPickerProps {
  open: boolean;
  onClose: () => void;
}

export default function IdentityPicker({ open, onClose }: IdentityPickerProps) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIdentifier, setNewIdentifier] = useState('');
  const [newType, setNewType] = useState<'human' | 'agent'>('human');

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: () => api.getMembers(),
    enabled: open,
  });

  if (!open) return null;

  function handleSelect(identifier: string) {
    setCurrentUser(identifier);
    onClose();
  }

  async function handleCreate() {
    if (!newName.trim() || !newIdentifier.trim()) return;
    await api.createMember({
      name: newName.trim(),
      identifier: newIdentifier.trim(),
      type: newType,
    });
    setCurrentUser(newIdentifier.trim());
    qc.invalidateQueries({ queryKey: ['members'] });
    setNewName('');
    setNewIdentifier('');
    setShowCreate(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        style={{ animation: 'fadeInScale 0.2s ease-out' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-lg font-bold text-gray-900">选择你的身份</h2>
          <p className="text-sm text-gray-400 mt-1">请选择你在项目中的角色</p>
        </div>

        {/* Member grid */}
        <div className="px-6 pb-4 max-h-[320px] overflow-y-auto">
          {(members as any[]).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">暂无成员，请先创建身份</p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {(members as any[]).map((m: any) => (
                <button
                  key={m.identifier}
                  onClick={() => handleSelect(m.identifier)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all duration-150 cursor-pointer text-left group"
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 group-hover:scale-110 transition-transform"
                    style={{ backgroundColor: m.color || '#6366f1' }}
                  >
                    {(m.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-gray-400 truncate">{m.identifier}</span>
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                        style={{
                          backgroundColor: m.type === 'agent' ? '#ede9fe' : '#dbeafe',
                          color: m.type === 'agent' ? '#7c3aed' : '#2563eb',
                        }}
                      >
                        {m.type === 'agent' ? 'Agent' : '人类'}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Create new identity */}
        <div className="px-6 pb-6 border-t border-gray-100 pt-4">
          {showCreate ? (
            <div className="space-y-2.5">
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="显示名称"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 bg-transparent"
                />
                <input
                  value={newIdentifier}
                  onChange={e => setNewIdentifier(e.target.value)}
                  placeholder="唯一标识"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 bg-transparent"
                />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setNewType('human')}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                      newType === 'human' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    人类
                  </button>
                  <button
                    onClick={() => setNewType('agent')}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                      newType === 'agent' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    Agent
                  </button>
                </div>
                <div className="flex-1" />
                <button
                  onClick={() => setShowCreate(false)}
                  className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || !newIdentifier.trim()}
                  className="text-xs bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  创建并选择
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 py-2.5 rounded-lg transition-colors cursor-pointer font-medium"
            >
              + 创建新身份
            </button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
