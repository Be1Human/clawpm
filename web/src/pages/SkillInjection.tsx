import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  FolderGit2,
  LoaderCircle,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVaultSession } from '@/vault/session';
import {
  getSkillInjectionTargets,
  injectSkill as injectAgentSkill,
  installRecommendedSkill,
  type SkillInjectionStatus,
  type SkillInjectionTarget,
  type SkillPlatform,
  type SkillScope,
} from '@/vault/desktop';

const PLATFORM_ORDER: SkillPlatform[] = ['claude', 'cursor', 'codex', 'codebuddy'];

const PLATFORM_STYLE: Record<SkillPlatform, { badge: string; initials: string }> = {
  claude: { badge: 'bg-orange-100 text-orange-700', initials: 'CL' },
  cursor: { badge: 'bg-gray-900 text-white', initials: 'CU' },
  codex: { badge: 'bg-emerald-100 text-emerald-700', initials: 'CX' },
  codebuddy: { badge: 'bg-violet-100 text-violet-700', initials: 'CB' },
};

const STATUS_VIEW: Record<SkillInjectionStatus, { label: string; className: string }> = {
  not_installed: { label: '未安装', className: 'border-gray-200 bg-gray-50 text-gray-500' },
  current: { label: '已安装', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  update_available: { label: '需更新', className: 'border-amber-200 bg-amber-50 text-amber-700' },
};

function scopeLabel(scope: SkillScope) {
  return scope === 'user' ? '所有项目' : '仅当前项目';
}

function actionLabel(target: SkillInjectionTarget) {
  if (target.status === 'current') return '已安装';
  return target.status === 'not_installed' ? '安装' : '更新';
}

export default function SkillInjection() {
  const vault = useVaultSession();
  const projectPath = vault.status === 'ready' ? vault.vault.projectPath : '';
  const [running, setRunning] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const query = useQuery({
    queryKey: ['skill-injection-targets', projectPath],
    queryFn: () => getSkillInjectionTargets(projectPath),
    enabled: Boolean(projectPath),
  });

  const targets = query.data ?? [];
  const userTargets = targets.filter(target => target.scope === 'user');
  const ready = userTargets.length === PLATFORM_ORDER.length && userTargets.every(target => target.status === 'current');
  const pendingUserCount = userTargets.filter(target => target.status !== 'current').length;
  const installedUserCount = userTargets.filter(target => target.status === 'current').length;
  const userStatusCards = PLATFORM_ORDER.map(platform => ({
    platform,
    target: userTargets.find(target => target.platform === platform),
  }));
  const grouped = useMemo(() => PLATFORM_ORDER.map(platform => ({
    platform,
    targets: targets.filter(target => target.platform === platform),
  })), [targets]);

  async function installTarget(target: SkillInjectionTarget) {
    if (!projectPath) throw new Error('请先打开 ClawPM 项目。');
    return injectAgentSkill({ projectPath, platform: target.platform, scope: target.scope });
  }

  async function installRecommended() {
    setRunning('recommended');
    setNotice(null);
    try {
      const result = await installRecommendedSkill(projectPath);
      await query.refetch();
      if (result.failures.length > 0) {
        setNotice({
          kind: 'error',
          text: `已完成 ${result.installedPlatforms} 个平台，还有 ${result.failures.length} 个没有装好。点一下“重新安装”即可继续。`,
        });
      } else {
        setNotice({ kind: 'success', text: '安装完成。4 个平台的用户 Skill 与当前项目 Agent 规范均已自动配置。' });
      }
    } catch (error) {
      setNotice({ kind: 'error', text: (error as Error).message || '安装失败，请重试。' });
    } finally {
      setRunning('');
    }
  }

  async function runOne(target: SkillInjectionTarget) {
    const key = `${target.platform}:${target.scope}`;
    setRunning(key);
    setNotice(null);
    try {
      const result = await installTarget(target);
      setNotice({
        kind: 'success',
        text: `${target.platformName} 已${result.changed ? '安装完成' : '是最新版本'}${result.backupPath ? '，旧版本已自动备份' : ''}。`,
      });
      await query.refetch();
    } catch (error) {
      setNotice({ kind: 'error', text: (error as Error).message || '安装失败，请重试。' });
    } finally {
      setRunning('');
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="mx-auto max-w-5xl space-y-5 px-6 py-8">
        <header className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
            <Bot className="h-6 w-6" />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Agent Skill 安装中心</p>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">一键把 ClawPM 工作流装进 Agent</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
            不用找目录，不用复制文件，不用理解配置。点一次即可自动安装到 Claude、Cursor、Codex 和 CodeBuddy。
          </p>
        </header>

        {!query.isLoading && !query.isError && (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" aria-label="Agent Skill 安装状态">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">当前安装状态</h2>
                <p className="mt-1 text-xs text-gray-500">这里显示的是用户级 Skill，安装一次后可供所有项目使用。</p>
              </div>
              <span className={cn(
                'rounded-full border px-3 py-1 text-xs font-semibold',
                ready
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-indigo-200 bg-indigo-50 text-indigo-700',
              )}>
                {installedUserCount}/4 已就绪
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {userStatusCards.map(({ platform, target }) => {
                const style = PLATFORM_STYLE[platform];
                const status = target ? STATUS_VIEW[target.status] : STATUS_VIEW.not_installed;
                return (
                  <article key={platform} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center gap-2.5">
                      <span className={cn('flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[10px] font-bold', style.badge)}>
                        {style.initials}
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-xs font-semibold text-gray-900">{target?.platformName ?? platform}</h3>
                        <p className="text-[10px] text-gray-400">所有项目</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', status.className)}>
                        {status.label}
                      </span>
                      <span className="text-[10px] text-gray-400">自动检测</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {query.isLoading ? (
          <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-gray-200 bg-white px-6 shadow-sm">
            <LoaderCircle className="h-8 w-8 animate-spin text-indigo-600" />
            <p className="mt-4 text-sm font-medium text-gray-700">正在准备安装…</p>
          </section>
        ) : query.isError ? (
          <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 text-center">
            <CircleAlert className="h-9 w-9 text-red-500" />
            <h2 className="mt-3 font-semibold text-red-800">暂时无法准备安装</h2>
            <p className="mt-1 text-sm text-red-600">无需修改任何配置，点一下重试即可。</p>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
            >
              <RefreshCw className="h-4 w-4" />
              重新检测
            </button>
          </section>
        ) : ready ? (
          <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white px-6 text-center shadow-sm">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-9 w-9" />
            </span>
            <h2 className="mt-4 text-xl font-semibold text-gray-900">已经装好了</h2>
            <p className="mt-2 text-sm text-gray-500">Claude、Cursor、Codex 和 CodeBuddy 都可以直接使用 ClawPM 工作流。</p>
            <div className="mt-5 flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-xs font-medium text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              后续更新也只需再点一次
            </div>
            <button
              type="button"
              onClick={() => void installRecommended()}
              disabled={running === 'recommended'}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-60"
            >
              {running === 'recommended' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {running === 'recommended' ? '正在同步配置…' : '重新同步全部配置'}
            </button>
          </section>
        ) : (
          <section className="relative min-h-64 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-600 px-6 py-10 text-center text-white shadow-lg shadow-indigo-200">
            <Sparkles className="absolute right-8 top-7 h-8 w-8 text-white/20" />
            <div className="relative mx-auto max-w-xl">
              <h2 className="text-xl font-semibold">一键安装到 4 个 Agent 平台</h2>
              <p className="mt-2 text-sm leading-6 text-indigo-100">
                自动补齐 {pendingUserCount || 4} 个平台的用户配置，并同步当前项目的 Agent 工作流规范。
              </p>
              <button
                type="button"
                onClick={() => void installRecommended()}
                disabled={running === 'recommended'}
                className="mt-7 inline-flex min-w-56 items-center justify-center gap-2 rounded-xl bg-white px-7 py-3.5 text-base font-semibold text-indigo-700 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-80"
              >
                {running === 'recommended' ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                {running === 'recommended' ? '正在自动安装…' : notice?.kind === 'error' ? '重新安装' : '立即一键安装'}
              </button>
              <p className="mt-3 text-xs text-indigo-200">无需管理员权限 · 当前项目规范会随 Git 共享给团队</p>
            </div>
          </section>
        )}

        {notice && (
          <div className={cn(
            'flex items-start justify-center gap-2 rounded-xl border px-4 py-3 text-sm',
            notice.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700',
          )}>
            {notice.kind === 'success' ? <Check className="mt-0.5 h-4 w-4 flex-none" /> : <CircleAlert className="mt-0.5 h-4 w-4 flex-none" />}
            <span>{notice.text}</span>
          </div>
        )}

        <details className="group overflow-hidden rounded-xl border border-gray-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-4 text-sm text-gray-600 hover:bg-gray-50">
            <span className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-gray-400" />
              高级设置
              <span className="text-xs text-gray-400">通常不需要打开</span>
            </span>
            <ChevronDown className="h-4 w-4 text-gray-400 transition group-open:rotate-180" />
          </summary>

          <div className="border-t border-gray-100 bg-gray-50/60 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">按平台或项目单独配置</h2>
                <p className="mt-1 text-xs text-gray-500">只有需要把 Skill 随 Git 分享给团队时，才使用“仅当前项目”。</p>
              </div>
              <button
                type="button"
                onClick={() => void query.refetch()}
                disabled={Boolean(running) || query.isFetching}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', query.isFetching && 'animate-spin')} />
                刷新
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {grouped.map(({ platform, targets: platformTargets }) => {
                const first = platformTargets[0];
                const style = PLATFORM_STYLE[platform];
                return (
                  <article key={platform} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                    <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
                      <span className={cn('flex h-9 w-9 flex-none items-center justify-center rounded-lg text-[11px] font-bold', style.badge)}>
                        {style.initials}
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{first?.platformName ?? platform}</h3>
                        <p className="text-[11px] text-gray-400">自动维护，无需手工复制文件</p>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {platformTargets.map(target => {
                        const key = `${target.platform}:${target.scope}`;
                        const status = STATUS_VIEW[target.status];
                        const active = running === key;
                        return (
                          <div key={target.scope} className="space-y-2.5 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 text-xs font-medium text-gray-700">
                                {target.scope === 'user' ? <UserRound className="h-3.5 w-3.5 text-gray-400" /> : <FolderGit2 className="h-3.5 w-3.5 text-gray-400" />}
                                {scopeLabel(target.scope)}
                              </div>
                              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', status.className)}>
                                {status.label}
                              </span>
                            </div>
                            <div className="truncate rounded-md bg-gray-50 px-2.5 py-1.5 font-mono text-[10px] text-gray-400" title={target.path}>
                              {target.path}
                            </div>
                            {target.additionalPaths.map(additionalPath => (
                              <div key={additionalPath} className="truncate rounded-md bg-gray-50 px-2.5 py-1.5 font-mono text-[10px] text-gray-400" title={additionalPath}>
                                {additionalPath}
                              </div>
                            ))}
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => void runOne(target)}
                                disabled={Boolean(running) || target.status === 'current'}
                                className={cn(
                                  'inline-flex min-w-20 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition disabled:cursor-default',
                                  target.status === 'current'
                                    ? 'bg-emerald-50 text-emerald-700 disabled:opacity-100'
                                    : 'bg-gray-900 text-white hover:bg-indigo-600 disabled:opacity-45',
                                )}
                              >
                                {active ? <LoaderCircle className="h-3 w-3 animate-spin" /> : target.status === 'current' ? <Check className="h-3 w-3" /> : null}
                                {active ? '处理中…' : actionLabel(target)}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </details>

        <p className="text-center text-xs text-gray-400">
          安装会自动保留旧版本备份；大多数 Agent 会立即识别，新建过配置目录的平台可能需要重新打开一次。
        </p>
      </div>
    </div>
  );
}
