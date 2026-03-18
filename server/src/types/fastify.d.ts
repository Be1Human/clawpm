import 'fastify';

declare module 'fastify' {
  interface ClawpmPrincipalBase {
    authSource: 'session' | 'agent_token' | 'legacy_api_token';
    memberIdentifier: string | null;
  }

  type ClawpmPrincipal =
    | (ClawpmPrincipalBase & {
        type: 'account';
        accountId: number;
        username: string;
        displayName: string;
      })
    | (ClawpmPrincipalBase & {
        type: 'agent';
        tokenId: number;
        clientType: string;
      })
    | (ClawpmPrincipalBase & {
        type: 'legacy';
      });

  interface FastifyRequest {
    clawpmUser: string | null;
    clawpmMember: string | null;
    clawpmPrincipal: ClawpmPrincipal | null;
  }
}
