import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const nav = [
  { to: '/', label: '仪表盘', icon: '⬡', exact: true },
  { to: '/board', label: '看板', icon: '◫' },
  { to: '/requirements', label: '需求树', icon: '◈' },
  { to: '/mindmap', label: '思维导图', icon: '◉' },
  { to: '/gantt', label: '甘特图', icon: '▤' },
  { to: '/tasks', label: '任务', icon: '☑' },
  { to: '/backlog', label: '需求池', icon: '⊞' },
  { to: '/milestones', label: '里程碑', icon: '⬟' },
  { to: '/goals', label: '目标', icon: '◎' },
  { to: '/members', label: '团队成员', icon: '👥' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-[#0f1117] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col border-r border-slate-800/80">
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-brand-500/30">
              C
            </div>
            <span className="font-semibold text-slate-100 tracking-tight">ClawPM</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150',
                  isActive
                    ? 'bg-brand-500/15 text-brand-400 font-medium'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                )
              }
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800/80">
          <div className="text-xs text-slate-600">ClawPM v1.3</div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        {children}
      </main>
    </div>
  );
}
