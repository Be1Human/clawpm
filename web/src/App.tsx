import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import KanbanBoard from './pages/KanbanBoard';
import TaskList from './pages/TaskList';
import TaskDetail from './pages/TaskDetail';
import Backlog from './pages/Backlog';
import Milestones from './pages/Milestones';
import Goals from './pages/Goals';
import Requirements from './pages/Requirements';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/board" element={<KanbanBoard />} />
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/tasks/:taskId" element={<TaskDetail />} />
          <Route path="/backlog" element={<Backlog />} />
          <Route path="/milestones" element={<Milestones />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/requirements" element={<Requirements />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
