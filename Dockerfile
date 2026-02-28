FROM node:20-alpine AS builder

RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile

COPY server/ server/
COPY web/ web/
RUN pnpm --filter @clawpm/server build
RUN pnpm --filter @clawpm/web build

FROM node:20-alpine

WORKDIR /app
RUN mkdir -p /app/data

COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/web/dist ./web/dist

EXPOSE 3210
CMD ["node", "server/dist/index.js"]
