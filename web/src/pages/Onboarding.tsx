import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { clearAuthSession, getAuthToken, setAuthSession, updateAuthAccount } from '../lib/useAuthSession';
import { clearCurrentMember, setCurrentMember } from '../lib/useCurrentMember';
import { setOnboarded } from '../lib/useCurrentUser';

/* ── helpers ── */
function suggestIdentifier(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '').slice(0, 30);
}

/* ── animated wrapper for step transitions ── */
function StepTransition({ active, direction, children }: { active: boolean; direction: 'forward' | 'backward'; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(active);
  const [animClass, setAnimClass] = useState('');

  useEffect(() => {
    if (active) {
      setMounted(true);
      requestAnimationFrame(() => {
        setAnimClass(direction === 'forward' ? 'step-enter-from-right' : 'step-enter-from-left');
        requestAnimationFrame(() => setAnimClass('step-enter-active'));
      });
    } else if (mounted) {
      setAnimClass(direction === 'forward' ? 'step-exit-to-left' : 'step-exit-to-right');
      const timer = setTimeout(() => setMounted(false), 400);
      return () => clearTimeout(timer);
    }
  }, [active, direction, mounted]);

  if (!mounted) return null;

  return <div className={`absolute inset-0 flex items-center justify-center ${animClass}`}>{children}</div>;
}

/* ── progress dots ── */
function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`transition-all duration-500 ease-out rounded-full ${
            i === current
              ? 'w-8 h-2 bg-indigo-500'
              : i < current
                ? 'w-2 h-2 bg-indigo-300'
                : 'w-2 h-2 bg-slate-200'
          }`}
        />
      ))}
    </div>
  );
}

/* ── floating shapes (background decoration) ── */
function FloatingShapes() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-gradient-to-br from-indigo-200/30 to-purple-200/30 blur-3xl animate-float-slow" />
      <div className="absolute -bottom-32 -left-32 w-[30rem] h-[30rem] rounded-full bg-gradient-to-tr from-sky-200/25 to-indigo-200/25 blur-3xl animate-float-slower" />
      <div className="absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-gradient-to-b from-violet-200/20 to-pink-200/20 blur-3xl animate-float-medium" />
    </div>
  );
}

/* ── feature card on welcome page ── */
function FeatureCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="group relative rounded-2xl bg-white/70 backdrop-blur-sm border border-white/80 shadow-sm hover:shadow-md transition-all duration-300 p-5 cursor-default">
      <div className="text-2xl mb-3">{icon}</div>
      <h3 className="text-sm font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
    </div>
  );
}

/* ── input component ── */
function FormInput({
  label, type = 'text', value, onChange, placeholder, autoFocus, icon,
}: {
  label: string; type?: string; value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div className="group">
      <label className="block text-xs font-medium text-slate-500 mb-1.5 ml-1 group-focus-within:text-indigo-600 transition-colors">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors">
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`w-full rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm text-sm outline-none
            transition-all duration-200
            focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 focus:bg-white
            hover:border-slate-300
            ${icon ? 'pl-10 pr-4' : 'px-4'} py-3`}
        />
      </div>
    </div>
  );
}

/* ── SVG icons (inline, no deps) ── */
const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);
const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const IdIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
  </svg>
);
const SparkleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z" />
  </svg>
);

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════ */
export default function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  /* ── step machine ── */
  type Step = 'welcome' | 'auth' | 'bind';
  const [step, setStep] = useState<Step>('welcome');
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const stepIndex = step === 'welcome' ? 0 : step === 'auth' ? 1 : 2;

  function goTo(next: Step) {
    const order: Step[] = ['welcome', 'auth', 'bind'];
    setDirection(order.indexOf(next) > order.indexOf(step) ? 'forward' : 'backward');
    setStep(next);
  }

  /* ── auth form state ── */
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [bindingLoading, setBindingLoading] = useState(false);
  const [error, setError] = useState('');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  /* ── bind / create member state ── */
  const [createName, setCreateName] = useState('');
  const [createIdentifier, setCreateIdentifier] = useState('');
  const [createRole, setCreateRole] = useState('dev');

  /* ── queries ── */
  const token = getAuthToken();
  const { data: authMe, refetch: refetchAuthMe, isFetching: authFetching, isLoading: authMeLoading, error: authMeError } = useQuery({
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

  /* ── effects ── */
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

  // auto-switch to bind step if logged in but no member
  const needsBinding = !!token && !!authMe && !authMe.currentMember;
  useEffect(() => {
    if (needsBinding && step !== 'bind') goTo('bind');
  }, [needsBinding]);

  // auto-switch to auth step if has token and loading
  useEffect(() => {
    if (token && step === 'welcome') goTo('auth');
  }, [token]);

  const boundIdentifiers = useMemo(
    () => new Set(((authMe?.bindings || []) as any[]).map((item: any) => item.identifier)),
    [authMe],
  );

  /* ── handlers ── */
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
      goTo('bind');
    } catch (err: any) {
      setError(err.message || '操作失败，请重试');
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
    goTo('auth');
  }

  /* ── loading state ── */
  if (token && authMeLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 flex items-center justify-center">
        <FloatingShapes />
        <div className="text-center relative z-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-50 mb-4">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-sm text-slate-400 font-medium">正在恢复登录状态…</p>
        </div>
      </div>
    );
  }

  /* ── total steps shown to user ── */
  const totalSteps = needsBinding ? 3 : 2;

  /* ══════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/50 relative overflow-hidden">
      <FloatingShapes />

      {/* Global CSS for animations */}
      <style>{`
        .step-enter-from-right  { opacity: 0; transform: translateX(60px); }
        .step-enter-from-left   { opacity: 0; transform: translateX(-60px); }
        .step-enter-active      { opacity: 1; transform: translateX(0); transition: all 0.45s cubic-bezier(.22,1,.36,1); }
        .step-exit-to-left      { opacity: 0; transform: translateX(-60px); transition: all 0.35s cubic-bezier(.55,.06,.68,.19); }
        .step-exit-to-right     { opacity: 0; transform: translateX(60px); transition: all 0.35s cubic-bezier(.55,.06,.68,.19); }

        @keyframes float-slow    { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-20px) rotate(3deg); } }
        @keyframes float-medium  { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-15px) rotate(-2deg); } }
        @keyframes float-slower  { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-25px) rotate(2deg); } }
        @keyframes fade-in-up    { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scale-in      { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }

        .animate-float-slow    { animation: float-slow 8s ease-in-out infinite; }
        .animate-float-medium  { animation: float-medium 6s ease-in-out infinite; }
        .animate-float-slower  { animation: float-slower 10s ease-in-out infinite; }
        .animate-fade-in-up    { animation: fade-in-up 0.6s ease-out both; }
        .animate-scale-in      { animation: scale-in 0.5s ease-out both; }
        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
        .delay-300 { animation-delay: 300ms; }
        .delay-400 { animation-delay: 400ms; }
        .delay-500 { animation-delay: 500ms; }
        .delay-600 { animation-delay: 600ms; }
      `}</style>

      {/* ── top bar ── */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200/50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5z" />
              <circle cx="6" cy="9" r="1" fill="white" />
            </svg>
          </div>
          <span className="font-bold text-slate-800 text-sm tracking-tight">ClawPM</span>
        </div>
        <ProgressDots total={totalSteps} current={stepIndex} />
      </div>

      {/* ── step container ── */}
      <div className="relative min-h-screen">
        {/* ═══ STEP 0 — Welcome ═══ */}
        <StepTransition active={step === 'welcome'} direction={direction}>
          <div className="w-full max-w-3xl mx-auto px-6 pt-24 pb-16">
            <div className="text-center mb-12">
              {/* Animated logo */}
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-300/40 mb-8 animate-scale-in">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5H2v7l6.29 6.29c.94.94 2.48.94 3.42 0l3.58-3.58c.94-.94.94-2.48 0-3.42L9 5z" />
                  <circle cx="6" cy="9" r="1" fill="white" />
                </svg>
              </div>

              <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 leading-tight mb-4 animate-fade-in-up">
                欢迎来到 <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">ClawPM</span>
              </h1>
              <p className="text-lg text-slate-500 max-w-md mx-auto animate-fade-in-up delay-100">
                AI 时代的项目管理工具，为人类与 Agent 协作而生
              </p>
            </div>

            {/* Feature cards */}
            <div className="grid sm:grid-cols-3 gap-4 mb-12">
              <div className="animate-fade-in-up delay-200">
                <FeatureCard
                  icon="🎯"
                  title="需求到交付"
                  desc="从用户故事到任务拆解，跟踪每一个工作项的全生命周期"
                />
              </div>
              <div className="animate-fade-in-up delay-300">
                <FeatureCard
                  icon="🤖"
                  title="Agent 原生协作"
                  desc="Agent 和人类在同一个看板上协同，用 MCP 自动接入和汇报"
                />
              </div>
              <div className="animate-fade-in-up delay-400">
                <FeatureCard
                  icon="📊"
                  title="智能洞察"
                  desc="可视化仪表盘、甘特图和思维导图，让项目状态一目了然"
                />
              </div>
            </div>

            {/* CTA */}
            <div className="text-center animate-fade-in-up delay-500">
              <button
                onClick={() => goTo('auth')}
                className="group relative inline-flex items-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-8 py-4 text-white font-semibold shadow-xl shadow-indigo-300/40 hover:shadow-2xl hover:shadow-indigo-300/50 transition-all duration-300 hover:-translate-y-0.5"
              >
                开始使用
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-hover:translate-x-1">
                  <path d="M5 12h14" /><path d="M12 5l7 7-7 7" />
                </svg>
              </button>
              <p className="mt-4 text-xs text-slate-400 animate-fade-in-up delay-600">只需 30 秒即可完成设置</p>
            </div>
          </div>
        </StepTransition>

        {/* ═══ STEP 1 — Auth (Login / Register) ═══ */}
        <StepTransition active={step === 'auth'} direction={direction}>
          <div className="w-full max-w-md mx-auto px-6 pt-24 pb-16">
            <div className="animate-scale-in">
              {/* Card */}
              <div className="rounded-3xl bg-white/80 backdrop-blur-xl shadow-xl shadow-slate-200/50 border border-white/80 p-8">
                {/* Mode toggle */}
                <div className="flex gap-1 rounded-xl bg-slate-100/80 p-1 mb-8">
                  {(['login', 'register'] as const).map(item => (
                    <button
                      key={item}
                      onClick={() => { setMode(item); setError(''); }}
                      className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-300 ${
                        mode === item
                          ? 'bg-white text-indigo-700 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      {item === 'login' ? '登录' : '注册'}
                    </button>
                  ))}
                </div>

                {/* Header */}
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-slate-900">
                    {mode === 'login' ? '欢迎回来' : '创建你的账号'}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                    {mode === 'login'
                      ? '登录后将自动恢复你的工作上下文'
                      : '注册后会自动创建你的成员身份，即刻开始使用'}
                  </p>
                </div>

                {/* Form */}
                <form className="space-y-4" onSubmit={handleAuthSubmit}>
                  <FormInput
                    label="用户名"
                    value={username}
                    onChange={v => { setUsername(v); if (mode === 'register' && !displayName) setDisplayName(v); }}
                    placeholder="例如 alice、zhangsan"
                    autoFocus
                    icon={<UserIcon />}
                  />

                  {mode === 'register' && (
                    <FormInput
                      label="显示名"
                      value={displayName}
                      onChange={setDisplayName}
                      placeholder="例如 张三"
                      icon={<SparkleIcon />}
                    />
                  )}

                  <FormInput
                    label="密码"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="至少 6 位"
                    icon={<LockIcon />}
                  />

                  {error && (
                    <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={authLoading || !username.trim() || !password.trim() || (mode === 'register' && !displayName.trim())}
                    className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3.5 text-sm font-semibold text-white
                      shadow-lg shadow-indigo-200/50 hover:shadow-xl hover:shadow-indigo-300/50
                      disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                      transition-all duration-300 hover:-translate-y-0.5 disabled:hover:translate-y-0"
                  >
                    {authLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        处理中…
                      </span>
                    ) : mode === 'login' ? '登录并进入' : '注册并开始'}
                  </button>
                </form>

                {/* Divider with back link */}
                <div className="mt-6 pt-5 border-t border-slate-100 text-center">
                  <button
                    onClick={() => goTo('welcome')}
                    className="text-xs text-slate-400 hover:text-indigo-500 transition-colors"
                  >
                    ← 返回首页
                  </button>
                </div>
              </div>

              {/* Sub-info below card */}
              <div className="mt-6 text-center">
                <p className="text-xs text-slate-400 leading-relaxed">
                  {mode === 'login' ? '还没有账号？' : '已有账号？'}
                  <button
                    onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
                    className="ml-1 text-indigo-500 hover:text-indigo-600 font-medium transition-colors"
                  >
                    {mode === 'login' ? '立即注册' : '去登录'}
                  </button>
                </p>
              </div>
            </div>
          </div>
        </StepTransition>

        {/* ═══ STEP 2 — Bind Member ═══ */}
        <StepTransition active={step === 'bind'} direction={direction}>
          <div className="w-full max-w-md mx-auto px-6 pt-24 pb-16">
            <div className="animate-scale-in">
              <div className="rounded-3xl bg-white/80 backdrop-blur-xl shadow-xl shadow-slate-200/50 border border-white/80 p-8">
                {/* Header */}
                <div className="mb-6">
                  <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 mb-4">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 9v4" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="10" />
                    </svg>
                    还差最后一步
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">选择你的成员身份</h2>
                  <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                    账号已登录成功！请选择已有的团队成员，或创建一个新身份来开始工作。
                  </p>
                </div>

                {/* Existing members */}
                {(members as any[]).filter((m: any) => m.type === 'human').length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 ml-1">选择已有成员</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                      {(members as any[])
                        .filter((m: any) => m.type === 'human')
                        .map((member: any) => (
                          <button
                            key={member.identifier}
                            onClick={() => handleBindExisting(member.identifier)}
                            disabled={bindingLoading}
                            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left
                              hover:border-indigo-300 hover:bg-indigo-50/50
                              disabled:opacity-50 transition-all duration-200 group"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm"
                                style={{ backgroundColor: member.color || '#6366f1' }}
                              >
                                {(member.name || '?')[0]?.toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold text-slate-800 truncate group-hover:text-indigo-700 transition-colors">
                                  {member.name}
                                </div>
                                <div className="text-xs text-slate-400 truncate">@{member.identifier}</div>
                              </div>
                              {boundIdentifiers.has(member.identifier) && (
                                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-500">已绑定</span>
                              )}
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300 group-hover:text-indigo-400 transition-colors">
                                <path d="M9 18l6-6-6-6" />
                              </svg>
                            </div>
                          </button>
                        ))}
                    </div>
                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100" /></div>
                      <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-slate-300">或者</span></div>
                    </div>
                  </div>
                )}

                {/* Create new member */}
                <div className="space-y-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">创建新成员</h3>
                  <FormInput
                    label="显示名"
                    value={createName}
                    onChange={v => { setCreateName(v); if (!createIdentifier) setCreateIdentifier(suggestIdentifier(v)); }}
                    placeholder="例如 张三"
                    icon={<UserIcon />}
                  />
                  <FormInput
                    label="成员标识"
                    value={createIdentifier}
                    onChange={v => setCreateIdentifier(suggestIdentifier(v))}
                    placeholder="例如 zhangsan"
                    icon={<IdIcon />}
                  />
                  <div className="group">
                    <label className="block text-xs font-medium text-slate-500 mb-1.5 ml-1">角色</label>
                    <select
                      value={createRole}
                      onChange={e => setCreateRole(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm px-4 py-3 text-sm outline-none
                        transition-all duration-200 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 hover:border-slate-300"
                    >
                      <option value="dev">🛠 开发工程师</option>
                      <option value="pm">📋 产品经理</option>
                      <option value="design">🎨 设计师</option>
                      <option value="mgr">📊 项目管理</option>
                      <option value="other">💡 其他</option>
                    </select>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      {error}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleResetSession}
                      className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600
                        hover:bg-slate-50 hover:border-slate-300 transition-all duration-200"
                    >
                      退出登录
                    </button>
                    <button
                      onClick={handleCreateAndBind}
                      disabled={bindingLoading || !createName.trim() || !createIdentifier.trim() || authFetching}
                      className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-semibold text-white
                        shadow-lg shadow-indigo-200/50 hover:shadow-xl hover:shadow-indigo-300/50
                        disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                        transition-all duration-300 hover:-translate-y-0.5 disabled:hover:translate-y-0"
                    >
                      {bindingLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          处理中…
                        </span>
                      ) : '创建并进入'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </StepTransition>
      </div>
    </div>
  );
}
