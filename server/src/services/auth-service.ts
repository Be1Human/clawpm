import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/connection.js';
import { accounts, accountMemberBindings, accountSessions, agentTokens, authAuditLogs, members, projects } from '../db/schema.js';
import { MemberService } from './member-service.js';

type AccountPrincipal = {
  type: 'account';
  authSource: 'session';
  accountId: number;
  username: string;
  displayName: string;
  memberIdentifier: string | null;
};

type AgentPrincipal = {
  type: 'agent';
  authSource: 'agent_token';
  tokenId: number;
  clientType: string;
  memberIdentifier: string;
};

type LegacyPrincipal = {
  type: 'legacy';
  authSource: 'legacy_api_token';
  memberIdentifier: string | null;
};

export type AuthPrincipal = AccountPrincipal | AgentPrincipal | LegacyPrincipal;

function nowIso() {
  return new Date().toISOString();
}

function futureIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password: string, hashed: string) {
  const [algo, salt, digest] = hashed.split('$');
  if (algo !== 'scrypt' || !salt || !digest) return false;
  const candidate = scryptSync(password, salt, 64);
  const target = Buffer.from(digest, 'hex');
  return candidate.length === target.length && timingSafeEqual(candidate, target);
}

function makeOpaqueToken(prefix: 'sess' | 'agent') {
  return `clawpm_${prefix}_${randomBytes(24).toString('hex')}`;
}

function tokenPrefix(token: string) {
  return token.slice(0, 16);
}

function toSafeAccount(account: any) {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    status: account.status,
    lastLoginAt: account.lastLoginAt,
  };
}

function logAudit(params: {
  actorType: string;
  actorId: string;
  action: string;
  projectId?: number | null;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = getDb();
  db.insert(authAuditLogs).values({
    actorType: params.actorType,
    actorId: params.actorId,
    action: params.action,
    projectId: params.projectId ?? null,
    targetType: params.targetType ?? null,
    targetId: params.targetId ?? null,
    metadata: JSON.stringify(params.metadata || {}),
  } as any).run();
}

function getProjectIdBySlug(slug?: string | null) {
  const db = getDb();
  if (!slug) {
    const project = db.select().from(projects).where(eq(projects.slug, 'default')).get() as any;
    return project?.id || 1;
  }
  const project = db.select().from(projects).where(eq(projects.slug, slug)).get() as any;
  if (!project) throw new Error(`Project "${slug}" not found`);
  return project.id as number;
}

export const AuthService = {
  register(params: {
    username: string;
    password: string;
    displayName: string;
    projectSlug?: string;
    autoCreateMember?: boolean;
  }) {
    const db = getDb();
    const username = params.username.trim();
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
      throw new Error('用户名只允许字母、数字、下划线、连字符，长度 3-32');
    }
    if (!params.password || params.password.length < 6) {
      throw new Error('密码长度至少 6 位');
    }
    if (!params.displayName.trim()) {
      throw new Error('显示名不能为空');
    }
    const existing = db.select().from(accounts).where(eq(accounts.username, username)).get();
    if (existing) throw new Error('用户名已存在');

    const passwordHash = hashPassword(params.password);
    db.insert(accounts).values({
      username,
      passwordHash,
      displayName: params.displayName.trim(),
      status: 'active',
      lastLoginAt: nowIso(),
    } as any).run();

    const account = db.select().from(accounts).where(eq(accounts.username, username)).get() as any;
    const projectId = getProjectIdBySlug(params.projectSlug);

    if (params.autoCreateMember !== false) {
      const existingMember = db.select().from(members).where(and(
        eq(members.identifier, username),
        eq(members.projectId, projectId),
      )).get();
      if (!existingMember) {
        MemberService.create({
          name: params.displayName.trim(),
          identifier: username,
          type: 'human',
          projectId,
        });
      }
      this.bindMember(account.id, projectId, username, true);
    }

    const session = this.createSession(account.id);
    logAudit({ actorType: 'account', actorId: String(account.id), action: 'register', projectId });
    return {
      token: session.token,
      account: toSafeAccount(account),
      ...this.getAccountSnapshot(account.id),
    };
  },

  login(params: { username: string; password: string }) {
    const db = getDb();
    const account = db.select().from(accounts).where(eq(accounts.username, params.username.trim())).get() as any;
    if (!account || !verifyPassword(params.password, account.passwordHash)) {
      throw new Error('用户名或密码错误');
    }
    if (account.status !== 'active') throw new Error('账号已被禁用');
    db.update(accounts).set({ lastLoginAt: nowIso(), updatedAt: nowIso() } as any).where(eq(accounts.id, account.id)).run();
    const session = this.createSession(account.id);
    logAudit({ actorType: 'account', actorId: String(account.id), action: 'login' });
    return {
      token: session.token,
      account: toSafeAccount(account),
      ...this.getAccountSnapshot(account.id),
    };
  },

  logout(sessionToken: string) {
    const db = getDb();
    db.update(accountSessions)
      .set({ status: 'revoked', lastUsedAt: nowIso() } as any)
      .where(eq(accountSessions.tokenHash, sha256(sessionToken)))
      .run();
  },

  createSession(accountId: number) {
    const db = getDb();
    const token = makeOpaqueToken('sess');
    db.insert(accountSessions).values({
      accountId,
      tokenPrefix: tokenPrefix(token),
      tokenHash: sha256(token),
      status: 'active',
      expiresAt: futureIso(30),
      lastUsedAt: nowIso(),
    } as any).run();
    return { token };
  },

  listBindings(accountId: number, projectId?: number) {
    const db = getDb();
    const conditions = [eq(accountMemberBindings.accountId, accountId)];
    if (projectId) conditions.push(eq(accountMemberBindings.projectId, projectId));
    const bindings = db.select().from(accountMemberBindings).where(and(...conditions)).all() as any[];
    if (!bindings.length) return [];
    const identifiers = bindings.map(row => row.memberIdentifier);
    const rows = db.select().from(members).where(inArray(members.identifier, identifiers)).all() as any[];
    return bindings
      .map(binding => {
        const member = rows.find(m => m.identifier === binding.memberIdentifier);
        return member ? { ...MemberService._withStats(member), isDefault: !!binding.isDefault, bindingId: binding.id } : null;
      })
      .filter(Boolean);
  },

  getDefaultMember(accountId: number, preferredMember?: string | null) {
    const db = getDb();
    const bindings = db.select().from(accountMemberBindings).where(eq(accountMemberBindings.accountId, accountId)).orderBy(desc(accountMemberBindings.isDefault), desc(accountMemberBindings.id)).all() as any[];
    if (!bindings.length) return null;
    if (preferredMember) {
      const preferred = bindings.find(binding => binding.memberIdentifier === preferredMember);
      if (preferred) return preferred.memberIdentifier;
    }
    return bindings[0].memberIdentifier as string;
  },

  bindMember(accountId: number, projectId: number, memberIdentifier: string, makeDefault = true) {
    const db = getDb();
    // 成员是全局的，不再按 projectId 过滤 members 表
    const member = db.select().from(members).where(eq(members.identifier, memberIdentifier)).get() as any;
    if (!member) throw new Error('成员不存在');
    const existing = db.select().from(accountMemberBindings).where(and(
      eq(accountMemberBindings.accountId, accountId),
      eq(accountMemberBindings.projectId, projectId),
      eq(accountMemberBindings.memberIdentifier, memberIdentifier),
    )).get() as any;
    if (!existing) {
      db.insert(accountMemberBindings).values({
        accountId,
        projectId,
        memberIdentifier,
        isDefault: makeDefault ? 1 : 0,
      } as any).run();
    }
    if (makeDefault) {
      db.update(accountMemberBindings).set({ isDefault: 0 } as any).where(and(
        eq(accountMemberBindings.accountId, accountId),
        eq(accountMemberBindings.projectId, projectId),
      )).run();
      db.update(accountMemberBindings).set({ isDefault: 1 } as any).where(and(
        eq(accountMemberBindings.accountId, accountId),
        eq(accountMemberBindings.projectId, projectId),
        eq(accountMemberBindings.memberIdentifier, memberIdentifier),
      )).run();
    }
    return MemberService.getByIdentifier(memberIdentifier);
  },

  getAccountSnapshot(accountId: number, preferredMember?: string | null) {
    const db = getDb();
    const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get() as any;
    if (!account) throw new Error('账号不存在');
    const currentMemberIdentifier = this.getDefaultMember(accountId, preferredMember);
    const currentMember = currentMemberIdentifier ? MemberService.getByIdentifier(currentMemberIdentifier) : null;
    return {
      bindings: this.listBindings(accountId),
      currentMember,
    };
  },

  resolvePrincipalByToken(token: string, preferredMember?: string | null): AuthPrincipal | null {
    const db = getDb();
    const tokenHash = sha256(token);

    const session = db.select().from(accountSessions).where(eq(accountSessions.tokenHash, tokenHash)).get() as any;
    if (session && session.status === 'active' && (!session.expiresAt || new Date(session.expiresAt) > new Date())) {
      db.update(accountSessions).set({ lastUsedAt: nowIso() } as any).where(eq(accountSessions.id, session.id)).run();
      const account = db.select().from(accounts).where(eq(accounts.id, session.accountId)).get() as any;
      if (!account || account.status !== 'active') return null;
      return {
        type: 'account',
        authSource: 'session',
        accountId: account.id,
        username: account.username,
        displayName: account.displayName,
        memberIdentifier: this.getDefaultMember(account.id, preferredMember),
      };
    }

    const agentToken = db.select().from(agentTokens).where(eq(agentTokens.tokenHash, tokenHash)).get() as any;
    if (agentToken && agentToken.status === 'active' && (!agentToken.expiresAt || new Date(agentToken.expiresAt) > new Date())) {
      db.update(agentTokens).set({ lastUsedAt: nowIso() } as any).where(eq(agentTokens.id, agentToken.id)).run();
      return {
        type: 'agent',
        authSource: 'agent_token',
        tokenId: agentToken.id,
        clientType: agentToken.clientType,
        memberIdentifier: agentToken.memberIdentifier,
      };
    }

    return null;
  },

  createAgentToken(params: {
    memberIdentifier: string;
    projectId: number;
    clientType?: string;
    name?: string;
    expiresAt?: string | null;
  }) {
    const db = getDb();
    // 先按 identifier 查系统成员（不限项目），兼容旧的按项目查找
    let member = db.select().from(members).where(eq(members.identifier, params.memberIdentifier)).get() as any;
    if (!member) throw new Error('成员不存在');

    const token = makeOpaqueToken('agent');
    db.insert(agentTokens).values({
      projectId: params.projectId,
      memberIdentifier: params.memberIdentifier,
      clientType: params.clientType || 'openclaw',
      name: params.name || `${params.memberIdentifier}-token`,
      tokenPrefix: tokenPrefix(token),
      tokenHash: sha256(token),
      status: 'active',
      expiresAt: params.expiresAt || null,
      lastUsedAt: null,
    } as any).run();

    const created = db.select().from(agentTokens).where(eq(agentTokens.tokenHash, sha256(token))).get() as any;
    logAudit({
      actorType: 'agent',
      actorId: params.memberIdentifier,
      action: 'create_agent_token',
      projectId: params.projectId,
      targetType: 'agent_token',
      targetId: String(created.id),
      metadata: { clientType: created.clientType, name: created.name },
    });
    return {
      token,
      row: created,
    };
  },

  listAgentTokens(memberIdentifier: string, projectId: number) {
    const db = getDb();
    return db.select().from(agentTokens).where(and(
      eq(agentTokens.memberIdentifier, memberIdentifier),
      eq(agentTokens.projectId, projectId),
    )).orderBy(desc(agentTokens.id)).all();
  },

  revokeAgentToken(id: number, memberIdentifier: string, projectId: number) {
    const db = getDb();
    db.update(agentTokens)
      .set({ status: 'revoked' } as any)
      .where(and(eq(agentTokens.id, id), eq(agentTokens.memberIdentifier, memberIdentifier), eq(agentTokens.projectId, projectId)))
      .run();
    logAudit({
      actorType: 'agent',
      actorId: memberIdentifier,
      action: 'revoke_agent_token',
      projectId,
      targetType: 'agent_token',
      targetId: String(id),
    });
  },

  rotateAgentToken(id: number, memberIdentifier: string, projectId: number, clientType?: string, name?: string) {
    this.revokeAgentToken(id, memberIdentifier, projectId);
    return this.createAgentToken({ memberIdentifier, projectId, clientType, name });
  },

  buildOpenClawConfig(params: { memberIdentifier: string; projectId: number; baseUrl: string }) {
    const created = this.createAgentToken({
      memberIdentifier: params.memberIdentifier,
      projectId: params.projectId,
      clientType: 'openclaw',
      name: `${params.memberIdentifier}-openclaw`,
    });
    const sseUrl = `${params.baseUrl}/mcp/sse?token=${encodeURIComponent(created.token)}`;
    const configJson = {
      mcpServers: {
        clawpm: {
          type: 'sse',
          url: sseUrl,
        },
      },
    };
    return {
      token: created.token,
      tokenPrefix: created.row.tokenPrefix,
      sseUrl,
      serverName: 'clawpm',
      configJson,
      configBase64: Buffer.from(JSON.stringify(configJson, null, 2), 'utf8').toString('base64'),
      powershellCommand: `$cfg = @'\n${JSON.stringify(configJson, null, 2)}\n'@; Set-Content -Path .\\mcp.json -Value $cfg`,
      shellCommand: `cat <<'EOF' > mcp.json\n${JSON.stringify(configJson, null, 2)}\nEOF`,
    };
  },
};
