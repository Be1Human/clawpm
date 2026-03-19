import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useActiveProject } from '@/lib/useActiveProject';
import { useActiveSpace, type Space } from '@/lib/useActiveSpace';
import { useCurrentUser, clearCurrentUser, isOnboarded, clearOnboarded } from '@/lib/useCurrentUser';
import { clearAuthSession, useAuthSession } from '@/lib/useAuthSession';
import { useRecentTasks } from '@/lib/useRecentTasks';
import { useFavorites } from '@/lib/useFavorites';
import { api, setActiveProject } from '@/api/client';
import { useI18n } from '@/lib/i18n';
import IdentityPicker from './IdentityPicker';
import logoImg from '@/assets/logo.png';
import CommandPalette from './CommandPalette';
import NotificationBell from './NotificationPanel';

// ── 导航结构（个人空间） ─────────────────────────────────────────
const PERSONAL_NAV_GROUPS = [
  {
    labelKey: 'nav.myWorkbench',
    items: [
      { to: '/my/dashboard', labelKey: 'nav.myDashboard', icon: OverviewIcon, exact: true },
    ],
  },
  {
    labelKey: 'nav.myPlanning',
    items: [
      { to: '/my/tasks/mindmap', labelKey: 'nav.mindMap', icon: MapIcon },
    ],
  },
  {
    labelKey: 'nav.executionTracking',
    items: [
      { to: '/my/tasks/list', labelKey: 'nav.taskList', icon: ListIcon },
      { to: '/my/gantt', labelKey: 'nav.ganttChart', icon: GanttIcon },
    ],
  },
];

// ── 导航结构（项目空间） ─────────────────────────────────────────
const PROJECT_NAV_GROUPS = [
  {
    labelKey: 'nav.projectOverview',
    items: [
      { to: '/dashboard', labelKey: 'nav.projectDashboard', icon: OverviewIcon, exact: true },
    ],
  },
  {
    labelKey: 'nav.productPlanning',
    items: [
      { to: '/mindmap',      labelKey: 'nav.mindMap',         icon: MapIcon },
    ],
  },
  {
    labelKey: 'nav.executionTracking',
    items: [
      { to: '/board',       labelKey: 'nav.kanban',      icon: BoardIcon },
      { to: '/tasks',       labelKey: 'nav.taskListNav', icon: ListIcon },
      { to: '/gantt',       labelKey: 'nav.ganttChart',  icon: GanttIcon },
      { to: '/backlog',     labelKey: 'nav.backlog',     icon: PoolIcon },
      { to: '/iterations',  labelKey: 'nav.iterations',  icon: IterationIcon },
      { to: '/intake',      labelKey: 'nav.inbox',       icon: InboxIcon },
    ],
  },
  {
    labelKey: 'nav.goalManagement',
    items: [
      { to: '/milestones', labelKey: 'nav.milestones', icon: MilestoneIcon },
      { to: '/goals',      labelKey: 'nav.goals',      icon: GoalIcon },
    ],
  },
  {
    labelKey: 'nav.settings',
    items: [
      { to: '/domains',       labelKey: 'nav.domains',      icon: DomainIcon },
      { to: '/custom-fields', labelKey: 'nav.customFields', icon: FieldsIcon },
      { to: '/members',       labelKey: 'nav.members',      icon: MembersIcon },
      { to: '/archive',       labelKey: 'nav.archive',      icon: ArchiveIcon },
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
function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.5" y="2" width="13" height="3.5" rx="1" />
      <path d="M2.5 5.5v7.5a1 1 0 001 1h9a1 1 0 001-1V5.5" />
      <path d="M6 8.5h4" strokeLinecap="round" />
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
  const qc = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { t, locale, setLocale } = useI18n();
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [showIdentityPicker, setShowIdentityPicker] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const activeSlug = useActiveProject();
  const currentUser = useCurrentUser();
  const { account } = useAuthSession();
  const [space, setSpace] = useActiveSpace();
  const { recentTasks } = useRecentTasks();
  const { favorites } = useFavorites();

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

  // 根据当前路由自动切换空间
  useEffect(() => {
    const isPersonalRoute = location.pathname.startsWith('/my/') || location.pathname === '/my';
    if (isPersonalRoute && space !== 'personal') setSpace('personal');
    else if (!isPersonalRoute && space !== 'project' && !location.pathname.startsWith('/tasks/')) setSpace('project');
  }, [location.pathname]);

  // 手动切换空间时导航到对应首页
  const handleSwitchSpace = (target: 'personal' | 'project') => {
    if (target === space) return;
    setSpace(target);
    if (target === 'personal') navigate('/my/dashboard');
    else navigate('/dashboard');
  };

  const navGroups = space === 'personal' ? PERSONAL_NAV_GROUPS : PROJECT_NAV_GROUPS;

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.getProjects(),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: () => api.getMembers(),
  });

  const activeProject = (projects as any[]).find((p: any) => p.slug === activeSlug);
  const currentMember = (members as any[]).find((m: any) => m.identifier === currentUser);

  // Auto-show identity picker only for users who completed onboarding but want to switch identity.
  // First-time setup is now handled by the /onboarding page.
  // Only show if identifier becomes stale (member deleted from project).
  useEffect(() => {
    if ((members as any[]).length > 0 && currentUser && isOnboarded()) {
      if (!(members as any[]).find((m: any) => m.identifier === currentUser)) {
        // stored identifier not found in current project members — 弹出身份选择器
        // 注意：不要清除 currentUser / onboarded，否则会和 OnboardingGuard 形成闪屏循环
        setShowIdentityPicker(true);
      }
    }
  }, [currentUser, members]);

  function handleSwitchProject(slug: string) {
    setActiveProject(slug);
    // 清除所有非 projects 的查询缓存，强制用新 slug 重新拉取
    qc.removeQueries({ predicate: q => q.queryKey[0] !== 'projects' });
    qc.invalidateQueries();
  }

  async function handleCreateProject() {
    if (!newProjectName.trim()) return;
    await api.createProject({ name: newProjectName.trim() });
    setNewProjectName('');
    setShowCreateProject(false);
    qc.invalidateQueries({ queryKey: ['projects'] });
  }

  function handleLogout() {
    api.logout().catch(() => undefined);
    clearAuthSession();
    clearCurrentUser();
    clearOnboarded();
    navigate('/onboarding');
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#f4f5f7' }}>
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

        {/* 项目切换器 */}
        <div className="px-3 py-2 border-b" style={{ borderColor: '#e8eaed' }}>
          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1 block">{t('nav.project')}</label>
          <div className="relative">
            <select
              value={activeSlug}
              onChange={e => handleSwitchProject(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-gray-800 appearance-none cursor-pointer hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 transition-all"
            >
              {(projects as any[]).map((p: any) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                <path d="M2 3.5L5 6.5L8 3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          {showCreateProject ? (
            <div className="mt-1.5 flex gap-1">
              <input
                autoFocus
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') setShowCreateProject(false); }}
                placeholder={t('nav.projectNamePlaceholder')}
                className="flex-1 min-w-0 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300"
              />
              <button onClick={handleCreateProject} className="flex-shrink-0 text-xs bg-indigo-600 text-white px-2 py-1 rounded-lg hover:bg-indigo-700">{t('nav.confirm')}</button>
            </div>
          ) : (
            <button
              onClick={() => setShowCreateProject(true)}
              className="mt-1 text-[10px] text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              {t('nav.newProject')}
            </button>
          )}
        </div>

        {/* 空间切换 Tab */}
        <div className="px-3 py-2 border-b" style={{ borderColor: '#e8eaed' }}>
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {([['personal', t('nav.personalSpace')], ['project', t('nav.projectSpace')]] as [Space, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => handleSwitchSpace(key)}
                className={cn(
                  'flex-1 text-[11px] font-medium py-1.5 rounded-md transition-all duration-150',
                  space === key
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

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
                    end={'exact' in item ? item.exact : false}
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

        {/* Footer — Identity */}
        <div className="px-3 py-3 border-t" style={{ borderColor: '#e8eaed' }}>
          {currentUser && currentMember ? (
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                style={{ backgroundColor: currentMember.color || '#6366f1' }}
              >
                {(currentMember.name || '?')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{currentMember.name}</p>
                <p className="text-[10px] text-gray-400 truncate">{account?.username || currentMember.identifier}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowIdentityPicker(true)}
                  className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                  title={t('nav.switchIdentity')}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M11.5 6A4.5 4.5 0 0 0 3 4.5M2.5 8A4.5 4.5 0 0 0 11 9.5" strokeLinecap="round" />
                    <path d="M3 2v2.5H.5M11 12V9.5h2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <button
                  onClick={handleLogout}
                  className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                  title="退出登录"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M5 2.5H3.5A1.5 1.5 0 0 0 2 4v6a1.5 1.5 0 0 0 1.5 1.5H5" strokeLinecap="round" />
                    <path d="M8.5 4.5 11 7l-2.5 2.5M11 7H5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowIdentityPicker(true)}
              className="w-full text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 py-2 rounded-lg transition-colors cursor-pointer"
            >
              {t('nav.selectIdentity')}
            </button>
          )}
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
            <NotificationBell />
          </div>
        </div>
        <main className="flex-1 overflow-y-auto flex flex-col min-w-0 min-h-0">
          {children}
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} />

      {/* Identity Picker Modal */}
      <IdentityPicker open={showIdentityPicker} onClose={() => setShowIdentityPicker(false)} />
    </div>
  );
}
