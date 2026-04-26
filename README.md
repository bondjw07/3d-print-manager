# 3D Print Management Portal

Enterprise-style MVP for managing a 3D printing operation across catalog, requests, queue planning, inventory, and marketplace listings.

## Stack

- Next.js 16 + TypeScript (App Router)
- PostgreSQL
- Prisma ORM + SQL migrations
- Tailwind CSS
- Zod validation
- Local credential auth, plus mocked marketplace provider and AI listing provider behind service interfaces
- Local filesystem image storage abstraction (`/uploads/products`, mirrored to `/public/uploads/products`)

## What This Build Includes

- Admin dashboard with operational summaries
- Product catalog management
  - create/edit products
  - status/visibility management
  - product detail view with related listings/requests/queue
  - URL import workflow for draft product creation (Thangs + MyMiniFactory)
  - creator bulk import (Thangs page discovery + MyMiniFactory public creator API)
  - duplicate prevention using stable source product IDs
- Product image management
  - upload images
  - set primary image
  - delete images
- Filament catalog + per-product filament requirements
- Request user flow
  - submit requests
  - track own requests
- Admin request management
  - review/update statuses
  - convert request to queue item
- Queue management
  - create/update queue items
  - status/source/priority filtering
  - filament demand aggregation across active queue work
- Inventory management
  - update on-hand/reserved/committed/threshold
  - available quantity and low-stock indicator
- Marketplace listing management
  - create/update listing records
  - mocked publish/update/remove/refresh actions
- Mock marketplace events
  - simulate events
  - process sale events into queue items and inventory commitment
- Global settings
  - default marketplace for public Buy button logic
  - MyMiniFactory OAuth credential + token configuration for creator bulk imports
- Seeded demo dataset (users, products, filaments, listings, requests, queue, inventory, events)

## Local Setup

### 1) Install dependencies

```bash
npm install
```

### 2) Start PostgreSQL (Docker)

```bash
docker compose up -d
```

Default DB credentials are defined in `docker-compose.yml` and `.env`.
Set `APP_ENCRYPTION_KEY` in `.env` before saving MyMiniFactory OAuth credentials. Set `APP_URL` to your app base URL for OAuth callback/refresh consistency.

### 3) Generate Prisma client + apply migrations

```bash
npm run db:generate
npm run db:migrate
```

### 4) Seed data

```bash
npm run db:seed
```

### 5) Run the app

```bash
npm run dev
```

Open: [http://localhost:3000](http://localhost:3000)

## Seeded Users

Use `/login` with these demo credentials:

- `admin@portal.local` / `admin123!` (ADMIN)
- `alex@portal.local` / `alex123!` (REQUEST_USER)
- `mia@portal.local` / `mia123!` (REQUEST_USER)

## Key Routes

Public:

- `/catalog`
- `/catalog/[slug]`
- `/login`
- `/my-requests` (request user only)

Admin:

- `/admin`
- `/admin/products`
- `/admin/filaments`
- `/admin/listings`
- `/admin/requests`
- `/admin/queue`
- `/admin/inventory`
- `/admin/settings`

On `/admin/products`, use **Imports** for:

- single URL import (`thangs.com` and `myminifactory.com`)
- bulk URL import
- Thangs creator bulk import
- MyMiniFactory creator bulk import (public objects only, requires OAuth setup in `/admin/settings`)

Imports are deduped by source + source product ID when available, with URL fallback matching.

## Architecture Notes

- `src/server/services/*`: domain/business logic
- `src/server/actions/portal-actions.ts`: validated server actions
- `src/server/auth/*`: credential auth/session boundaries (ready for provider swap)
- `src/server/marketplace/*`: mocked marketplace adapter interface
- `src/server/ai/*`: mocked AI content adapter interface
- `src/server/storage/*`: storage abstraction + local implementation
- `src/app/api/upload/product-image/route.ts`: upload API endpoint

## Database

- Prisma schema: `prisma/schema.prisma`
- Initial migration: `prisma/migrations/202604130001_initial/migration.sql`
- Import dedupe migration: `prisma/migrations/202604130002_add_import_identity_dedupe/migration.sql`
- User password hash migration: `prisma/migrations/202604200004_add_user_password_hash/migration.sql`
- Seed script: `prisma/seed.ts`

## Notes

- This MVP is intentionally mocked for marketplace/AI while preserving clean extension points.
- Product images include seeded placeholders under `public/seed-images` plus runtime uploads under `uploads/products` (mirrored to `public/uploads/products` for backward compatibility).

## Deployment (Unraid, Self-Contained)

This project is designed to run as a **single stack** with:

- the Next.js app container
- an internal PostgreSQL container

No external MariaDB/Redis/cache service is required for this MVP.

### Files Included For Unraid Deployment

- `Dockerfile`: production app image build
- `docker-compose.unraid.yml`: app + postgres stack
- `.env.production.example`: production env template
- `.github/workflows/publish-image.yml`: auto-build/push image to GHCR on `dev` and `main`

### 1) Enable Docker Image Publishing From Repo

Push this repository to GitHub on either `dev` or `main`.
The workflow in `.github/workflows/publish-image.yml` publishes:

- `ghcr.io/<owner>/<repo>:dev` (when pushing `dev`)
- `ghcr.io/<owner>/<repo>:main` (when pushing `main`)
- `ghcr.io/<owner>/<repo>:latest`
- `ghcr.io/<owner>/<repo>:sha-<commit>`

If the GitHub repository is private, authenticate your Unraid Docker host to GHCR:

```bash
docker login ghcr.io -u <github-username>
```

### 2) Prepare Unraid App Directory

On Unraid, create a folder for this app, for example:

- `/mnt/user/appdata/print-portal`

Copy these files there:

- `docker-compose.unraid.yml`
- `.env.production.example` (rename to `.env.production`)

The compose file mounts `print_portal_uploads` at both `/app/uploads` and `/app/public/uploads` so image storage stays compatible across older and newer app versions.

Edit `.env.production`:

- set a strong `POSTGRES_PASSWORD`
- set `APP_IMAGE` to your GHCR image tag:
  - `ghcr.io/your-owner/your-repo:dev` for dev deployments
  - `ghcr.io/your-owner/your-repo:main` for main deployments
- keep `DATABASE_URL` in sync with the same password

### 3) Start The Stack

From the folder that contains `docker-compose.unraid.yml` and `.env.production`:

```bash
docker compose --env-file .env.production -f docker-compose.unraid.yml up -d
```

The app starts on port `APP_PORT` (default `3000`).

### 4) Seed Demo Data (Optional, First Run)

```bash
docker compose --env-file .env.production -f docker-compose.unraid.yml exec app npm run db:seed
```

### 5) Put It Behind Your Reverse Proxy

Point Nginx Proxy Manager / Traefik at:

- `<unraid-ip>:3000` (or your custom `APP_PORT`)

### 6) Updates From Repo

Recommended flow:

1. Push code to your deployment branch (`dev` or `main`).
2. GitHub Actions builds and pushes new GHCR image tag for that branch.
3. Unraid auto-updater (or Watchtower) pulls and restarts container.

Manual update command:

```bash
docker compose --env-file .env.production -f docker-compose.unraid.yml pull
docker compose --env-file .env.production -f docker-compose.unraid.yml up -d
```

### 7) Backups

Back up both:

- PostgreSQL volume (`print_portal_postgres`)
- upload files volume (`print_portal_uploads`)

Minimal Postgres dump example:

```bash
docker exec print-portal-postgres pg_dump -U printportal printportal > printportal-backup.sql
```

### 8) Repair Missing Product Images (If Needed)

If image paths exist in the database but files are missing on disk (for example after running with an incorrect upload volume mapping), run the repair script from the app container:

Dry run (no changes):

```bash
docker compose --env-file .env.production -f docker-compose.unraid.yml exec app npm run images:repair-missing
```

Apply fixes:

```bash
docker compose --env-file .env.production -f docker-compose.unraid.yml exec app npm run images:repair-missing -- --apply
```

What it does:

- finds product image records whose files are missing under `/app/uploads/products` and `/app/public/uploads/products`
- removes broken image rows
- restores images from `importSourceUrl` (or `Imported URL` notes) when available
- reassigns a valid primary image when needed
