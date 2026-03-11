import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import KanbanBoard from './pages/KanbanBoard';
import TaskList from './pages/TaskList';
import TaskDetail from './pages/TaskDetail';
import Backlog from './pages/Backlog';
import Milestones from './pages/Milestones';
import Goals from './pages/Goals';
import Requirements from './pages/Requirements';
import MindMap from './pages/MindMap';
import GanttChart from './pages/GanttChart';
import Members from './pages/Members';
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
import { isOnboarded, getCurrentUser } from './lib/useCurrentUser';

function LayoutWrapper() {
  return <Layout><Outlet /></Layout>;
}

function OnboardingGuard() {
  const onboarded = isOnboarded();
  const currentUser = getCurrentUser();
  if (!onboarded || !currentUser) {
    return <Navigate to="/onboarding" replace />;
  }
  return <LayoutWrapper />;
}

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="/my/tasks/list" element={<MyTasks defaultView="flat" />} />
          <Route path="/my/tasks/tree" element={<MyTasks defaultView="tree" />} />
          <Route path="/my/tasks/mindmap" element={<MyTasks defaultView="mindmap" />} />
          <Route path="/my/gantt" element={<MyGantt />} />

          {/* 向后兼容：旧路由重定向 */}
          <Route path="/my-tasks" element={<Navigate to="/my/tasks/tree" replace />} />
          <Route path="/my/tasks" element={<Navigate to="/my/tasks/tree" replace />} />
          <Route path="/my/board" element={<Navigate to="/my/tasks/list" replace />} />
          <Route path="/my/mindmap" element={<Navigate to="/my/tasks/mindmap" replace />} />
          <Route path="/my/requirements" element={<Navigate to="/my/tasks/tree" replace />} />

          {/* ── 项目空间 ── */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/board" element={<KanbanBoard />} />
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/tasks/:taskId" element={<TaskDetail />} />
          <Route path="/backlog" element={<Backlog />} />
          <Route path="/milestones" element={<Milestones />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/requirements" element={<Requirements />} />
          <Route path="/mindmap" element={<MindMap />} />
          <Route path="/gantt" element={<GanttChart />} />
          <Route path="/members" element={<Members />} />
          <Route path="/domains" element={<Domains />} />
          <Route path="/custom-fields" element={<CustomFields />} />
          <Route path="/iterations" element={<Iterations />} />
          <Route path="/iterations/:id" element={<IterationDetail />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/intake" element={<IntakeList />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
