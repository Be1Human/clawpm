import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { clearAuthSession, getAuthToken, setAuthSession, updateAuthAccount } from '../lib/useAuthSession';
import { clearCurrentMember, setCurrentMember } from '../lib/useCurrentMember';
import { setOnboarded } from '../lib/useCurrentUser';

function suggestIdentifier(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '').slice(0, 30);
}

export default function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [bindingLoading, setBindingLoading] = useState(false);
  const [error, setError] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [createName, setCreateName] = useState('');
  const [createIdentifier, setCreateIdentifier] = useState('');
  const [createRole, setCreateRole] = useState('dev');

  const token = getAuthToken();
  const { data: authMe, refetch: refetchAuthMe, isFetching: authFetching, error: authMeError } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => api.getAuthMe(),
    enabled: !!token,
    retry: false,
  });

  const { data: members = [] } = useQuery<any[]>({
    queryKey: ['members', 'human'],
    queryFn: () => api.getMembers('human'),
    enabled: !!token && !!authMe && !authMe.currentMember,
  });

  useEffect(() => {
    if (authMe?.account) updateAuthAccount(authMe.account);
  }, [authMe]);

  useEffect(() => {
    if (authMe?.currentMember?.identifier) {
      setCurrentMember(authMe.currentMember.identifier);
      setOnboarded();
      navigate('/my/dashboard', { replace: true });
    }
  }, [authMe, navigate]);

  useEffect(() => {
    if (authMeError) {
      clearAuthSession();
      clearCurrentMember();
    }
  }, [authMeError]);

  const boundIdentifiers = useMemo(
    () => new Set(((authMe?.bindings || []) as any[]).map((item: any) => item.identifier)),
    [authMe],
  );

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (authLoading) return;
    setAuthLoading(true);
    setError('');
    try {
      const result = mode === 'login'
        ? await api.login({ username: username.trim(), password })
        : await api.register({
            username: username.trim(),
            password,
            display_name: displayName.trim() || username.trim(),
            auto_create_member: true,
          });

      setAuthSession({ token: result.token, account: result.account });
      if (result.currentMember?.identifier) {
        setCurrentMember(result.currentMember.identifier);
        setOnboarded();
        navigate('/my/dashboard', { replace: true });
        return;
      }

      clearCurrentMember();
      await refetchAuthMe();
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleBindExisting(identifier: string) {
    if (bindingLoading) return;
    setBindingLoading(true);
    setError('');
    try {
      const result = await api.selectMember({ member_identifier: identifier });
      setCurrentMember(result.currentMember.identifier);
      setOnboarded();
      await qc.invalidateQueries();
      navigate('/my/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || '绑定失败');
    } finally {
      setBindingLoading(false);
    }
  }

  async function handleCreateAndBind() {
    if (bindingLoading || !createName.trim() || !createIdentifier.trim()) return;
    setBindingLoading(true);
    setError('');
    try {
      const result = await api.selectMember({
        create_member: {
          name: createName.trim(),
          identifier: createIdentifier.trim(),
          role: createRole,
        },
      });
      setCurrentMember(result.currentMember.identifier);
      setOnboarded();
      await qc.invalidateQueries();
      navigate('/my/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.message || '创建成员失败');
    } finally {
      setBindingLoading(false);
    }
  }

  function handleResetSession() {
    clearAuthSession();
    clearCurrentMember();
    setError('');
  }

  const needsBinding = !!token && !!authMe && !authMe.currentMember;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-indigo-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.05fr_0.95fr] gap-6">
        <div className="rounded-3xl bg-gray-900 text-white p-8 lg:p-10 shadow-2xl">
          <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm">
            <span className="font-semibold">ClawPM</span>
            <span className="text-white/60">账号登录 + Agent Token</span>
          </div>
          <h1 className="mt-8 text-4xl font-bold leading-tight">人用账号登录，Agent 用绑定 token 接入</h1>
          <p className="mt-4 text-sm leading-7 text-white/70">
            首次注册后会自动尝试创建并绑定你的成员身份。对于 OpenClaw 和其他 Agent，只需要在成员页生成专属 token，
            然后把系统给出的配置包导入即可。
          </p>
          <div className="mt-10 space-y-4 text-sm">
            {[
              '人类用户：账号登录后默认保持登录态，进入项目时自动恢复当前成员上下文。',
              'Agent 用户：使用独立 token 访问 MCP，SSE 和 stdio 都能自动识别身份。',
              'OpenClaw 接入：生成专属 SSE 地址、token 和一键配置包，减少手工配置。',
            ].map(item => (
              <div key={item} className="flex items-start gap-3 rounded-2xl bg-white/5 px-4 py-3">
                <div className="mt-1 h-2.5 w-2.5 rounded-full bg-indigo-300" />
                <div className="text-white/80">{item}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl bg-white shadow-xl border border-slate-200 p-6 lg:p-8">
          {!needsBinding ? (
            <>
              <div className="flex gap-2 rounded-2xl bg-slate-100 p-1 mb-6">
                {(['login', 'register'] as const).map(item => (
                  <button
                    key={item}
                    onClick={() => { setMode(item); setError(''); }}
                    className={`flex-1 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors ${
                      mode === item ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {item === 'login' ? '登录' : '注册'}
                  </button>
                ))}
              </div>

              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900">{mode === 'login' ? '欢迎回来' : '创建账号'}</h2>
                <p className="mt-2 text-sm text-slate-500">
                  {mode === 'login'
                    ? '登录后会自动恢复你的成员上下文。'
                    : '注册后会尝试自动创建同名成员，整个流程尽量压缩到最少步骤。'}
                </p>
              </div>

              <form className="space-y-4" onSubmit={handleAuthSubmit}>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">用户名</label>
                  <input
                    value={username}
                    onChange={e => {
                      setUsername(e.target.value);
                      if (mode === 'register' && !displayName) setDisplayName(e.target.value);
                    }}
                    placeholder="alice / zhangsan"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  />
                </div>
                {mode === 'register' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">显示名</label>
                    <input
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="张三"
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">密码</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="至少 6 位"
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                  />
                </div>
                {error && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
                <button
                  type="submit"
                  disabled={authLoading || !username.trim() || !password.trim() || (mode === 'register' && !displayName.trim())}
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {authLoading ? '处理中...' : mode === 'login' ? '登录并进入' : '注册并进入'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-6">
                <div className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  还差最后一步
                </div>
                <h2 className="mt-4 text-2xl font-bold text-slate-900">绑定你的项目成员身份</h2>
                <p className="mt-2 text-sm text-slate-500">
                  你的账号已经登录成功，但当前项目里还没有绑定成员。你可以直接绑定已有成员，或者马上新建一个人类成员。
                </p>
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {(members as any[])
                  .filter((member: any) => member.type === 'human')
                  .map((member: any) => (
                    <button
                      key={member.identifier}
                      onClick={() => handleBindExisting(member.identifier)}
                      disabled={bindingLoading}
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-left hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-60"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                          style={{ backgroundColor: member.color || '#6366f1' }}
                        >
                          {(member.name || '?')[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-900 truncate">{member.name}</div>
                          <div className="text-xs text-slate-500 truncate">@{member.identifier}</div>
                        </div>
                        {boundIdentifiers.has(member.identifier) && (
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">已绑定</span>
                        )}
                      </div>
                    </button>
                  ))}
              </div>

              <div className="my-6 h-px bg-slate-200" />

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">新建并绑定成员</h3>
                <input
                  value={createName}
                  onChange={e => {
                    setCreateName(e.target.value);
                    if (!createIdentifier) setCreateIdentifier(suggestIdentifier(e.target.value));
                  }}
                  placeholder="显示名"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
                <input
                  value={createIdentifier}
                  onChange={e => setCreateIdentifier(suggestIdentifier(e.target.value))}
                  placeholder="成员标识"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
                <select
                  value={createRole}
                  onChange={e => setCreateRole(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                >
                  <option value="dev">开发</option>
                  <option value="pm">产品</option>
                  <option value="design">设计</option>
                  <option value="mgr">项目管理</option>
                  <option value="other">其他</option>
                </select>
                {error && <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
                <div className="flex gap-3">
                  <button
                    onClick={handleResetSession}
                    className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    退出并重来
                  </button>
                  <button
                    onClick={handleCreateAndBind}
                    disabled={bindingLoading || !createName.trim() || !createIdentifier.trim() || authFetching}
                    className="flex-1 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bindingLoading ? '处理中...' : '创建并进入'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
