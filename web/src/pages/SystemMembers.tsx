import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}

function Avatar({ member, size = 'md' }: { member: any; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div
      className={cn(cls, 'rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0')}
      style={{ backgroundColor: member.color }}
    >
      {initials(member.name)}
    </div>
  );
}

const PRESET_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4'];

function SystemMemberModal({ member, onClose, t }: { member?: any; onClose: () => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const qc = useQueryClient();
  const isEdit = !!member;

  const [form, setForm] = useState({
    name: member?.name || '',
    identifier: member?.identifier || '',
    type: member?.type || 'human',
    color: member?.color || PRESET_COLORS[0],
    description: member?.description || '',
  });

  const createMut = useMutation({
    mutationFn: () => api.createSystemMember(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['system-members'] }); onClose(); },
  });

  const updateMut = useMutation({
    mutationFn: () => api.updateSystemMember(member!.identifier, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['system-members'] }); onClose(); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.identifier) return;
    isEdit ? updateMut.mutate() : createMut.mutate();
  }

  const pending = createMut.isPending || updateMut.isPending;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? t('sysMembers.editMember') : t('sysMembers.createMember')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Avatar preview */}
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold text-white"
              style={{ backgroundColor: form.color }}
            >
              {initials(form.name || '?')}
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c} type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={cn('w-6 h-6 rounded-full border-2 transition-transform',
                    form.color === c ? 'border-indigo-600 scale-110' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">{t('members.displayName')}</label>
              <input
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="张三 / cursor-agent-01"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">{t('members.identifierLabel')}</label>
              <input
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                value={form.identifier}
                onChange={e => setForm(f => ({ ...f, identifier: e.target.value }))}
                placeholder="zhang-san / cursor-agent-01"
                disabled={isEdit}
                required
              />
              <p className="text-xs text-gray-400 mt-1">{t('members.identifierHint')}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">{t('members.typeLabel')}</label>
              <select
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              >
                <option value="human">{t('members.humanOption')}</option>
                <option value="agent">{t('members.agentOption')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">{t('members.descriptionLabel')}</label>
            <textarea
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm min-h-[60px] outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder={t('members.descPlaceholder')}
            />
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">{t('common.cancel')}</button>
            <button type="submit" disabled={pending} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {pending ? t('common.saving') : isEdit ? t('members.saveChanges') : t('sysMembers.createMember')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MemberCard({ member, onEdit, onDelete, t }: { member: any; onEdit: () => void; onDelete: () => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 group hover:border-indigo-200 hover:shadow-sm transition-all">
      <div className="flex items-start gap-3">
        <Avatar member={member} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-gray-900 truncate">{member.name}</span>
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full', member.type === 'agent' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600')}>
              {member.type === 'agent' ? '🤖 Agent' : '👤 Human'}
            </span>
          </div>
          <p className="text-xs text-gray-400 font-mono mb-1">{member.identifier}</p>
          {member.description && (
            <p className="text-xs text-gray-500 line-clamp-2">{member.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span>{t('members.taskCountLabel', { count: member.taskCount || 0 })}</span>
            <span>{t('members.activeCountLabel', { count: member.activeCount || 0 })}</span>
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 text-xs transition-colors" title={t('common.edit')}>✎</button>
          <button onClick={onDelete} className="w-7 h-7 rounded flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 text-xs transition-colors" title={t('common.delete')}>✕</button>
        </div>
      </div>
    </div>
  );
}

export default function SystemMembers() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editMember, setEditMember] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['system-members', typeFilter],
    queryFn: () => api.getSystemMembers(typeFilter || undefined),
  });

  const deleteMut = useMutation({
    mutationFn: (identifier: string) => api.deleteSystemMember(identifier),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['system-members'] }); setDeleteConfirm(null); },
  });

  const humanCount = (members as any[]).filter((m: any) => m.type === 'human').length;
  const agentCount = (members as any[]).filter((m: any) => m.type === 'agent').length;

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('sysMembers.title')}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t('sysMembers.subtitle')}</p>
        </div>
        <button onClick={() => { setEditMember(null); setShowModal(true); }} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors">
          {t('sysMembers.addMember')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: t('members.allMembers'), value: (members as any[]).length },
          { label: t('members.humanLabel'), value: humanCount },
          { label: t('members.agentLabel'), value: agentCount },
        ].map(stat => (
          <div key={stat.label} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {[['', t('common.all')], ['human', t('members.humanLabel')], ['agent', '🤖 Agent']].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setTypeFilter(val)}
            className={cn('px-4 py-1.5 rounded-lg text-sm transition-colors',
              typeFilter === val ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-100')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Member list */}
      {isLoading ? (
        <div className="text-gray-400 text-sm py-8 text-center">{t('common.loading')}</div>
      ) : (members as any[]).length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-sm">{t('sysMembers.noMembers')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(members as any[]).map((m: any) => (
            <MemberCard
              key={m.id}
              member={m}
              t={t}
              onEdit={() => { setEditMember(m); setShowModal(true); }}
              onDelete={() => setDeleteConfirm(m)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <SystemMemberModal member={editMember} t={t} onClose={() => { setShowModal(false); setEditMember(null); }} />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">{t('common.confirmDelete')}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('sysMembers.deleteConfirmBody', { name: deleteConfirm.name })}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">{t('common.cancel')}</button>
              <button
                onClick={() => deleteMut.mutate(deleteConfirm.identifier)}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm transition-colors"
                disabled={deleteMut.isPending}
              >
                {deleteMut.isPending ? t('common.deleting') : t('common.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
