FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --workspace=@solar-bess/worker --include-workspace-root
COPY apps/worker apps/worker
RUN npm run build --workspace=@solar-bess/worker

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --omit=dev --workspace=@solar-bess/worker --include-workspace-root && npm cache clean --force
COPY --from=build /app/apps/worker/dist apps/worker/dist
USER node
CMD ["node", "apps/worker/dist/main.js"]
