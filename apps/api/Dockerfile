FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --workspace=@solar-bess/api --include-workspace-root
COPY apps/api apps/api
RUN npm run build --workspace=@solar-bess/api

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --omit=dev --workspace=@solar-bess/api --include-workspace-root && npm cache clean --force
COPY --from=build /app/apps/api/dist apps/api/dist
COPY docs/openapi/openapi.yaml docs/openapi/openapi.yaml
USER node
CMD ["sh", "-c", "npm run migration:run:prod --workspace=@solar-bess/api && node apps/api/dist/main.js"]
