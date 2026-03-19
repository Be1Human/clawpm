FROM node:20-alpine AS web-builder

WORKDIR /app/web
ARG CLAWPM_WEB_BASE_PATH=/
ENV CLAWPM_WEB_BASE_PATH=$CLAWPM_WEB_BASE_PATH
COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

FROM node:20-alpine AS server-builder

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci

COPY server/ ./
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine

ENV NODE_ENV=production \
    CLAWPM_PORT=3210 \
    CLAWPM_DB_PATH=/app/data/clawpm.db

WORKDIR /app
RUN mkdir -p /app/data

COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=server-builder /app/server/package.json ./server/package.json
COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY --from=web-builder /app/web/dist ./web/dist

EXPOSE 3210
CMD ["node", "server/dist/index.js"]
