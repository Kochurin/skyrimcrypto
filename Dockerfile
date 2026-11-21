# Продакшен-сборка SkyrimCrypto (этап 5, NFR-10): два образа из одного файла.
#   target api — сервер K2 (Fastify), без прав root
#   target web — Caddy: HTTPS, заголовки безопасности, раздача собранного сайта K1.1
# Запуск: docker compose --profile prod up -d --build  (см. README)

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/crypto/package.json packages/crypto/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

FROM deps AS build-web
COPY tsconfig.base.json ./
COPY packages/crypto packages/crypto
COPY apps/web apps/web
RUN npm run build -w @cn/web

FROM node:22-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY package.json tsconfig.base.json ./
COPY packages/crypto packages/crypto
COPY apps/api apps/api
USER node
EXPOSE 8787
CMD ["node", "node_modules/tsx/dist/cli.mjs", "apps/api/src/server.ts"]

FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build-web /app/apps/web/dist /srv
