import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Component, useEffect, type ReactNode } from 'react';
import Layout from './components/Layout';
import KanbanBoard from './pages/KanbanBoard';
import TaskList from './pages/TaskList';
import TaskDetail from './pages/TaskDetail';
import Backlog from './pages/Backlog';
import Milestones from './pages/Milestones';
import MindMap from './pages/MindMap';
import GanttChart from './pages/GanttChart';
import Domains from './pages/Domains';
import CustomFields from './pages/CustomFields';
import Archive from './pages/Archive';
import Members from './pages/Members';
import Workflow from './pages/Workflow';
import { setCurrentMember, getCurrentMember } from './lib/useCurrentMember';
import { setCurrentUser, setOnboarded } from './lib/useCurrentUser';
import { withBasePath } from './api/client';
import VaultGateway from './components/VaultGateway';
import DesktopTitleBar from './components/DesktopTitleBar';
import { isElectronRuntime } from './vault/desktop';

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
            onClick={() => { this.setState({ error: null }); window.location.href = withBasePath('/mindmap'); }}
          >
            返回首页
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * LocalGuard — 单机模式入口（clawpm-lite）
 * 无登录/无引导：种入固定本地身份 'local'，API 通过 legacy token 直连本地服务。
 * 原多人协作的 OnboardingGuard / 账号会话 / 成员绑定已移除。
 */
function LocalGuard() {
  useEffect(() => {
    if (!getCurrentMember()) setCurrentMember('local');
    setCurrentUser('local');
    setOnboarded();
  }, []);
  return <Layout><Outlet /></Layout>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <div className="flex h-screen flex-col">
        {isElectronRuntime() && <DesktopTitleBar />}
        <div className="min-h-0 flex-1">
        <VaultGateway>
          <Routes>
          <Route element={<LocalGuard />}>
            {/* 默认入口 → 思维导图（需求树核心视图） */}
            <Route path="/" element={<Navigate to="/mindmap" replace />} />

            <Route path="/mindmap" element={<MindMap />} />
            <Route path="/board" element={<KanbanBoard />} />
            <Route path="/workflow" element={<Workflow />} />
            <Route path="/tasks" element={<TaskList />} />
            <Route path="/tasks/:taskId" element={<TaskDetail />} />
            <Route path="/backlog" element={<Backlog />} />
            <Route path="/milestones" element={<Milestones />} />
            <Route path="/gantt" element={<GanttChart />} />
            <Route path="/domains" element={<Domains />} />
            <Route path="/custom-fields" element={<CustomFields />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/members" element={<Members />} />

            {/* 已移除的多人协作/个人空间路由 → 重定向到首页 */}
            <Route path="/requirements" element={<Navigate to="/mindmap" replace />} />
            <Route path="/dashboard" element={<Navigate to="/mindmap" replace />} />
            <Route path="/goals" element={<Navigate to="/mindmap" replace />} />
            <Route path="/system-members" element={<Navigate to="/mindmap" replace />} />
            <Route path="/iterations" element={<Navigate to="/mindmap" replace />} />
            <Route path="/iterations/:id" element={<Navigate to="/mindmap" replace />} />
            <Route path="/intake" element={<Navigate to="/mindmap" replace />} />
            <Route path="/onboarding" element={<Navigate to="/mindmap" replace />} />
            <Route path="/my/*" element={<Navigate to="/mindmap" replace />} />
            <Route path="/my-tasks" element={<Navigate to="/mindmap" replace />} />
            <Route path="*" element={<Navigate to="/mindmap" replace />} />
          </Route>
          </Routes>
        </VaultGateway>
        </div>
        </div>
      </HashRouter>
    </ErrorBoundary>
  );
}
