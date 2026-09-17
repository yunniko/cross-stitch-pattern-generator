# Production images. Build & run both services: docker compose --profile app up -d --build
# Two runtime targets share one build: `runtime` (the Next app) and `processor` (generation, G-034 M2).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --legacy-peer-deps works around a current npm/arborist crash
# ("Cannot read properties of null (reading 'edgesOut')") hit resolving this
# dependency set's peer deps -- see svc-lab/HANDOVER.md D7.
RUN npm ci --legacy-peer-deps

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Inlined into the client bundle by `next build`, so it is a build argument rather than a runtime
# variable: "server" routes generation through the processor, "browser" keeps the Web Worker (D151).
ARG NEXT_PUBLIC_PROCESSING=browser
ENV NEXT_PUBLIC_PROCESSING=$NEXT_PUBLIC_PROCESSING
RUN npm run build && npm run build:processor

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]

# The generation service: the bundled processor plus the one dependency that cannot be bundled.
FROM node:22-alpine AS processor
WORKDIR /app
ENV NODE_ENV=production
ENV PROCESSOR_PORT=8081

COPY --from=build /app/dist/processor ./processor
# @napi-rs/canvas is a native addon (D150), so it is installed rather than bundled. The musl builds come
# from the same alpine `deps` stage, so the binary matches this image's libc.
COPY --from=deps /app/node_modules/@napi-rs ./node_modules/@napi-rs
# The export font and the stitch texture come with the bundle: `npm run build:processor` copies them into
# `dist/processor/assets`, so the same layout works here and wherever else the bundle runs (D153).

EXPOSE 8081
CMD ["node", "processor/server.mjs"]
