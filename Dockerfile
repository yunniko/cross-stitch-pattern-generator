# Production images. Build & run both services: docker compose --profile app up -d --build
# Two runtime targets share one build: `runtime` (the Next app) and `processor` (generation, G-034 M2).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --legacy-peer-deps works around a current npm/arborist crash
# ("Cannot read properties of null (reading 'edgesOut')") hit resolving this
# dependency set's peer deps -- see svc-lab/HANDOVER.md D7.
RUN npm ci --legacy-peer-deps

# The Rust sidecar the processor runs its jobs in (G-048 M6, D190, D193). Built against this image's own musl, so the
# static binary runs in the alpine runtime below; `rust/` plus the two assets its crates embed are the whole input.
FROM rust:1.96-alpine AS rust
RUN apk add --no-cache musl-dev
WORKDIR /src
# The target-cpu baseline (G-071). Cargo reads config from the working directory upwards, so this must be
# here at /src beside the build command - not inside rust/, where it would be ignored.
COPY .cargo ./.cargo
COPY rust ./rust
COPY public/stitch-texture.png ./public/stitch-texture.png
COPY public/fonts/DejaVuSans.ttf ./public/fonts/DejaVuSans.ttf
RUN cargo build --release --manifest-path rust/Cargo.toml -p cs-job

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The commit a crash report names, so a stack from the minified bundle can be read against the code that made it
# (G-066 M2). Unset it and the report says "unknown"; the deploy command passes it.
ARG APP_COMMIT=unknown
ENV NEXT_PUBLIC_APP_COMMIT=$APP_COMMIT
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
# Generation and every server export run here, and only here (D190, D221). There is no fallback behind it: a
# missing binary means the processor cannot do its job, and says so.
COPY --from=rust /src/rust/target/release/cs-job ./bin/cs-job
# The export font and the stitch texture come with the bundle: `npm run build:processor` copies them into
# `dist/processor/assets`, so the same layout works here and wherever else the bundle runs (D153).

EXPOSE 8081
CMD ["node", "processor/server.mjs"]
