# syntax=docker/dockerfile:1

# ---- Derleme ----------------------------------------------------------------
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

# Önce yalnızca manifestler: bağımlılık katmanı kaynak değişince yeniden kurulmaz.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
# İsteğe bağlı `ca_bundle` secret'ı: TLS'i kesen kurumsal vekil arkasında derlemek için
#   docker build --secret id=ca_bundle,src=/yol/ca.crt .
RUN --mount=type=secret,id=ca_bundle,required=false \
    if [ -f /run/secrets/ca_bundle ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_bundle; fi; \
    pnpm install --frozen-lockfile

COPY . .
RUN --mount=type=secret,id=ca_bundle,required=false \
    if [ -f /run/secrets/ca_bundle ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca_bundle; fi; \
    pnpm --filter @clipboard/web build \
 && pnpm --filter @clipboard/server build \
 && pnpm --filter @clipboard/server deploy --prod --legacy /out

# ---- Çalışma zamanı -----------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    STATIC_DIR=/app/public \
    STORAGE_DIR=/data/files
WORKDIR /app

COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/web/dist ./public

RUN mkdir -p /data/files && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "dist/index.js"]
