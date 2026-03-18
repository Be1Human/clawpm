import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { setCurrentMember } from '../lib/useCurrentMember';

interface IdentityPickerProps {
  open: boolean;
  onClose: () => void;
}

export default function IdentityPicker({ open, onClose }: IdentityPickerProps) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const { data, isLoading } = useQuery({
    queryKey: ['auth-me', 'identity-picker'],
    queryFn: () => api.getAuthMe(),
    enabled: open,
  });

  if (!open) return null;

  async function handleSelect(identifier: string) {
    const result = await api.selectMember({ member_identifier: identifier });
    setCurrentMember(result.currentMember.identifier);
    await qc.invalidateQueries();
    onClose();
  }

  const bindings = (data?.bindings || []) as any[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        style={{ animation: 'fadeInScale 0.2s ease-out' }}
      >
        <div className="px-6 pt-6 pb-4">
          <h2 className="text-lg font-bold text-gray-900">切换成员上下文</h2>
          <p className="text-sm text-gray-400 mt-1">这里只展示当前账号已经绑定的成员身份</p>
        </div>

        <div className="px-6 pb-4 max-h-[320px] overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">加载中...</p>
          ) : bindings.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">当前账号还没有绑定任何成员，请先到引导页或成员页完成绑定。</p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {bindings.map((member: any) => (
                <button
                  key={member.identifier}
                  onClick={() => handleSelect(member.identifier)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all duration-150 cursor-pointer text-left group"
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 group-hover:scale-110 transition-transform"
                    style={{ backgroundColor: member.color || '#6366f1' }}
                  >
                    {(member.name || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{member.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-gray-400 truncate">{member.identifier}</span>
                      {member.isDefault && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
                          默认
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 border-t border-gray-100 pt-4">
          <button
            onClick={onClose}
            className="w-full text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 py-2.5 rounded-lg transition-colors cursor-pointer font-medium"
          >
            关闭
          </button>
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
