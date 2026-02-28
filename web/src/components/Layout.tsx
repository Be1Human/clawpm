import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

// ── 导航结构（分组） ─────────────────────────────────────────────
const NAV_GROUPS = [
  {
    label: '工作台',
    items: [
      { to: '/',     label: '仪表盘',  icon: OverviewIcon, exact: true },
    ],
  },
  {
    label: '产品规划',
    items: [
      { to: '/requirements', label: '需求树',   icon: TreeIcon },
      { to: '/mindmap',      label: '思维导图', icon: MapIcon },
      { to: '/gantt',        label: '甘特图',   icon: GanttIcon },
    ],
  },
  {
    label: '执行跟踪',
    items: [
      { to: '/board',        label: '看板',     icon: BoardIcon },
      { to: '/tasks',        label: '任务列表', icon: ListIcon },
      { to: '/backlog',      label: '需求池',   icon: PoolIcon },
    ],
  },
  {
    label: '目标管理',
    items: [
      { to: '/milestones',   label: '里程碑',   icon: MilestoneIcon },
      { to: '/goals',        label: '目标',     icon: GoalIcon },
    ],
  },
  {
    label: '团队',
    items: [
      { to: '/members',      label: '成员',     icon: MembersIcon },
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

// ── Sidebar 组件 ─────────────────────────────────────────────────
export default function Layout({ children }: { children: React.ReactNode }) {
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
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' }}
            >
              C
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 leading-none truncate">ClawPM</p>
              <p className="text-[10px] text-gray-400 mt-0.5">项目管理</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">
                {group.label}
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
                        {item.label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t" style={{ borderColor: '#e8eaed' }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-400">v1.3</span>
            <span className="text-[10px] text-gray-300">ClawPM</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        {children}
      </main>
    </div>
  );
}
