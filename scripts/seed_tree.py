#!/usr/bin/env python3
"""Seed sample requirements tree data into clawpm via REST API."""

import json
import urllib.request
import urllib.error

BASE = "http://localhost:3210/api/v1"
TOKEN = "dev-token"

def req(method, path, data=None):
    url = BASE + path
    body = json.dumps(data).encode() if data else None
    r = urllib.request.Request(url, data=body, method=method, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {TOKEN}",
    })
    try:
        with urllib.request.urlopen(r) as resp:
            result = json.loads(resp.read())
            label = result.get('taskId', result.get('id', 'ok')) if isinstance(result, dict) else f"[{len(result)} items]"
            print(f"  {method} {path} -> {label}")
            return result
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  ERROR {method} {path}: {e.code} {body[:100]}")
        return None

def post(path, data):
    return req("POST", path, data)

def get(path):
    return req("GET", path)

# ── 确保域存在 ────────────────────────────────────────────────────
print("\n[1] Ensuring domains exist...")
domains_resp = get("/domains")
domain_names = {d["name"] for d in (domains_resp or [])}

if "用户系统" not in domain_names:
    post("/domains", {"name": "用户系统", "taskPrefix": "U", "keywords": ["user", "auth"], "color": "#6366f1"})
if "支付系统" not in domain_names:
    post("/domains", {"name": "支付系统", "taskPrefix": "P", "keywords": ["pay", "order"], "color": "#f59e0b"})

# ── Epic 1: 用户系统重构 ──────────────────────────────────────────
print("\n[2] Creating Epic 1: 用户系统重构")
e1 = post("/tasks", {
    "title": "用户系统重构",
    "description": "全面重构用户认证、注册、第三方登录模块，提升安全性和扩展性",
    "type": "epic",
    "domain": "用户系统",
    "priority": "P0",
    "owner": "arch-agent",
})
if not e1: exit(1)
e1_id = e1["taskId"]

# 设置进度
post(f"/tasks/{e1_id}/progress", {"progress": 55, "summary": "注册流程已完成，OAuth 进行中"})

# Story 1.1
print("\n  Story 1.1: 用户注册流程优化")
s1 = post("/tasks", {
    "title": "用户注册流程优化",
    "description": "支持手机号+邮箱双通道注册，增加验证码校验",
    "type": "story",
    "parent_task_id": e1_id,
    "domain": "用户系统",
    "priority": "P0",
    "owner": "agent-01",
})
s1_id = s1["taskId"]

# Task 1.1.1 (done)
t1 = post("/tasks", {
    "title": "实现注册 REST API",
    "description": "POST /api/v1/auth/register，参数校验 + 密码加密",
    "type": "task",
    "parent_task_id": s1_id,
    "domain": "用户系统",
    "priority": "P0",
    "owner": "agent-01",
})
post(f"/tasks/{t1['taskId']}/progress", {"progress": 100})
req("PATCH", f"/tasks/{t1['taskId']}", {"status": "done"})

# Task 1.1.2 (active, 60%)
t2 = post("/tasks", {
    "title": "前端注册页面",
    "description": "React 表单 + 客户端校验 + 错误提示",
    "type": "task",
    "parent_task_id": s1_id,
    "domain": "用户系统",
    "priority": "P1",
    "owner": "agent-02",
})
t2_id = t2["taskId"]
post(f"/tasks/{t2_id}/progress", {"progress": 60})
req("PATCH", f"/tasks/{t2_id}", {"status": "active"})

# Subtask 1.1.2.1 (done)
st1 = post("/tasks", {
    "title": "表单字段校验逻辑",
    "description": "手机号格式、密码强度、确认密码一致性",
    "type": "subtask",
    "parent_task_id": t2_id,
    "domain": "用户系统",
    "priority": "P1",
    "owner": "agent-02",
})
post(f"/tasks/{st1['taskId']}/progress", {"progress": 100})
req("PATCH", f"/tasks/{st1['taskId']}", {"status": "done"})

# Subtask 1.1.2.2 (active 40%)
st2 = post("/tasks", {
    "title": "手机验证码 UI",
    "description": "倒计时按钮 + 验证码输入框 + 接口联调",
    "type": "subtask",
    "parent_task_id": t2_id,
    "domain": "用户系统",
    "priority": "P1",
    "owner": "agent-02",
})
post(f"/tasks/{st2['taskId']}/progress", {"progress": 40})
req("PATCH", f"/tasks/{st2['taskId']}", {"status": "active"})

# Story 1.2: 第三方登录
print("\n  Story 1.2: 第三方登录集成")
s2 = post("/tasks", {
    "title": "第三方登录集成",
    "description": "接入 Google OAuth 2.0 和 GitHub OAuth，支持账号绑定",
    "type": "story",
    "parent_task_id": e1_id,
    "domain": "用户系统",
    "priority": "P1",
    "owner": "agent-03",
})
s2_id = s2["taskId"]
post(f"/tasks/{s2_id}/progress", {"progress": 30})
req("PATCH", f"/tasks/{s2_id}", {"status": "active"})

# Task 1.2.1
t3 = post("/tasks", {
    "title": "Google OAuth 集成",
    "description": "后端回调 + token 换取 + 用户信息写库",
    "type": "task",
    "parent_task_id": s2_id,
    "domain": "用户系统",
    "priority": "P1",
    "owner": "agent-03",
})
t3_id = t3["taskId"]
post(f"/tasks/{t3_id}/progress", {"progress": 60})
req("PATCH", f"/tasks/{t3_id}", {"status": "active"})

st3 = post("/tasks", {
    "title": "Google 回调路由",
    "description": "实现 /auth/google/callback 路由及 state 校验",
    "type": "subtask", "parent_task_id": t3_id,
    "domain": "用户系统", "priority": "P1", "owner": "agent-03",
})
post(f"/tasks/{st3['taskId']}/progress", {"progress": 100})
req("PATCH", f"/tasks/{st3['taskId']}", {"status": "done"})

st4 = post("/tasks", {
    "title": "账号绑定冲突处理",
    "description": "相同邮箱已存在时的合并逻辑",
    "type": "subtask", "parent_task_id": t3_id,
    "domain": "用户系统", "priority": "P1", "owner": "agent-03",
})
post(f"/tasks/{st4['taskId']}/progress", {"progress": 20})
req("PATCH", f"/tasks/{st4['taskId']}", {"status": "active"})

# Task 1.2.2 (planned)
post("/tasks", {
    "title": "GitHub OAuth 集成",
    "description": "接入 GitHub OAuth App",
    "type": "task", "parent_task_id": s2_id,
    "domain": "用户系统", "priority": "P2",
})

# Task 1.2.3 (blocked)
t5 = post("/tasks", {
    "title": "前端 OAuth 按钮组件",
    "description": "登录页增加 Google/GitHub 登录入口",
    "type": "task", "parent_task_id": s2_id,
    "domain": "用户系统", "priority": "P1", "owner": "agent-02",
})
req("PATCH", f"/tasks/{t5['taskId']}", {
    "status": "blocked",
    "blocker": "依赖后端 OAuth 回调接口尚未完成"
})
post(f"/tasks/{t5['taskId']}/progress", {"progress": 15})

# ── Epic 2: 支付系统 v2 ───────────────────────────────────────────
print("\n[3] Creating Epic 2: 支付系统 v2")
e2 = post("/tasks", {
    "title": "支付系统 v2",
    "description": "重写支付核心，支持多渠道：微信/支付宝/银行卡，完善退款流程",
    "type": "epic",
    "domain": "支付系统",
    "priority": "P0",
    "owner": "arch-agent",
})
e2_id = e2["taskId"]
post(f"/tasks/{e2_id}/progress", {"progress": 40})
req("PATCH", f"/tasks/{e2_id}", {"status": "active"})

# Story 2.1
print("\n  Story 2.1: 微信/支付宝收银台")
s3 = post("/tasks", {
    "title": "微信/支付宝收银台",
    "description": "统一收银台，前端单一入口支持多渠道支付",
    "type": "story", "parent_task_id": e2_id,
    "domain": "支付系统", "priority": "P0", "owner": "agent-04",
})
s3_id = s3["taskId"]
post(f"/tasks/{s3_id}/progress", {"progress": 65})
req("PATCH", f"/tasks/{s3_id}", {"status": "active"})

t6 = post("/tasks", {
    "title": "支付网关抽象层",
    "description": "定义统一 PayGateway 接口，屏蔽渠道差异",
    "type": "task", "parent_task_id": s3_id,
    "domain": "支付系统", "priority": "P0", "owner": "agent-04",
})
post(f"/tasks/{t6['taskId']}/progress", {"progress": 100})
req("PATCH", f"/tasks/{t6['taskId']}", {"status": "done"})

t7 = post("/tasks", {
    "title": "微信支付接入",
    "description": "Native/JSAPI/H5 三种场景",
    "type": "task", "parent_task_id": s3_id,
    "domain": "支付系统", "priority": "P0", "owner": "agent-04",
})
t7_id = t7["taskId"]
post(f"/tasks/{t7_id}/progress", {"progress": 70})
req("PATCH", f"/tasks/{t7_id}", {"status": "active"})

st5 = post("/tasks", {
    "title": "微信支付签名验证",
    "description": "回调通知 XML 签名校验逻辑",
    "type": "subtask", "parent_task_id": t7_id,
    "domain": "支付系统", "priority": "P0", "owner": "agent-04",
})
post(f"/tasks/{st5['taskId']}/progress", {"progress": 100})
req("PATCH", f"/tasks/{st5['taskId']}", {"status": "done"})

st6 = post("/tasks", {
    "title": "订单状态同步",
    "description": "异步轮询 + Webhook 双保险更新订单状态",
    "type": "subtask", "parent_task_id": t7_id,
    "domain": "支付系统", "priority": "P0", "owner": "agent-04",
})
post(f"/tasks/{st6['taskId']}/progress", {"progress": 40})
req("PATCH", f"/tasks/{st6['taskId']}", {"status": "active"})

# Story 2.2 (planned)
print("\n  Story 2.2: 退款流程重构")
s4 = post("/tasks", {
    "title": "退款流程重构",
    "description": "支持全额/部分退款，引入退款工单审批",
    "type": "story", "parent_task_id": e2_id,
    "domain": "支付系统", "priority": "P1",
})
post("/tasks", {
    "title": "退款工单系统",
    "description": "退款申请 -> 审批 -> 执行 全流程",
    "type": "task", "parent_task_id": s4["taskId"],
    "domain": "支付系统", "priority": "P1",
})

print("\n[Done] Sample tree data seeded successfully!")
