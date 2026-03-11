# 新手引导（Onboarding）设计文档

## 1. 整体架构

### 1.1 变更范围

```
server/
  src/
    db/
      schema.ts          ← 新增 role / onboarded_at 字段
      connection.ts      ← 新增迁移 SQL（ALTER TABLE members）
    services/
      member-service.ts  ← create/update 支持 role 字段
    api/
      routes.ts          ← 新增 GET /api/v1/onboarding/check 接口

web/
  src/
    App.tsx              ← 新增 /onboarding 路由 + OnboardingGuard
    lib/
      useCurrentUser.ts  ← 新增 isOnboarded() / setOnboarded() 工具函数
    pages/
      Onboarding.tsx     ← 新增（主体引导页面）
    api/
      client.ts          ← 新增 checkIdentifierAvailable() 方法
```

### 1.2 路由设计

```
/onboarding                → Onboarding.tsx（公开，不受守卫控制）
/intake/submit             → IntakeSubmit（公开，不受守卫控制）
/*（其余所有路由）         → OnboardingGuard 包裹，未引导则跳转 /onboarding
```

---

## 2. 数据库变更

### 2.1 members 表新增字段

```sql
ALTER TABLE members ADD COLUMN role TEXT;
-- 可选值: 'dev' | 'pm' | 'design' | 'mgr' | 'other'
-- 旧数据默认为 null，不影响现有功能

ALTER TABLE members ADD COLUMN onboarded_at TEXT;
-- ISO 8601 时间戳，用于记录完成引导的时间
```

在 `server/src/db/connection.ts` 的迁移脚本中通过 `try { ... } catch {}` 包裹执行（与现有迁移模式一致）。

### 2.2 Schema 类型定义（schema.ts）

```typescript
export const members = sqliteTable('members', {
  // 现有字段保持不变...
  role: text('role'),           // 新增
  onboardedAt: text('onboarded_at'), // 新增
});
```

---

## 3. 后端接口

### 3.1 新增：标识符可用性检查

**GET** `/api/v1/members/check-identifier?identifier=xxx&project=default`

响应：
```json
{ "available": true }
// 或
{ "available": false, "reason": "already_taken" }
```

用途：Onboarding Step 2 实时检查 identifier 是否被占用。

### 3.2 变更：创建成员支持 role 字段

**POST** `/api/v1/members`（无接口签名变更，body 新增可选字段）

```json
{
  "name": "张三",
  "identifier": "zhangsan",
  "type": "human",
  "color": "#6366f1",
  "role": "dev",        // 新增，可选
  "description": "..."
}
```

### 3.3 变更：更新成员支持 role 字段

**PATCH** `/api/v1/members/:identifier`（body 新增可选字段）

```json
{ "role": "pm" }
```

---

## 4. 前端实现

### 4.1 localStorage Key 规范

| Key | 类型 | 说明 |
|-----|------|------|
| `clawpm-user` | string | 当前用户 identifier（现有） |
| `clawpm-onboarded` | `'true'` | 是否已完成引导（新增） |

### 4.2 useCurrentUser.ts 新增工具函数

```typescript
const ONBOARDED_KEY = 'clawpm-onboarded';

export function isOnboarded(): boolean {
  return localStorage.getItem(ONBOARDED_KEY) === 'true';
}

export function setOnboarded(): void {
  localStorage.setItem(ONBOARDED_KEY, 'true');
}

export function clearOnboarded(): void {
  localStorage.removeItem(ONBOARDED_KEY);
}
```

### 4.3 OnboardingGuard 组件（内嵌在 App.tsx）

```typescript
function OnboardingGuard() {
  const currentUser = useCurrentUser();
  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: () => api.getMembers(),
  });

  const needsOnboarding =
    !isOnboarded() ||
    !currentUser ||
    (members.length > 0 && !members.find(m => m.identifier === currentUser));

  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
```

**注意：** 只有当 `members` 数据加载完成后才判断，避免数据未加载时误跳转。加载期间渲染 `<Outlet />`（保持现有体验）。

### 4.4 Onboarding.tsx 组件结构

```
Onboarding
├── ProgressBar（步骤指示器：1/4、2/4...）
├── Step1Welcome（欢迎页）
├── Step2Identity（身份建立）
│   ├── 名称输入
│   ├── 标识符输入（实时校验）
│   ├── 颜色选择器（8个色块）
│   └── 角色选择（5个卡片）
├── Step3Project（项目初始化）
│   ├── 项目名称输入
│   ├── 项目描述输入
│   └── 跳过按钮
└── Step4Done（完成摘要）
    ├── 用户卡片预览
    └── 进入按钮
```

### 4.5 Onboarding 状态机

```typescript
type OnboardingStep = 1 | 2 | 3 | 4;

interface OnboardingState {
  step: OnboardingStep;
  // Step 2 数据
  name: string;
  identifier: string;
  color: string;
  role: 'dev' | 'pm' | 'design' | 'mgr' | 'other' | '';
  description: string;
  identifierError: string;
  // Step 3 数据
  projectName: string;
  projectDescription: string;
  skipProject: boolean;
}
```

### 4.6 完成流程（Step 4 "进入 ClawPM"点击）

```
1. POST /api/v1/members  { name, identifier, color, role, description }
2. 如果 !skipProject && projectName !== '默认项目':
   PATCH /api/v1/projects/default  { name: projectName, description: projectDescription }
3. setCurrentUser(identifier)
4. setOnboarded()
5. navigate('/my/dashboard')
```

---

## 5. 界面设计规范

### 5.1 整体布局

```
┌─────────────────────────────────────────────────┐
│  ClawPM Logo                    Step 2 / 4       │
│                                 ●●○○             │
├─────────────────────────────────────────────────┤
│                                                 │
│           [步骤内容区域]                          │
│                                                 │
├─────────────────────────────────────────────────┤
│        [上一步]              [下一步 →]          │
└─────────────────────────────────────────────────┘
```

- 最大宽度：`max-w-lg`（512px），居中显示
- 背景：白色卡片 + 页面浅灰背景（`bg-gray-50`）
- 圆角：`rounded-2xl`，阴影：`shadow-xl`
- 步骤切换动画：`transition-all duration-300`，使用 `opacity` + `translateX`

### 5.2 预设颜色方案（Step 2 颜色选择器）

与 MemberService 颜色一致，8 种颜色：

| 颜色 | HEX | 显示名 |
|------|-----|------|
| Indigo | `#6366f1` | 默认 |
| Amber | `#f59e0b` | |
| Emerald | `#10b981` | |
| Red | `#ef4444` | |
| Violet | `#8b5cf6` | |
| Cyan | `#06b6d4` | |
| Orange | `#f97316` | |
| Pink | `#ec4899` | |

### 5.3 角色卡片设计（Step 2）

5 个角色使用图标 + 文字的卡片样式，选中时 border 高亮：

| role | 图标 | 显示名 |
|------|------|------|
| dev | 💻 Code2 | 开发工程师 |
| pm | 📋 ClipboardList | 产品经理 |
| design | 🎨 Palette | 设计师 |
| mgr | 👥 Users | 项目管理 |
| other | ✨ Sparkles | 其他 |

### 5.4 identifier 输入框实时校验

- 输入时：将中文/空格自动提示转换建议（不强制转换，由用户决定）
- 失焦时：调用 `GET /api/v1/members/check-identifier` 检查可用性
- 显示状态：
  - 空：无提示
  - 格式错误：红色提示「只允许字母、数字、下划线、连字符」
  - 已被占用：红色提示「该标识已被使用，请换一个」
  - 可用：绿色提示「✓ 可用」

---

## 6. API 客户端变更（client.ts）

新增方法：

```typescript
async checkIdentifierAvailable(identifier: string): Promise<{ available: boolean; reason?: string }> {
  const res = await fetch(`${API_BASE}/api/v1/members/check-identifier?identifier=${encodeURIComponent(identifier)}&${getProjectParam()}`);
  return res.json();
}
```

---

## 7. 实现顺序

1. **数据库迁移**：`schema.ts` 新增字段，`connection.ts` 新增 ALTER TABLE
2. **后端服务层**：`member-service.ts` 支持 role 字段创建/更新
3. **后端路由**：`routes.ts` 新增 `check-identifier` 端点
4. **前端工具函数**：`useCurrentUser.ts` 新增 `isOnboarded / setOnboarded`
5. **前端 API 客户端**：`client.ts` 新增 `checkIdentifierAvailable`
6. **Onboarding 页面**：`pages/Onboarding.tsx`
7. **路由集成**：`App.tsx` 新增 `OnboardingGuard` 和 `/onboarding` 路由

---

## 8. 测试要点

| 测试场景 | 预期 |
|---------|------|
| 清空 localStorage 后刷新 | 跳转 /onboarding |
| Step 2 输入已存在的 identifier | 显示错误，Next 按钮禁用 |
| Step 3 修改项目名称后完成 | 项目名称在 /dashboard 中更新 |
| Step 3 点击跳过 | 项目名称保持"默认项目" |
| 完成后刷新页面 | 不再跳转 /onboarding |
| 访问 /intake/submit | 不触发引导 |
