import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { api, withBasePath, getServerOrigin } from '@/api/client';
import { useActiveProject } from '@/lib/useActiveProject';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

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

// ── 从系统成员搜索并添加到项目 ────────────────────────────────
function AddMemberModal({ existingIdentifiers, onClose, t }: { existingIdentifiers: Set<string>; onClose: () => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['system-members-search', search],
    queryFn: () => search.trim() ? api.searchSystemMembers(search.trim()) : api.getSystemMembers(),
    staleTime: 500,
  });

  const addMut = useMutation({
    mutationFn: (identifier: string) => api.addProjectMember(identifier),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      setAdding('');
    },
    onError: () => { setAdding(''); },
  });

  async function handleAdd(identifier: string) {
    setAdding(identifier);
    addMut.mutate(identifier);
  }

  const filtered = (results as any[]).filter((m: any) => !existingIdentifiers.has(m.identifier));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{t('members.addFromSystem')}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{t('members.addFromSystemHint')}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">✕</button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100">
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('members.searchSystemMembers')}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div className="px-6 py-3 max-h-[360px] overflow-y-auto">
          {isFetching && !results.length ? (
            <p className="text-sm text-gray-400 text-center py-8">{t('common.loading')}</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-400">{t('members.noSystemMembersToAdd')}</p>
              <p className="text-xs text-gray-300 mt-1">{t('members.goToSystemMembersHint')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((m: any) => (
                <div key={m.identifier} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-indigo-200 transition-colors">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ backgroundColor: m.color || '#6366f1' }}
                  >
                    {initials(m.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{m.name}</span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full',
                        m.type === 'agent' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600')}>
                        {m.type === 'agent' ? '🤖' : '👤'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 font-mono truncate">{m.identifier}</p>
                  </div>
                  <button
                    onClick={() => handleAdd(m.identifier)}
                    disabled={adding === m.identifier}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {adding === m.identifier ? '...' : t('members.addBtn')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 pb-4 pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 py-2.5 rounded-lg transition-colors font-medium"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Agent 接入配置弹窗 ──────────────────────────────────────────
function AgentAccessModal({ member, onClose }: { member: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [bundle, setBundle] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState('');
  const [showTokens, setShowTokens] = useState(false);

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ['agent-tokens', member.identifier],
    queryFn: () => api.getAgentTokens(member.identifier),
    enabled: !!member,
  });

  const activeTokens = (tokens as any[]).filter((t: any) => t.status === 'active');

  function buildBundle(token: string, tokenPrefix?: string) {
    const origin = getServerOrigin();
    const sseUrl = `${origin}${withBasePath('/mcp/sse')}?token=${encodeURIComponent(token)}`;
    return {
      token, tokenPrefix, sseUrl,
      configJson: { mcpServers: { clawpm: { type: 'sse', url: sseUrl } } },
    };
  }

  async function handleGenerate() {
    setCreating(true);
    try {
      const result = await api.getOpenClawConfig(member.identifier);
      setBundle(buildBundle(result.token, result.tokenPrefix));
      qc.invalidateQueries({ queryKey: ['agent-tokens', member.identifier] });
    } finally {
      setCreating(false);
    }
  }

  async function handleRotate(tokenId: number) {
    const result = await api.rotateAgentToken(member.identifier, tokenId, { client_type: 'openclaw', name: `${member.identifier}-openclaw` });
    setBundle(buildBundle(result.token, result.tokenPrefix));
    qc.invalidateQueries({ queryKey: ['agent-tokens', member.identifier] });
  }

  async function handleRevoke(tokenId: number) {
    await api.revokeAgentToken(member.identifier, tokenId);
    qc.invalidateQueries({ queryKey: ['agent-tokens', member.identifier] });
  }

  async function copyText(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: member.color || '#6366f1' }}>
              {(member.name || '?').slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Agent 接入配置</h2>
              <p className="text-xs text-slate-400">{member.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">✕</button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(85vh-72px)]">
          {!bundle ? (
            <div className="text-center py-6">
              <div className="text-4xl mb-4">{'\u{1F511}'}</div>
              <p className="text-sm text-slate-500 mb-5">
                为 <span className="font-medium text-slate-700">{member.name}</span> 生成专属 Token，用于 MCP 接入
              </p>
              <button
                onClick={handleGenerate}
                disabled={creating}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {creating ? (<><span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> 生成中...</>) : '生成 Token'}
              </button>
              {activeTokens.length > 0 && (
                <p className="text-xs text-slate-400 mt-4">已有 {activeTokens.length} 个有效 Token</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold">✓</span>
                <span className="text-emerald-700 font-medium">Token 已生成</span>
              </div>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <span className="text-xs font-semibold text-slate-600">MCP 配置（复制到 mcp.json）</span>
                  <button
                    onClick={() => copyText(JSON.stringify(bundle.configJson, null, 2), 'json')}
                    className={cn('px-3 py-1 rounded-lg text-xs font-medium transition-all',
                      copied === 'json' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-600 text-white hover:bg-indigo-700')}
                  >
                    {copied === 'json' ? '✓ 已复制' : '复制'}
                  </button>
                </div>
                <pre className="px-4 py-3 text-xs text-slate-700 overflow-x-auto bg-white leading-relaxed">{JSON.stringify(bundle.configJson, null, 2)}</pre>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                  <span className="text-xs text-slate-400 flex-shrink-0">SSE</span>
                  <span className="text-xs text-slate-600 truncate flex-1 font-mono">{bundle.sseUrl}</span>
                  <button onClick={() => copyText(bundle.sseUrl, 'sse')} className={cn('text-xs flex-shrink-0 px-2 py-0.5 rounded transition-colors', copied === 'sse' ? 'text-emerald-600' : 'text-indigo-600 hover:text-indigo-700')}>
                    {copied === 'sse' ? '✓' : '复制'}
                  </button>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
                  <span className="text-xs text-slate-400 flex-shrink-0">Token</span>
                  <span className="text-xs text-slate-600 truncate flex-1 font-mono">{bundle.token}</span>
                  <button onClick={() => copyText(bundle.token, 'token')} className={cn('text-xs flex-shrink-0 px-2 py-0.5 rounded transition-colors', copied === 'token' ? 'text-emerald-600' : 'text-indigo-600 hover:text-indigo-700')}>
                    {copied === 'token' ? '✓' : '复制'}
                  </button>
                </div>
              </div>
              <button onClick={handleGenerate} disabled={creating} className="text-xs text-slate-400 hover:text-indigo-600 transition-colors">
                + 再生成一个新 Token
              </button>
            </div>
          )}

          {(tokens as any[]).length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <button onClick={() => setShowTokens(!showTokens)} className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-600 transition-colors w-full">
                <span className={cn('transition-transform inline-block', showTokens && 'rotate-90')}>▸</span>
                <span>已有 Token（{(tokens as any[]).length}）</span>
              </button>
              {showTokens && (
                <div className="mt-3 space-y-1.5">
                  {isLoading ? (
                    <p className="text-xs text-slate-400">加载中...</p>
                  ) : (
                    (tokens as any[]).map((token: any) => (
                      <div key={token.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
                        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', token.status === 'active' ? 'bg-emerald-400' : 'bg-slate-300')} />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-slate-700 font-mono truncate block">{token.tokenPrefix}…</span>
                          <span className="text-[10px] text-slate-400">
                            {token.status === 'active' ? '有效' : '已吊销'}
                            {token.lastUsedAt ? ` · ${new Date(token.lastUsedAt).toLocaleDateString()}` : ''}
                          </span>
                        </div>
                        {token.status === 'active' && (
                          <>
                            <button onClick={() => handleRotate(token.id)} className="text-[11px] text-indigo-500 hover:text-indigo-600">轮换</button>
                            <button onClick={() => handleRevoke(token.id)} className="text-[11px] text-red-400 hover:text-red-500">吊销</button>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Member card ──────────────────────────────────────────────────
function MemberCard({ member, onRemove, onConfigureAgent, t }: { member: any; onRemove: () => void; onConfigureAgent?: () => void; t: (key: string, vars?: Record<string, string | number>) => string }) {
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
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {member.type === 'agent' && onConfigureAgent && (
            <button onClick={onConfigureAgent} className="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-indigo-500 hover:bg-indigo-50 text-xs transition-colors" title="OpenClaw 接入">
              ⚙
            </button>
          )}
          <button onClick={onRemove} className="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-900/20 text-xs transition-colors" title={t('members.removeFromProject')}>✕</button>
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<any>(null);
  const [agentToConfigure, setAgentToConfigure] = useState<any>(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['members', activeProject, typeFilter],
    queryFn: () => api.getMembers(typeFilter || undefined),
  });

  const removeMut = useMutation({
    mutationFn: (identifier: string) => api.removeProjectMember(identifier),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); setRemoveConfirm(null); },
  });

  const humanCount = (members as any[]).filter((m: any) => m.type === 'human').length;
  const agentCount = (members as any[]).filter((m: any) => m.type === 'agent').length;
  const existingIdentifiers = new Set((members as any[]).map((m: any) => m.identifier));

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{t('members.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('members.subtitle')}</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="btn-primary">
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
              key={m.identifier}
              member={m}
              t={t}
              onRemove={() => setRemoveConfirm(m)}
              onConfigureAgent={m.type === 'agent' ? () => setAgentToConfigure(m) : undefined}
            />
          ))}
        </div>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <AddMemberModal existingIdentifiers={existingIdentifiers} t={t} onClose={() => setShowAddModal(false)} />
      )}

      {agentToConfigure && (
        <AgentAccessModal member={agentToConfigure} onClose={() => setAgentToConfigure(null)} />
      )}

      {/* Remove confirm */}
      {removeConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">{t('members.removeFromProjectTitle')}</h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('members.removeFromProjectBody', { name: removeConfirm.name })}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRemoveConfirm(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">{t('common.cancel')}</button>
              <button
                onClick={() => removeMut.mutate(removeConfirm.identifier)}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm transition-colors"
                disabled={removeMut.isPending}
              >
                {removeMut.isPending ? t('common.deleting') : t('members.removeBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
