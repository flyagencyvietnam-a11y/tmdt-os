# syntax=docker/dockerfile:1
# VMG TMĐT OS — image production. SPEC Mục 5.3 (self-host, hạ tầng VN).

FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build không cần DB thật (client DB khởi tạo lazy).
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3000
# Áp migration rồi khởi động.
CMD ["sh", "-c", "npm run db:migrate && npm run start"]
