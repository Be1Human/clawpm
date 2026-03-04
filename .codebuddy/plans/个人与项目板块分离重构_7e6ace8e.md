---
name: 个人与项目板块分离重构
overview: 重新设计导航架构，将现有扁平的侧边栏拆分为"个人工作台"和"项目空间"两个独立的顶级板块，各自拥有完整的规划、跟踪、视图能力。
todos:
  - id: create-space-hook
    content: 创建 useActiveSpace hook（web/src/lib/useActiveSpace.ts），实现空间切换状态管理，遵循现有 useActiveProject 的 useSyncExternalStore 模式
    status: completed
  - id: refactor-layout-nav
    content: 重构 Layout.tsx：新增个人空间/项目空间切换 Tab UI，拆分 NAV_GROUPS 为 PERSONAL_NAV_GROUPS 和 PROJECT_NAV_GROUPS，根据 activeSpace 动态渲染导航，支持根据当前路由自动切换空间
    status: completed
    dependencies:
      - create-space-hook
  - id: create-my-dashboard
    content: 创建 MyDashboard.tsx 个人仪表盘页面，展示个人任务统计、近期活跃任务列表和快捷入口卡片，调用 getMyOverview 和 getTasks(owner) API
    status: completed
    dependencies:
      - create-space-hook
  - id: create-my-wrapper-pages
    content: 使用 [subagent:code-explorer] 分析现有页面结构，然后创建 MyMindMap.tsx、MyGantt.tsx、MyKanban.tsx、MyRequirements.tsx 四个个人空间包装页，复用现有组件逻辑并自动注入 owner 过滤
    status: completed
    dependencies:
      - create-space-hook
  - id: update-routes
    content: 更新 App.tsx 路由配置，新增所有 /my/* 路由，调整默认路由指向 /my/dashboard，确保 MyTasks 路由同步更新为 /my/tasks
    status: completed
    dependencies:
      - refactor-layout-nav
      - create-my-dashboard
      - create-my-wrapper-pages
  - id: verify-and-polish
    content: 全面验证路由跳转、空间切换、导航高亮、未登录降级等场景，修复所有页面内部链接（如 Dashboard 中指向 /my-tasks 的链接更新为 /my/tasks），确保向后兼容
    status: completed
    dependencies:
      - update-routes
---

## 用户需求

用户认为当前"我的任务"仅作为"工作台"下的一个子页面存在，与项目级页面混在一起导致视觉混乱。用户要求将个人板块与项目板块彻底分离，形成两个独立的页签体系。

## 产品概述

将 ClawPM 的侧边栏导航从单一扁平结构重构为"个人空间"与"项目空间"双页签体系。用户可通过顶层 Tab 切换在两个空间之间导航，各空间拥有独立完整的功能菜单。

## 核心功能

### 1. 顶层双空间切换

- 侧边栏顶部（项目切换器下方）新增"个人空间 / 项目空间"切换 Tab
- 切换后侧边栏导航菜单整体替换为对应空间的菜单结构
- 记忆上次选择的空间（localStorage 持久化）

### 2. 个人空间导航与页面

个人空间以当前用户为过滤维度，仅展示"我负责的"数据：

- **我的仪表盘**：从现有 Dashboard 中提取个人统计部分（待办统计、进行中/待验收/已逾期计数），形成独立的个人概览页
- **我的任务**：保持现有 MyTasks 页面的三视图（平铺/树状/脑图）
- **我的规划**：包含"我的需求树"、"我的思维导图"、"我的甘特图"，复用现有项目级组件但自动注入 owner 过滤条件
- **我的看板**：复用现有看板组件，自动过滤仅显示当前用户的任务

### 3. 项目空间导航与页面

项目空间保持全局视角，展示全量数据：

- **项目仪表盘**：现有完整 Dashboard（含全局统计、风险预警、人员负载等）
- **产品规划**：需求树、思维导图、甘特图（全量数据）
- **执行跟踪**：看板、任务列表、需求池
- **目标管理**：里程碑、目标
- **设置**：业务板块、自定义字段、成员

### 4. 路由结构调整

- 个人空间路由统一使用 `/my/` 前缀（如 `/my/dashboard`、`/my/tasks`、`/my/board`、`/my/mindmap`、`/my/gantt`、`/my/requirements`）
- 项目空间路由保持现有路径不变
- 默认进入个人空间的"我的仪表盘"

## 技术栈

- 前端框架：React 18 + TypeScript
- 路由：react-router-dom v7
- 状态管理：@tanstack/react-query v5
- 样式：Tailwind CSS v3
- 可视化：@xyflow/react、recharts
- 构建工具：Vite 5

## 实现方案

### 整体策略

在 Layout 侧边栏中引入"空间切换"机制，通过顶层 Tab（个人空间 / 项目空间）切换 NAV_GROUPS 导航配置。个人空间页面最大化复用现有项目级页面组件，通过传入 `ownerFilter` prop 或在页面内部自动读取 `useCurrentUser()` 来过滤数据。

### 关键技术决策

1. **导航配置数据驱动**：将 `NAV_GROUPS` 拆分为 `PERSONAL_NAV_GROUPS` 和 `PROJECT_NAV_GROUPS` 两套配置，通过空间状态动态切换，不引入硬编码条件分支。

2. **个人页面复用策略**：不为每个个人视图都创建全新组件。对于思维导图、甘特图、看板、需求树等重量级页面，创建轻量包装页面（wrapper page），将 `ownerFilter={currentUser}` 注入现有组件。现有页面已支持 owner 过滤（后端 API 已有 `?owner=xxx` 参数），只需在前端查询时附加参数。

3. **个人仪表盘**：从 Dashboard.tsx 提取"我的概览"相关逻辑，创建独立的 `MyDashboard.tsx`，展示个人维度的统计信息（进行中/待验收/逾期/完成率），并添加快捷入口链接到个人空间的各子页面。

4. **空间状态持久化**：使用 localStorage 存储当前选中的空间（`clawpm-space`），遵循现有 `useActiveProject` / `useCurrentUser` 的 `useSyncExternalStore` 模式创建 `useActiveSpace` hook。

5. **路由结构**：个人空间页面使用 `/my/` 前缀路由，与项目空间路由并存于同一 `<Routes>` 中，不需要嵌套 Layout。

### 性能考量

- 个人空间的思维导图、甘特图等页面通过 owner 过滤，数据量远小于项目全量，渲染性能更优
- 空间切换仅替换侧边栏导航内容，不触发全页面卸载/重载
- 复用现有 react-query 缓存键结构，个人页面通过不同 queryKey（含 owner 参数）与项目页面缓存独立

## 实现注意事项

1. **后端无需改动**：所有 API（/tasks、/tasks/tree、/gantt、/board 相关）已支持 `owner` 查询参数过滤，无需新增后端接口
2. **向后兼容**：保留所有现有路由路径不变，确保书签和外部链接正常工作
3. **未设身份时降级**：个人空间需要 currentUser，未设置身份时显示引导提示（沿用 MyTasks 已有的未登录提示模式）
4. **导航高亮**：空间切换时需确保 NavLink 的 active 状态正确匹配，`/my/*` 路由命中时自动切换到个人空间 Tab

## 架构设计

### 系统结构

```mermaid
graph TD
    A[Layout.tsx] -->|空间切换 Tab| B{activeSpace}
    B -->|personal| C[PERSONAL_NAV_GROUPS]
    B -->|project| D[PROJECT_NAV_GROUPS]
    C --> E[/my/dashboard - MyDashboard]
    C --> F[/my/tasks - MyTasks]
    C --> G[/my/mindmap - MyMindMap]
    C --> H[/my/gantt - MyGantt]
    C --> I[/my/board - MyKanban]
    C --> J[/my/requirements - MyRequirements]
    D --> K[/ - Dashboard]
    D --> L[/requirements - Requirements]
    D --> M[/mindmap - MindMap]
    D --> N[/board - KanbanBoard]
    D --> O[其他项目级页面...]
    
    G -->|ownerFilter| M
    H -->|ownerFilter| N2[GanttChart]
    I -->|ownerFilter| N
```

### 数据流

用户切换空间 → Layout 更新 NAV_GROUPS 渲染 → 用户点击导航 → 路由匹配个人/项目页面 → 个人页面自动附加 owner 过滤参数调用 API → API 返回过滤后的数据 → 页面渲染

## 目录结构

```
web/src/
├── lib/
│   └── useActiveSpace.ts          # [NEW] 空间切换状态管理 hook，基于 localStorage + useSyncExternalStore，与 useActiveProject 同模式
├── components/
│   └── Layout.tsx                 # [MODIFY] 重构导航结构：新增空间切换 Tab UI，拆分 NAV_GROUPS 为个人/项目两套配置，根据 activeSpace 动态渲染对应导航菜单
├── pages/
│   ├── MyDashboard.tsx            # [NEW] 个人仪表盘页面。展示当前用户的任务统计（进行中/待验收/逾期/完成率）、快捷入口到个人空间各子页面、近期活跃任务列表。调用 getMyOverview + getTasks(owner) API
│   ├── MyMindMap.tsx              # [NEW] 个人思维导图包装页。读取 useCurrentUser，以 owner 过滤参数调用 getTaskTree API，复用 MindMap.tsx 的核心渲染逻辑或直接在包装层传入过滤后的 tree 数据
│   ├── MyGantt.tsx                # [NEW] 个人甘特图包装页。以 owner 过滤参数调用 getGanttData API，复用 GanttChart 的核心渲染逻辑
│   ├── MyKanban.tsx               # [NEW] 个人看板包装页。以 owner 过滤参数调用 getTasks API，复用 KanbanBoard 的核心卡片和列渲染逻辑
│   ├── MyRequirements.tsx         # [NEW] 个人需求树包装页。以 owner 过滤参数调用 getTaskTree API，复用 Requirements.tsx 的树状渲染逻辑
│   └── MyTasks.tsx                # [MODIFY] 路由调整为 /my/tasks，其他功能保持不变
├── App.tsx                        # [MODIFY] 新增个人空间路由（/my/dashboard, /my/tasks, /my/mindmap, /my/gantt, /my/board, /my/requirements），调整默认路由指向
└── ...
```

## 关键代码结构

```typescript
// web/src/lib/useActiveSpace.ts
type Space = 'personal' | 'project';

export function getActiveSpace(): Space;
export function setActiveSpace(space: Space): void;
export function subscribeActiveSpace(listener: () => void): () => void;
export function useActiveSpace(): Space;
```

```typescript
// Layout.tsx 中的导航配置结构
interface NavItem {
  to: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  exact?: boolean;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const PERSONAL_NAV_GROUPS: NavGroup[];  // 个人空间导航
const PROJECT_NAV_GROUPS: NavGroup[];   // 项目空间导航
```

## Agent Extensions

### SubAgent

- **code-explorer**
- 用途：在实现个人页面包装组件时，深度分析 MindMap.tsx（82KB）、GanttChart.tsx、KanbanBoard.tsx、Requirements.tsx 的内部结构，确定最佳复用切入点（是提取公共组件还是通过 props 传入过滤数据）
- 预期结果：准确识别各页面的数据获取逻辑和渲染逻辑边界，确保个人页面包装方案最优

### MCP

- **codebuddy-mem**
- 用途：查询项目记忆中关于设计原则（"灵活的、基于原则和机制的设计"）的上下文，确保方案符合用户的架构偏好
- 预期结果：方案设计符合用户此前表达的设计哲学