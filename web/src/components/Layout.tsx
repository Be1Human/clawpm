import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useRecentTasks } from '@/lib/useRecentTasks';
import { useFavorites } from '@/lib/useFavorites';
import { api, setActiveProject } from '@/api/client';
import { useI18n } from '@/lib/i18n';
import logoImg from '@/assets/logo.png';
import CommandPalette from './CommandPalette';
import { reopenVault, useVaultSession } from '@/vault/session';
import { getSkillInjectionTargets, isElectronRuntime } from '@/vault/desktop';

// ── 导航结构（单机 lite：去除个人/项目双空间与多人协作项） ────────
const NAV_GROUPS = [
  {
    labelKey: 'nav.productPlanning',
    items: [
      { to: '/mindmap',      labelKey: 'nav.mindMap',         icon: MapIcon },
    ],
  },
  {
    labelKey: 'nav.executionTracking',
    items: [
      { to: '/workflow',    labelKey: 'nav.agentWorkflow', icon: OverviewIcon },
      { to: '/board',       labelKey: 'nav.kanban',      icon: BoardIcon },
      { to: '/tasks',       labelKey: 'nav.taskListNav', icon: ListIcon },
      { to: '/gantt',       labelKey: 'nav.ganttChart',  icon: GanttIcon },
      { to: '/backlog',     labelKey: 'nav.backlog',     icon: PoolIcon },
      { to: '/milestones',  labelKey: 'nav.milestones',  icon: MilestoneIcon },
    ],
  },
  {
    labelKey: 'nav.settings',
    items: [
      { to: '/domains',        labelKey: 'nav.domains',        icon: DomainIcon },
      { to: '/custom-fields',  labelKey: 'nav.customFields',   icon: FieldsIcon },
      { to: '/members',        labelKey: 'nav.members',        icon: MembersIcon },
      { to: '/archive',        labelKey: 'nav.archive',        icon: ArchiveIcon },
    ],
  },
];

// ── SVG 图标（16×16 轮廓风格） ────────────────────────────────────
function OverviewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    </svg>
  );
}
function MyTasksIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M5 8.5l2 2 4-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TreeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="2.5" r="1.5" />
      <circle cx="3" cy="11" r="1.5" />
      <circle cx="13" cy="11" r="1.5" />
      <path d="M8 4v3M8 7l-5 2.5M8 7l5 2.5" strokeLinecap="round" />
    </svg>
  );
}
function MapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="2" />
      <circle cx="2.5" cy="4" r="1.5" />
      <circle cx="13.5" cy="4" r="1.5" />
      <circle cx="2.5" cy="12" r="1.5" />
      <circle cx="13.5" cy="12" r="1.5" />
      <path d="M4 4.5 6.5 6.5M11 4.5 9.5 6.5M4 11.5 6.5 9.5M11 11.5 9.5 9.5" strokeLinecap="round" />
    </svg>
  );
}
function GanttIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="3" width="7" height="2.5" rx="1" />
      <rect x="5" y="7" width="9" height="2.5" rx="1" />
      <rect x="2" y="11" width="5" height="2.5" rx="1" />
    </svg>
  );
}
function BoardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="3" width="3.5" height="10" rx="1" />
      <rect x="6.5" y="3" width="3.5" height="7" rx="1" />
      <rect x="11" y="3" width="3.5" height="12" rx="1" />
    </svg>
  );
}
function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="5" y1="4" x2="14" y2="4" strokeLinecap="round" />
      <line x1="5" y1="8" x2="14" y2="8" strokeLinecap="round" />
      <line x1="5" y1="12" x2="14" y2="12" strokeLinecap="round" />
      <circle cx="2.5" cy="4" r="1" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="2.5" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function PoolIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 5h12M2 8h9M2 11h6" strokeLinecap="round" />
      <circle cx="13" cy="11" r="2" />
      <path d="M13 9.5v1.2m0 0 .8.8m-.8-.8-.8.8" strokeLinecap="round" />
    </svg>
  );
}
function MilestoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 8h2M12 8h2" strokeLinecap="round" />
      <path d="M8 2v2M8 12v2" strokeLinecap="round" />
      <rect x="4.5" y="4.5" width="7" height="7" rx="1" transform="rotate(45 8 8)" />
    </svg>
  );
}
function GoalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.5" />
      <circle cx="8" cy="8" r="3.5" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function DomainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="2" width="13" height="12" rx="2" />
      <line x1="6" y1="2" x2="6" y2="14" />
      <line x1="10.5" y1="2" x2="10.5" y2="14" />
    </svg>
  );
}
function FieldsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="12" height="3" rx="1" />
      <rect x="2" y="6.5" width="12" height="3" rx="1" />
      <rect x="2" y="11" width="12" height="3" rx="1" />
      <line x1="6" y1="2" x2="6" y2="5" />
      <line x1="6" y1="6.5" x2="6" y2="9.5" />
      <line x1="6" y1="11" x2="6" y2="14" />
    </svg>
  );
}
function MembersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6" cy="5" r="2.5" />
      <path d="M1 13c0-2.76 2.24-5 5-5s5 2.24 5 5" strokeLinecap="round" />
      <circle cx="12" cy="5.5" r="2" />
      <path d="M10.5 13c.5-1.8 1.7-3.2 3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}
function IterationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function SystemMembersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.5" />
      <circle cx="8" cy="6" r="2" />
      <path d="M4.5 12.5c0-2 1.6-3.5 3.5-3.5s3.5 1.5 3.5 3.5" strokeLinecap="round" />
    </svg>
  );
}
function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="2" width="13" height="3.5" rx="1" />
      <path d="M2.5 5.5v7.5a1 1 0 001 1h9a1 1 0 001-1V5.5" />
      <path d="M6 8.5h4" strokeLinecap="round" />
    </svg>
  );
}
function SkillIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M5.5 2.5h5a2 2 0 012 2v7a2 2 0 01-2 2h-5a2 2 0 01-2-2v-7a2 2 0 012-2z" />
      <path d="M6 6h4M6 9h4M8 2.5v-1M6.5 1.5h3" strokeLinecap="round" />
      <circle cx="6.2" cy="11.3" r=".6" fill="currentColor" stroke="none" />
      <circle cx="9.8" cy="11.3" r=".6" fill="currentColor" stroke="none" />
    </svg>
  );
}
function InboxIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 9.5h3.5l1 2h3l1-2H14" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 2.5h9l1.5 7v4a1 1 0 01-1 1H3a1 1 0 01-1-1v-4l1.5-7z" />
    </svg>
  );
}
function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 1.5l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9L4.4 12.6l.7-4-2.9-2.8 4-.6L8 1.5z" strokeLinejoin="round" />
    </svg>
  );
}
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Sidebar 组件 ─────────────────────────────────────────────────
export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, locale, setLocale } = useI18n();
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const { recentTasks } = useRecentTasks();
  const { favorites } = useFavorites();
  const vaultSession = useVaultSession();
  const desktop = isElectronRuntime();
  const projectPath = vaultSession.status === 'ready' ? vaultSession.vault.projectPath : '';
  const skillTargetsQuery = useQuery({
    queryKey: ['skill-injection-targets', projectPath],
    queryFn: () => getSkillInjectionTargets(projectPath),
    enabled: desktop && Boolean(projectPath),
  });
  const userSkillTargets = (skillTargetsQuery.data ?? []).filter(target => target.scope === 'user');
  const installedSkillCount = userSkillTargets.filter(target => target.status === 'current').length;
  const outdatedSkillCount = userSkillTargets.filter(target => target.status === 'update_available').length;
  const skillStatus = skillTargetsQuery.isLoading
    ? { label: '正在检测安装状态', dot: 'bg-slate-300' }
    : skillTargetsQuery.isError
      ? { label: '点击查看并重新检测', dot: 'bg-rose-500' }
      : installedSkillCount === 4
        ? { label: '4/4 平台已就绪', dot: 'bg-emerald-500' }
        : outdatedSkillCount > 0
          ? { label: `${outdatedSkillCount} 个平台需要更新`, dot: 'bg-amber-500' }
          : { label: `${4 - installedSkillCount} 个平台等待安装`, dot: 'bg-indigo-500' };

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdkOpen(prev => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const navGroups = NAV_GROUPS;


  // 最近打开过的需求库（后端从用户目录的 vaults.json 读）
  const { data: apiVaultInfo } = useQuery({
    queryKey: ['vaults'],
    queryFn: () => api.getVaults(),
    enabled: !desktop,
  });
  const vaultInfo = desktop
    ? {
        current: vaultSession.status === 'ready' ? vaultSession.vault.path : null,
        currentName: vaultSession.status === 'ready' ? vaultSession.vault.name : null,
        recent: vaultSession.recent,
      }
    : apiVaultInfo;
  const [switching, setSwitching] = useState(false);

  async function handleSwitchVault(target: string) {
    if (!target || target === vaultInfo?.current || switching) return;
    setSwitching(true);
    if (desktop) {
      try {
        await reopenVault(target);
        await queryClient.invalidateQueries();
      } catch (error) {
        alert((error as Error).message);
      } finally {
        setSwitching(false);
      }
      return;
    }
    try {
      await api.switchVault(target);
      setActiveProject('default');
      // 整页刷新：切库换掉了整个内存库，任何缓存都不再对应当前库
      window.location.reload();
    } catch (e) {
      setSwitching(false);
      alert(`切换失败: ${(e as Error).message}`);
    }
  }

  return (
    <div className={cn('flex overflow-hidden', desktop ? 'h-full' : 'h-screen')} style={{ backgroundColor: '#f4f5f7' }}>
      {/* Sidebar */}
      <aside
        className="w-[220px] flex-shrink-0 flex flex-col border-r"
        style={{ backgroundColor: '#ffffff', borderColor: '#e8eaed' }}
      >
        {/* Logo / workspace */}
        <div className="h-[52px] flex items-center px-4 border-b" style={{ borderColor: '#e8eaed' }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={logoImg}
              alt="ClawPM"
              className="w-8 h-8 flex-shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 leading-none truncate">ClawPM</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{t('nav.projectManagement')}</p>
            </div>
          </div>
        </div>

        {/* 最近打开过的需求库，切换即替换整个内存库，因此需要整页刷新。 */}
        <div className="px-3 py-2 border-b" style={{ borderColor: '#e8eaed' }}>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">需求库</label>
          <div className="relative">
            <select
              value={vaultInfo?.current ?? ''}
              onChange={e => handleSwitchVault(e.target.value)}
              disabled={switching}
              title={vaultInfo?.current ?? ''}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-gray-800 appearance-none cursor-pointer hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-all disabled:opacity-60"
            >
              {(vaultInfo?.recent ?? []).map((v: any) => (
                <option key={v.path} value={v.path}>{v.name}</option>
              ))}
              {!vaultInfo?.recent?.length && <option value="">{vaultInfo?.currentName ?? '（当前库）'}</option>}
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                <path d="M2 3.5L5 6.5L8 3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <p className="mt-1 text-[10px] text-gray-400 truncate" title={vaultInfo?.current ?? ''}>
            {switching ? '正在切换…' : vaultInfo?.current ?? ''}
          </p>
        </div>

        {desktop && (
          <div className="border-b px-3 py-3" style={{ borderColor: '#e8eaed' }}>
            <NavLink
              to="/skill-injection"
              className={({ isActive }) => cn(
                'block rounded-xl border px-3 py-2.5 shadow-sm transition-all',
                isActive
                  ? 'border-indigo-300 bg-indigo-50 ring-2 ring-indigo-100'
                  : 'border-indigo-200 bg-gradient-to-br from-indigo-50 to-violet-50 hover:border-indigo-300 hover:shadow',
              )}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold text-indigo-800">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white">
                  <SkillIcon className="h-4 w-4" />
                </span>
                安装 Agent Skill
              </span>
              <span className="mt-1.5 flex items-center gap-1.5 pl-9 text-[10px] font-medium text-slate-500">
                <span className={cn('h-2 w-2 rounded-full', skillStatus.dot)} />
                {skillStatus.label}
              </span>
            </NavLink>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {/* 收藏 */}
          {favorites.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">
                {t('nav.favorites')}
              </p>
              <div className="space-y-0.5">
                {favorites.slice(0, 5).map(f => (
                  <button
                    key={f.taskId}
                    onClick={() => navigate(`/tasks/${f.taskId}`)}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-[12px] text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all"
                  >
                    <StarIcon className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span className="truncate">{f.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 最近访问 */}
          {recentTasks.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">
                {t('nav.recentlyViewed')}
              </p>
              <div className="space-y-0.5">
                {recentTasks.slice(0, 5).map(t => (
                  <button
                    key={t.taskId}
                    onClick={() => navigate(`/tasks/${t.taskId}`)}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-[12px] text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all"
                  >
                    <ClockIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {navGroups.map((group) => (
            <div key={group.labelKey}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">
                {t(group.labelKey)}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={false}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-all duration-150',
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 font-medium'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-indigo-600' : 'text-gray-400')} />
                        {t(item.labelKey)}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer — 单机本地模式标识 */}
        <div className="px-3 py-3 border-t" style={{ borderColor: '#e8eaed' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 bg-indigo-500">
              L
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">本地</p>
              <p className="text-[10px] text-gray-400 truncate">单机模式 · 文本存储</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Top bar with search and notifications */}
        <div className="h-[52px] flex items-center justify-between px-4 border-b flex-shrink-0" style={{ backgroundColor: '#ffffff', borderColor: '#e8eaed' }}>
          <button
            onClick={() => setCmdkOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors w-64"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" strokeLinecap="round" />
            </svg>
            <span>{t('nav.searchTasks')}</span>
            <kbd className="ml-auto text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">Ctrl+K</kbd>
          </button>
          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <button
              onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title={t('lang.switchTo')}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="6.5" />
                <path d="M1.5 8h13M8 1.5c-2 2-2.5 4-2.5 6.5s.5 4.5 2.5 6.5M8 1.5c2 2 2.5 4 2.5 6.5s-.5 4.5-2.5 6.5" />
              </svg>
              <span>{locale === 'en' ? 'EN' : '中'}</span>
            </button>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto flex flex-col min-w-0 min-h-0">
          {children}
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} />
    </div>
  );
}
