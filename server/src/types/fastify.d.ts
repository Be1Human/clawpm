import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    clawpmUser: string | null;
  }
}
