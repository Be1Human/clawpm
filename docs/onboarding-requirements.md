# 新手引导（Onboarding）需求分析文档

## 1. 背景与问题

### 1.1 现状问题

当前 ClawPM 用户首次进入系统时的体验如下：

1. 直接跳转到 `/my/dashboard`（个人仪表盘）
2. 系统检测到 `localStorage` 中没有 `clawpm-user`，弹出 `IdentityPicker` 对话框
3. 用户在弹窗中填写「显示名称」和「唯一标识」后创建身份
4. 弹窗关闭，用户继续停留在仪表盘

**存在的问题：**
- 体验割裂：用户第一眼看到的是空白仪表盘，然后被突然弹出的对话框打断
- 信息收集不足：仅收集了名字和 identifier，缺少角色、头像色、偏好等关键信息
- 缺乏欢迎感：没有品牌展示，用户不清楚系统能做什么
- 项目初始化缺失：默认项目名称固定为"默认项目"，用户无法在第一次使用时设置项目名

### 1.2 数据库 members 表现状

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 主键 |
| projectId | INTEGER | 所属项目 |
| name | TEXT | 显示名称 |
| identifier | TEXT | 唯一标识 |
| type | TEXT | 'human' \| 'agent' |
| color | TEXT | 头像背景色（随机分配） |
| description | TEXT | 描述（可选，很少填写） |
| createdAt | TEXT | 创建时间 |

**缺失字段：** 角色（role）、头像（avatar）、时区（timezone）、onboarding 完成标记

---

## 2. 需求目标

### 2.1 核心目标

为 ClawPM 新用户提供一套完整、流畅的 **首次使用引导流程**，在用户第一次打开应用时，通过分步骤的全屏向导页面收集必要信息，完成身份建立和初始配置，再进入主界面。

### 2.2 用户故事

**作为一个首次使用 ClawPM 的用户，**
- 我希望看到一个温馨的欢迎页面，了解这个工具是做什么的
- 我希望在进入系统前设置好我的个人信息（名字、标识、角色、头像色）
- 我希望能给我的项目起一个有意义的名字
- 我希望完成设置后直接进入一个已经配置好的工作环境

**作为一个已经使用过 ClawPM 的老用户，**
- 我不希望每次打开都重新走引导流程
- 我的 identifier 已经保存在 localStorage，应该直接进入主界面

---

## 3. 功能需求

### 3.1 触发条件

满足以下**任一条件**时，跳转到 `/onboarding` 页面：

| 条件 | 说明 |
|------|------|
| `localStorage['clawpm-user']` 不存在 | 全新设备/浏览器 |
| `localStorage['clawpm-onboarded']` 不为 `'true'` | 旧用户升级但未完成新引导 |
| identifier 存在但在当前项目 members 中找不到对应记录 | 数据被清除 |

### 3.2 Onboarding 步骤

#### Step 1 — 欢迎页

- 展示 ClawPM 品牌/Logo
- 简短的一句话描述：「AI 时代的项目管理工具，为人类与 Agent 协作而生」
- 一个"开始使用"按钮，点击进入 Step 2

#### Step 2 — 建立你的身份

必填信息：
- **显示名称**：`name`，用户在系统中看到的名字（例：张三）
- **唯一标识**：`identifier`，英文/拼音，用于系统内部引用（例：zhangsan），自动根据名称生成建议值
- **头像颜色**：`color`，提供 8 个预设色供选择，也可随机
- **角色**：`role`，单选：开发工程师 / 产品经理 / 设计师 / 项目管理 / 其他

可选信息：
- **个人描述**：`description`，一行简短的自我介绍

校验规则：
- `name` 不能为空，最长 50 字符
- `identifier` 只允许字母、数字、下划线、连字符，长度 2-30，不能与已有成员重复
- `identifier` 重复时提示「该标识已被使用，请换一个」

#### Step 3 — 初始化你的项目

- 展示当前默认项目（slug = 'default'）
- 允许用户修改项目名称（当前名为"默认项目"）
- 允许用户填写项目描述
- 支持「跳过」（保持默认项目名称不变）

#### Step 4 — 完成

- 展示设置摘要（头像 + 名字 + 角色 + 项目名）
- 「进入 ClawPM」按钮，点击后：
  1. 写入 `localStorage['clawpm-user'] = identifier`
  2. 写入 `localStorage['clawpm-onboarded'] = 'true'`
  3. 跳转到 `/my/dashboard`

### 3.3 路由守卫

在 `App.tsx` 中，所有需要 Layout 的路由前增加一个守卫组件 `<OnboardingGuard>`：

- 如果未完成引导 → 重定向到 `/onboarding`
- 如果已完成引导 → 正常渲染子路由
- `/onboarding` 本身是公开路由，不受守卫控制
- `/intake/submit` 是公开路由，不受守卫控制

### 3.4 数据持久化

Onboarding 完成后调用：

1. `POST /api/members` 创建成员（携带 name, identifier, color, role, description）
2. `PUT /api/projects/default`（如果用户修改了项目名称）

---

## 4. 非功能需求

### 4.1 界面设计要求

- 全屏展示，不使用侧边栏/顶栏
- 步骤进度指示器（Step 1/4、2/4...）
- 流畅的步骤切换动画（slide 或 fade）
- 移动端友好（响应式布局）
- 与 ClawPM 现有设计风格一致（Tailwind CSS，indigo 主色）

### 4.2 数据库扩展要求

`members` 表需要新增字段：

| 新字段 | 类型 | 说明 | 默认值 |
|--------|------|------|--------|
| role | TEXT | 角色：dev/pm/design/mgr/other | null |
| onboarded_at | TEXT | 完成 onboarding 的时间戳 | null |

（不引入 avatar 和 timezone，保持简单，后续按需扩展）

### 4.3 兼容性要求

- 老用户（已有 `clawpm-user` 且对应 member 存在于数据库）不触发引导
- 新增字段对旧数据无影响（可为 null）

---

## 5. 不在范围内（Out of Scope）

- 密码/邮箱注册登录（本项目定位为本地工具，无需此功能）
- 邮件验证
- 团队邀请功能（成员通过管理页面手动添加）
- 多步骤引导之外的功能介绍（产品 tour / tooltip 导览）

---

## 6. 验收标准

| 场景 | 预期行为 |
|------|---------|
| 全新用户访问 `/` | 跳转到 `/onboarding` |
| 全新用户访问 `/my/dashboard` | 跳转到 `/onboarding` |
| 全新用户完成 Step 4 | 跳转到 `/my/dashboard`，刷新后不再引导 |
| 老用户访问 `/` | 正常进入 `/my/dashboard` |
| `localStorage` 被手动清空 | 再次触发引导 |
| 用户在 Step 2 输入重复 identifier | 显示错误提示，不能前进 |
| 用户在 Step 3 点击跳过 | 项目名保持"默认项目"，进入 Step 4 |
| 访问 `/intake/submit` | 不触发引导，正常显示 |
