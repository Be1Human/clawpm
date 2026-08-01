import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  Check,
  CircleAlert,
  FolderGit2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVaultSession } from '@/vault/session';
import {
  getSkillInjectionTargets,
  injectSkill as injectAgentSkill,
  type SkillInjectionResult,
  type SkillInjectionStatus,
  type SkillInjectionTarget,
  type SkillPlatform,
  type SkillScope,
} from '@/vault/desktop';

const PLATFORM_ORDER: SkillPlatform[] = ['claude', 'cursor', 'codex', 'codebuddy'];

const PLATFORM_STYLE: Record<SkillPlatform, { badge: string; initials: string }> = {
  claude: { badge: 'bg-orange-100 text-orange-700', initials: 'CL' },
  cursor: { badge: 'bg-slate-900 text-white', initials: 'CU' },
  codex: { badge: 'bg-emerald-100 text-emerald-700', initials: 'CX' },
  codebuddy: { badge: 'bg-violet-100 text-violet-700', initials: 'CB' },
};

const STATUS_VIEW: Record<SkillInjectionStatus, { label: string; className: string }> = {
  not_installed: { label: '未安装', className: 'border-slate-200 bg-slate-50 text-slate-500' },
  current: { label: '已是最新', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  update_available: { label: '可更新', className: 'border-amber-200 bg-amber-50 text-amber-700' },
};

function scopeLabel(scope: SkillScope) {
  return scope === 'user' ? '用户级' : '当前项目';
}

function actionLabel(target: SkillInjectionTarget) {
  if (target.status === 'current') return '已安装';
  return target.status === 'not_installed' ? '注入 Skill' : '更新 Skill';
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
  const grouped = useMemo(() => PLATFORM_ORDER.map(platform => ({
    platform,
    targets: targets.filter(target => target.platform === platform),
  })), [targets]);

  async function installTarget(target: SkillInjectionTarget, silent = false): Promise<SkillInjectionResult> {
    if (!projectPath) throw new Error('请先打开 ClawPM 项目。');
    const result = await injectAgentSkill({
      projectPath,
      platform: target.platform,
      scope: target.scope,
    });
    if (!silent) {
      const backup = result.backupPath ? `；旧版本已备份到 ${result.backupPath}` : '';
      setNotice({ kind: 'success', text: `${target.platformName} ${scopeLabel(target.scope)} Skill 已完成${backup}` });
    }
    return result;
  }

  async function runOne(target: SkillInjectionTarget) {
    const key = `${target.platform}:${target.scope}`;
    setRunning(key);
    setNotice(null);
    try {
      await installTarget(target);
      await query.refetch();
    } catch (error) {
      setNotice({ kind: 'error', text: (error as Error).message || 'Skill 注入失败。' });
    } finally {
      setRunning('');
    }
  }

  async function runScope(scope: SkillScope) {
    const pending = targets.filter(target => target.scope === scope && target.status !== 'current');
    if (pending.length === 0) {
      setNotice({ kind: 'success', text: `${scopeLabel(scope)}的 4 个平台均已是最新版本。` });
      return;
    }
    setRunning(`all:${scope}`);
    setNotice(null);
    const backups: string[] = [];
    let completed = 0;
    try {
      for (const target of pending) {
        const result = await installTarget(target, true);
        if (result.backupPath) backups.push(result.backupPath);
        completed += 1;
      }
      setNotice({
        kind: 'success',
        text: `已向 ${pending.length} 个${scopeLabel(scope)}平台注入 ClawPM Skill${backups.length ? `，并备份 ${backups.length} 份旧版本` : ''}。`,
      });
      await query.refetch();
    } catch (error) {
      const message = (error as Error).message || '批量注入失败。';
      setNotice({ kind: 'error', text: `已完成 ${completed}/${pending.length} 个目标，随后失败：${message}` });
      await query.refetch();
    } finally {
      setRunning('');
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50/70">
      <div className="mx-auto max-w-6xl space-y-5 px-6 py-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-indigo-600">
              <Bot className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-[0.16em]">Agent 配置</span>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">Skill 注入</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              将 ClawPM 项目工作流安装到常用 Coding Agent，让 Agent 学会在 `.clawpm` 中拆分、创建、领取、执行、测试和验收任务。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void query.refetch()}
            disabled={Boolean(running) || query.isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', query.isFetching && 'animate-spin')} />
            刷新状态
          </button>
        </header>

        <section className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => void runScope('user')}
            disabled={Boolean(running) || query.isLoading}
            className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-600 px-4 py-3 text-left text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            <span className="flex items-center gap-3">
              <span className="rounded-lg bg-white/15 p-2"><UserRound className="h-5 w-5" /></span>
              <span>
                <span className="block text-sm font-semibold">一键注入全部用户级 Skill</span>
                <span className="mt-0.5 block text-xs text-indigo-100">对所有项目可用，不写入当前 Git 仓库</span>
              </span>
            </span>
            {running === 'all:user' && <LoaderCircle className="h-5 w-5 animate-spin" />}
          </button>
          <button
            type="button"
            onClick={() => void runScope('project')}
            disabled={Boolean(running) || query.isLoading}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-slate-800 shadow-sm transition hover:border-indigo-300 disabled:opacity-50"
          >
            <span className="flex items-center gap-3">
              <span className="rounded-lg bg-slate-100 p-2 text-slate-600"><FolderGit2 className="h-5 w-5" /></span>
              <span>
                <span className="block text-sm font-semibold">一键注入全部项目级 Skill</span>
                <span className="mt-0.5 block text-xs text-slate-500">写入当前项目，可跟随 Git 分享给团队</span>
              </span>
            </span>
            {running === 'all:project' && <LoaderCircle className="h-5 w-5 animate-spin text-indigo-600" />}
          </button>
        </section>

        {notice && (
          <div className={cn(
            'flex items-start gap-2 rounded-xl border px-4 py-3 text-sm',
            notice.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-red-200 bg-red-50 text-red-700',
          )}>
            {notice.kind === 'success' ? <Check className="mt-0.5 h-4 w-4 flex-none" /> : <CircleAlert className="mt-0.5 h-4 w-4 flex-none" />}
            <span className="break-all">{notice.text}</span>
          </div>
        )}

        {query.isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            正在检测各平台 Skill…
          </div>
        ) : query.isError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            无法读取 Skill 状态：{(query.error as Error).message}
          </div>
        ) : (
          <section className="grid gap-4 lg:grid-cols-2">
            {grouped.map(({ platform, targets: platformTargets }) => {
              const first = platformTargets[0];
              const style = PLATFORM_STYLE[platform];
              return (
                <article key={platform} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-4">
                    <span className={cn('flex h-10 w-10 flex-none items-center justify-center rounded-xl text-xs font-bold', style.badge)}>
                      {style.initials}
                    </span>
                    <div className="min-w-0">
                      <h2 className="font-semibold text-slate-900">{first?.platformName ?? platform}</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{first?.note}</p>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {platformTargets.map(target => {
                      const key = `${target.platform}:${target.scope}`;
                      const status = STATUS_VIEW[target.status];
                      const active = running === key;
                      return (
                        <div key={target.scope} className="space-y-3 px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                              {target.scope === 'user' ? <UserRound className="h-4 w-4 text-slate-400" /> : <FolderGit2 className="h-4 w-4 text-slate-400" />}
                              {scopeLabel(target.scope)}
                            </div>
                            <span className={cn('rounded-full border px-2 py-1 text-[11px] font-medium', status.className)}>
                              {status.label}
                            </span>
                          </div>
                          <div className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] leading-5 text-slate-500 break-all" title={target.path}>
                            {target.path}
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] text-slate-400">
                              已识别 {target.installedFileCount}/{target.totalFileCount} 个规范文件
                            </span>
                            <button
                              type="button"
                              onClick={() => void runOne(target)}
                              disabled={Boolean(running) || target.status === 'current'}
                              className={cn(
                                'inline-flex min-w-24 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition disabled:cursor-default',
                                target.status === 'current'
                                  ? 'bg-emerald-50 text-emerald-700 disabled:opacity-100'
                                  : 'bg-slate-900 text-white hover:bg-indigo-600 disabled:opacity-45',
                              )}
                            >
                              {active ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : target.status === 'current' ? <Check className="h-3.5 w-3.5" /> : null}
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
          </section>
        )}

        <section className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-4 text-xs leading-5 text-indigo-800">
          <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-indigo-600" />
          <div>
            <div className="font-semibold">安全注入策略</div>
            <p className="mt-1 text-indigo-700">
              ClawPM 只允许写入上方列出的 8 个固定目标，不接受自定义路径。更新已有 Skill 时会先把整个旧目录备份到 ClawPM 用户数据目录，再替换为安装包内置版本。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
