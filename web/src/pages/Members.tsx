import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

// ── Utility ──────────────────────────────────────────────────────
function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}

function Avatar({ member }: { member: any }) {
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
      style={{ backgroundColor: member.color }}
    >
      {initials(member.name)}
    </div>
  );
}

// ── Create/Edit modal ─────────────────────────────────────────────
const PRESET_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4'];

function MemberModal({ member, onClose, t }: { member?: any; onClose: () => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
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
    mutationFn: () => api.createMember(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); onClose(); },
  });

  const updateMut = useMutation({
    mutationFn: () => api.updateMember(member!.identifier, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); onClose(); },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.identifier) return;
    isEdit ? updateMut.mutate() : createMut.mutate();
  }

  const pending = createMut.isPending || updateMut.isPending;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">{isEdit ? t('members.editMember') : t('members.createMember')}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
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
                    form.color === c ? 'border-white scale-110' : 'border-transparent')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">{t('members.displayName')}</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="zhang-san / cursor-agent-01" required />
            </div>
            <div className="col-span-2">
              <label className="label">{t('members.identifierLabel')}</label>
              <input
                className="input"
                value={form.identifier}
                onChange={e => setForm(f => ({ ...f, identifier: e.target.value }))}
                placeholder="zhang-san / cursor-agent-01"
                disabled={isEdit}
                required
              />
              <p className="text-xs text-slate-600 mt-1">{t('members.identifierHint')}</p>
            </div>
            <div>
              <label className="label">{t('members.typeLabel')}</label>
              <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="human">{t('members.humanOption')}</option>
                <option value="agent">{t('members.agentOption')}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">{t('members.descriptionLabel')}</label>
            <textarea className="input min-h-[60px]" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t('members.descPlaceholder')} />
          </div>

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-ghost">{t('common.cancel')}</button>
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? t('common.saving') : isEdit ? t('members.saveChanges') : t('members.createMember')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AgentAccessModal({ member, onClose }: { member: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [bundle, setBundle] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ['agent-tokens', member.identifier],
    queryFn: () => api.getAgentTokens(member.identifier),
    enabled: !!member,
  });

  async function handleGenerate() {
    setCreating(true);
    try {
      const result = await api.getOpenClawConfig(member.identifier);
      setBundle(result);
      qc.invalidateQueries({ queryKey: ['agent-tokens', member.identifier] });
    } finally {
      setCreating(false);
    }
  }

  async function handleRotate(tokenId: number) {
    const result = await api.rotateAgentToken(member.identifier, tokenId, { client_type: 'openclaw', name: `${member.identifier}-openclaw` });
    setBundle({
      token: result.token,
      tokenPrefix: result.tokenPrefix,
      sseUrl: `${window.location.origin}/mcp/sse?token=${encodeURIComponent(result.token)}`,
      configJson: {
        mcpServers: {
          clawpm: {
            type: 'sse',
            url: `${window.location.origin}/mcp/sse?token=${encodeURIComponent(result.token)}`,
          },
        },
      },
      powershellCommand: `$cfg = @'\n${JSON.stringify({
        mcpServers: { clawpm: { type: 'sse', url: `${window.location.origin}/mcp/sse?token=${encodeURIComponent(result.token)}` } },
      }, null, 2)}\n'@; Set-Content -Path .\\mcp.json -Value $cfg`,
      shellCommand: `cat <<'EOF' > mcp.json\n${JSON.stringify({
        mcpServers: { clawpm: { type: 'sse', url: `${window.location.origin}/mcp/sse?token=${encodeURIComponent(result.token)}` } },
      }, null, 2)}\nEOF`,
    });
    qc.invalidateQueries({ queryKey: ['agent-tokens', member.identifier] });
  }

  async function handleRevoke(tokenId: number) {
    await api.revokeAgentToken(member.identifier, tokenId);
    qc.invalidateQueries({ queryKey: ['agent-tokens', member.identifier] });
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[88vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">OpenClaw 接入配置</h2>
            <p className="text-sm text-slate-500 mt-1">{member.name} · {member.identifier}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(88vh-80px)]">
          <div className="flex items-start justify-between gap-4 rounded-2xl bg-indigo-50 border border-indigo-100 p-4">
            <div>
              <p className="text-sm font-semibold text-indigo-900">一键生成 OpenClaw 配置</p>
              <p className="text-sm text-indigo-700 mt-1">点击后会创建一个新的 Agent token，并返回专属 SSE 地址、JSON 配置和复制命令。</p>
            </div>
            <button
              onClick={handleGenerate}
              disabled={creating}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {creating ? '生成中...' : '生成配置'}
            </button>
          </div>

          {bundle && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-900">SSE 地址</p>
                    <button onClick={() => copyText(bundle.sseUrl)} className="text-xs text-indigo-600">复制</button>
                  </div>
                  <p className="text-xs text-slate-600 break-all">{bundle.sseUrl}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-900">本次生成的 token</p>
                    <button onClick={() => copyText(bundle.token)} className="text-xs text-indigo-600">复制</button>
                  </div>
                  <p className="text-xs text-slate-600 break-all">{bundle.token}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-900">OpenClaw / MCP JSON 配置</p>
                  <button onClick={() => copyText(JSON.stringify(bundle.configJson, null, 2))} className="text-xs text-indigo-600">复制 JSON</button>
                </div>
                <pre className="text-xs bg-slate-50 rounded-xl p-3 overflow-x-auto text-slate-700">{JSON.stringify(bundle.configJson, null, 2)}</pre>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-900">PowerShell</p>
                    <button onClick={() => copyText(bundle.powershellCommand)} className="text-xs text-indigo-600">复制</button>
                  </div>
                  <pre className="text-xs bg-slate-50 rounded-xl p-3 overflow-x-auto text-slate-700 whitespace-pre-wrap break-all">{bundle.powershellCommand}</pre>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-900">Shell</p>
                    <button onClick={() => copyText(bundle.shellCommand)} className="text-xs text-indigo-600">复制</button>
                  </div>
                  <pre className="text-xs bg-slate-50 rounded-xl p-3 overflow-x-auto text-slate-700 whitespace-pre-wrap break-all">{bundle.shellCommand}</pre>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-900 mb-3">已有 token</p>
            {isLoading ? (
              <p className="text-sm text-slate-500">加载中...</p>
            ) : (tokens as any[]).length === 0 ? (
              <p className="text-sm text-slate-500">还没有任何 token，点击上方按钮生成第一份配置即可。</p>
            ) : (
              <div className="space-y-2">
                {(tokens as any[]).map((token: any) => (
                  <div key={token.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{token.name || token.tokenPrefix}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {token.tokenPrefix} · {token.clientType} · {token.status}
                        {token.lastUsedAt ? ` · 最近使用 ${new Date(token.lastUsedAt).toLocaleString()}` : ' · 尚未使用'}
                      </p>
                    </div>
                    <button onClick={() => handleRotate(token.id)} className="text-xs text-indigo-600 hover:text-indigo-700">轮换</button>
                    <button onClick={() => handleRevoke(token.id)} className="text-xs text-red-500 hover:text-red-600">吊销</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Member card ──────────────────────────────────────────────────
function MemberCard({ member, onEdit, onDelete, onConfigureAgent, t }: { member: any; onEdit: () => void; onDelete: () => void; onConfigureAgent?: () => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
  return (
    <div className="card p-4 group hover:border-slate-700 transition-colors">
      <div className="flex items-start gap-3">
        <Avatar member={member} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-slate-100 truncate">{member.name}</span>
            <span className={cn('text-xs px-1.5 py-0.5 rounded', member.type === 'agent' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400')}>
              {member.type === 'agent' ? '🤖 Agent' : '👤 Human'}
            </span>
          </div>
          <p className="text-xs text-slate-600 font-mono mb-1">{member.identifier}</p>
          {member.description && (
            <p className="text-xs text-slate-500 line-clamp-2">{member.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
            <span>{t('members.taskCountLabel', { count: member.taskCount || 0 })}</span>
            <span>{t('members.activeCountLabel', { count: member.activeCount || 0 })}</span>
          </div>
        </div>
        {/* Action buttons (show on hover) */}
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {member.type === 'agent' && onConfigureAgent && (
            <button onClick={onConfigureAgent} className="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-indigo-500 hover:bg-indigo-50 text-xs transition-colors" title="OpenClaw 接入">
              ⚙
            </button>
          )}
          <button onClick={onEdit} className="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 text-xs transition-colors" title={t('common.edit')}>✎</button>
          <button onClick={onDelete} className="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-900/20 text-xs transition-colors" title={t('common.delete')}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────
export default function Members() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const activeProject = useActiveProject();
  const [typeFilter, setTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editMember, setEditMember] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [agentToConfigure, setAgentToConfigure] = useState<any>(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['members', activeProject, typeFilter],
    queryFn: () => api.getMembers(typeFilter || undefined),
  });

  const deleteMut = useMutation({
    mutationFn: (identifier: string) => api.deleteMember(identifier),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); setDeleteConfirm(null); },
  });

  const humanCount = (members as any[]).filter((m: any) => m.type === 'human').length;
  const agentCount = (members as any[]).filter((m: any) => m.type === 'agent').length;

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{t('members.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('members.subtitle')}</p>
        </div>
        <button onClick={() => { setEditMember(null); setShowModal(true); }} className="btn-primary">
          {t('members.addMember')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: t('members.allMembers'), value: (members as any[]).length },
          { label: t('members.humanLabel'), value: humanCount },
          { label: t('members.agentLabel'), value: agentCount },
        ].map(stat => (
          <div key={stat.label} className="card px-4 py-3">
            <p className="text-xs text-slate-500">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-100 mt-0.5">{stat.value}</p>
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
              typeFilter === val ? 'bg-brand-600 text-white' : 'text-slate-400 hover:bg-slate-800')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Member list */}
      {isLoading ? (
        <div className="text-slate-500 text-sm py-8 text-center">{t('common.loading')}</div>
      ) : (members as any[]).length === 0 ? (
        <div className="text-center py-16 text-slate-600">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-sm">{t('members.noMembers')}</p>
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
              onConfigureAgent={m.type === 'agent' ? () => setAgentToConfigure(m) : undefined}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <MemberModal member={editMember} t={t} onClose={() => { setShowModal(false); setEditMember(null); }} />
      )}

      {agentToConfigure && (
        <AgentAccessModal member={agentToConfigure} onClose={() => setAgentToConfigure(null)} />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">{t('common.confirmDelete')}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('members.deleteConfirmBody', { name: deleteConfirm.name })}
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
