# Single-service image: builds the React SPA and runs the Bun/Express API that also
# serves that SPA. Deployed as one Render Web Service (see render.yaml / DEPLOYMENT.md).
FROM oven/bun:1 AS base
WORKDIR /app

# Install deps first for better layer caching. Copy every workspace manifest so Bun can
# resolve the workspace graph, then install against the committed lockfile.
COPY package.json bun.lock ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN bun install --frozen-lockfile

# Copy the rest of the source and build the client bundle into apps/client/dist.
COPY . .
RUN bun run --filter @care/client build

ENV NODE_ENV=production
# Render provides PORT at runtime; index.ts reads process.env.PORT (default 3000).
EXPOSE 3000
CMD ["bun", "apps/server/src/index.ts"]
