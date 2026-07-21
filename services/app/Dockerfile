FROM node:22-alpine AS base

# Install pnpm in base image
RUN corepack enable pnpm

# ---------------------------------------------------------------------------
# builder — dependency install is a manifests-only cached layer so that a
# pure source edit (the common case) reuses the install instead of re-running
# it. Ordering: lockfile + every workspace package.json first, `pnpm install`
# (cached), THEN the sources. Only prepublishOnly scripts build these packages
# and those never fire on install, so installing before sources is safe.
# The pnpm store and Next's .next/cache ride BuildKit cache mounts, so they
# persist across the fresh `git archive` build dirs (and on the Hetzner box).
# ---------------------------------------------------------------------------
FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN pnpm config set store-dir /pnpm/store

# -- Layer A: dependency graph only (busts only on a lockfile/manifest change)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/icons/package.json packages/icons/
COPY packages/tailwind-config/package.json packages/tailwind-config/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/page-models/package.json packages/page-models/
COPY packages/email-editor/package.json packages/email-editor/
COPY packages/common-models/package.json packages/common-models/
COPY packages/common-logic/package.json packages/common-logic/
COPY packages/orm-models/package.json packages/orm-models/
COPY packages/page-primitives/package.json packages/page-primitives/
COPY packages/page-blocks/package.json packages/page-blocks/
COPY packages/components-library/package.json packages/components-library/
COPY packages/text-editor/package.json packages/text-editor/
COPY packages/utils/package.json packages/utils/
COPY apps/web/package.json apps/web/
# sharing=locked: concurrent builds are normal on this project; the default
# shared mode can corrupt the store under contention.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install

# -- Layer B: sources (busts on any edit; the install layer above stays cached).
# Same package list as the deps COPY above; NOT `COPY packages ./packages`,
# which would also pull in packages/scripts (nothing imports it) and next-env
# noise. node_modules created by install survive these copies (COPY adds/
# overwrites files, never deletes; sources carry no node_modules — dockerignored).
COPY packages/icons packages/icons
COPY packages/tailwind-config packages/tailwind-config
COPY packages/tsconfig packages/tsconfig
COPY packages/page-models packages/page-models
COPY packages/email-editor packages/email-editor
COPY packages/common-models packages/common-models
COPY packages/common-logic packages/common-logic
COPY packages/orm-models packages/orm-models
COPY packages/page-primitives packages/page-primitives
COPY packages/page-blocks packages/page-blocks
COPY packages/components-library packages/components-library
COPY packages/text-editor packages/text-editor
COPY packages/utils packages/utils
COPY apps/web apps/web

# The standalone Next.js build evaluates next.config.js at build time, so
# the media server origin must be known here for next/image to allowlist
# it. Only needed when MediaLit is served over plain HTTP or from a
# private host (e.g. local rigs); leaving it unset produces exactly the
# previous behavior.
ARG MEDIALIT_SERVER
ENV MEDIALIT_SERVER=$MEDIALIT_SERVER

# Build all workspaces. The .next/cache mount preserves Next's incremental
# artifacts (TypeScript .tsbuildinfo etc.) across builds; it is NOT copied
# into the runtime image (runner takes only standalone/static/public below).
RUN --mount=type=cache,id=next-cache,target=/app/apps/web/.next/cache,sharing=locked \
    pnpm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/next.config.js ./apps/web
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/next.config.js ./

USER nextjs

ENV PORT=${PORT:-3000}

CMD ["node", "apps/web/server.js"]
