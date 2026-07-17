FROM node:22-alpine AS base

# Install pnpm in base image
RUN corepack enable pnpm

FROM base AS builder
WORKDIR /app

# copy pnpm specific files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# copy project related files
COPY packages/tsconfig ./packages/tsconfig
COPY packages/page-models ./packages/page-models
COPY packages/email-editor ./packages/email-editor
COPY packages/common-models ./packages/common-models
COPY packages/common-logic ./packages/common-logic
COPY packages/orm-models ./packages/orm-models
COPY packages/utils ./packages/utils
COPY apps/queue ./apps/queue

# Install dependencies and build. Declaration-file generation for
# @courselit/queue itself is skipped: it's a runnable service, not a
# package anything imports types from, and its dts rollup is the one
# build step that exceeds Docker Desktop's default memory ceiling.
RUN pnpm install
RUN pnpm --filter "!@courselit/queue" build
RUN pnpm --filter @courselit/queue exec tsup --no-dts

# Production image
FROM base AS runner

ENV NODE_ENV=production
WORKDIR /app

# Copy all necessary files
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/queue ./apps/queue

# Install production dependencies
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

CMD ["pnpm", "--filter", "@courselit/queue", "start"]
