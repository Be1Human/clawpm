import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Component, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import KanbanBoard from './pages/KanbanBoard';
import TaskList from './pages/TaskList';
import TaskDetail from './pages/TaskDetail';
import Backlog from './pages/Backlog';
import Milestones from './pages/Milestones';
import Goals from './pages/Goals';
import MindMap from './pages/MindMap';
import GanttChart from './pages/GanttChart';
import Members from './pages/Members';
import SystemMembers from './pages/SystemMembers';
import Domains from './pages/Domains';
import CustomFields from './pages/CustomFields';
import MyTasks from './pages/MyTasks';
import MyDashboard from './pages/MyDashboard';
import MyGantt from './pages/MyGantt';
import Iterations from './pages/Iterations';
import IterationDetail from './pages/IterationDetail';
import Archive from './pages/Archive';
import IntakeSubmit from './pages/IntakeSubmit';
import IntakeList from './pages/IntakeList';
import Onboarding from './pages/Onboarding';
import { useCurrentUser } from './lib/useCurrentUser';
import { useAuthSession, clearAuthSession, updateAuthAccount } from './lib/useAuthSession';
import { setCurrentMember, clearCurrentMember } from './lib/useCurrentMember';
import { setOnboarded, clearOnboarded } from './lib/useCurrentUser';
import { api, BASE_PATH, withBasePath } from './api/client';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#fff1f0', minHeight: '100vh' }}>
          <h2 style={{ color: '#cf1322', marginBottom: 12 }}>页面渲染出错</h2>
          <pre style={{ color: '#333', whiteSpace: 'pre-wrap', background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #ffa39e' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            style={{ marginTop: 16, padding: '8px 20px', background: '#1677ff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            onClick={() => { this.setState({ error: null }); window.location.href = withBasePath('/onboarding'); }}
          >
            返回登录页
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function LayoutWrapper() {
  return <Layout><Outlet /></Layout>;
}

/** 全局 loading 占位，防止闪屏 */
function FullScreenLoading() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#f4f5f7',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.4 }}>⏳</div>
        <p style={{ color: '#999', fontSize: 14 }}>正在恢复会话…</p>
      </div>
    </div>
  );
}

/**
 * OnboardingGuard — 防闪屏版本
 *
 * 逻辑：
 * 1. 无 token → 直接跳 /onboarding（未登录）
 * 2. 有 token + 有 currentUser → 直接放行（已完成 onboarding）
 * 3. 有 token 但无 currentUser → 先查 /auth/me 恢复会话，查询期间显示 loading
 *    - 如果 authMe 返回了 currentMember → 自动设置并放行
 *    - 如果没有 currentMember → 跳到 /onboarding 完成绑定
 *    - 如果查询出错（token 过期等）→ 清除 session 跳 /onboarding
 */
function OnboardingGuard() {
  const { isAuthenticated, token } = useAuthSession();
  const currentUser = useCurrentUser();

  // 有 token 但无 currentUser 时，尝试从后端恢复会话
  const { data: authMe, isLoading, isError } = useQuery({
    queryKey: ['auth-me-guard'],
    queryFn: () => api.getAuthMe(),
    enabled: !!token && !currentUser,
    retry: false,
    staleTime: 30_000,
  });

  // 无 token → 未登录，直接去 onboarding
  if (!isAuthenticated) {
    return <Navigate to="/onboarding" replace />;
  }

  // 有 token + 有 currentUser → 已完成 onboarding，直接放行
  if (currentUser) {
    return <LayoutWrapper />;
  }

  // 有 token 但无 currentUser → 正在查询 authMe
  if (isLoading) {
    return <FullScreenLoading />;
  }

  // 查询出错（token 失效）→ 清除并跳转
  if (isError) {
    clearAuthSession();
    clearCurrentMember();
    clearOnboarded();
    return <Navigate to="/onboarding" replace />;
  }

  // authMe 返回了 currentMember → 自动恢复会话
  if (authMe?.currentMember?.identifier) {
    // 同步写入 localStorage，然后放行
    if (authMe.account) updateAuthAccount(authMe.account);
    setCurrentMember(authMe.currentMember.identifier);
    setOnboarded();
    return <LayoutWrapper />;
  }

  // authMe 没有 currentMember → 需要去 onboarding 绑定成员
  return <Navigate to="/onboarding" replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter basename={BASE_PATH || undefined}>
      <Routes>
        {/* 公开页面（无侧边栏、无需引导） */}
        <Route path="/intake/submit" element={<IntakeSubmit />} />
        <Route path="/onboarding" element={<Onboarding />} />

        {/* 需要完成 Onboarding 才能访问的页面 */}
        <Route element={<OnboardingGuard />}>
          {/* 默认入口 → 个人仪表盘 */}
          <Route path="/" element={<Navigate to="/my/dashboard" replace />} />

          {/* ── 个人空间 ── */}
          <Route path="/my/dashboard" element={<MyDashboard />} />
          <Route path="/my/tasks/list" element={<MyTasks defaultView="tree" />} />
          <Route path="/my/tasks/tree" element={<Navigate to="/my/tasks/list" replace />} />
          <Route path="/my/tasks/mindmap" element={<MyTasks defaultView="mindmap" />} />
          <Route path="/my/gantt" element={<MyGantt />} />

          {/* 向后兼容：旧路由重定向 */}
          <Route path="/my-tasks" element={<Navigate to="/my/tasks/list" replace />} />
          <Route path="/my/tasks" element={<Navigate to="/my/tasks/list" replace />} />
          <Route path="/my/board" element={<Navigate to="/my/tasks/list" replace />} />
          <Route path="/my/mindmap" element={<Navigate to="/my/tasks/mindmap" replace />} />
          <Route path="/my/requirements" element={<Navigate to="/my/tasks/list" replace />} />

          {/* ── 项目空间 ── */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/board" element={<KanbanBoard />} />
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/tasks/:taskId" element={<TaskDetail />} />
          <Route path="/backlog" element={<Backlog />} />
          <Route path="/milestones" element={<Milestones />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/requirements" element={<Navigate to="/mindmap" replace />} />
          <Route path="/mindmap" element={<MindMap />} />
          <Route path="/gantt" element={<GanttChart />} />
          <Route path="/members" element={<Members />} />
          <Route path="/system-members" element={<SystemMembers />} />
          <Route path="/domains" element={<Domains />} />
          <Route path="/custom-fields" element={<CustomFields />} />
          <Route path="/iterations" element={<Iterations />} />
          <Route path="/iterations/:id" element={<IterationDetail />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/intake" element={<IntakeList />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
