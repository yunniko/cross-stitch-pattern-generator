# Production image. Build & run: docker compose --profile app up -d --build
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
RUN npm run build

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
