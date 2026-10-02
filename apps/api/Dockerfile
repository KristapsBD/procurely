FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
 && corepack enable
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api
RUN pnpm install --frozen-lockfile --filter @procurely/api...
RUN pnpm --filter @procurely/api build
WORKDIR /repo/apps/api
EXPOSE 3000
# Migrations run as the database owner (DIRECT_URL); the API itself connects as the restricted role.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
