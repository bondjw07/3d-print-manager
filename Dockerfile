FROM node:22-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM base AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
# Prisma config requires DATABASE_URL even for client generation.
ENV DATABASE_URL=postgresql://printportal:printportal@localhost:5432/printportal?schema=public

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client + build the app.
RUN npm run db:generate && npm run build

FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder /app ./

EXPOSE 3000

# Apply DB migrations at startup, then launch Next.js.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
