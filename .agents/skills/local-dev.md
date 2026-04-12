# Skill: Local Development Setup

## tonero-api (Express + PostgreSQL)

```bash
cd /Users/antonlebedintsev/Documents/git/mine/tonero-api
cp .env.example .env      # fill in required env vars

# Start everything (db + nginx lb + 3 api workers + notification)
docker compose up -d

# Run API with hot reload (if running outside Docker)
npm run dev               # nodemon src/index.js
```

- API available at: `http://localhost:3000` (or port in `.env`)
- DB init/reset: `psql $DATABASE_URL -f db/schema.sql` (idempotent)
- DB migrations: run numbered files in `db/migrations/` manually

## tonero-notification (Email microservice)

```bash
cd /Users/antonlebedintsev/Documents/git/mine/tonero-notification
cp .env.example .env      # SENDGRID_API_KEY, etc.
npm run dev               # nodemon src/index.js
```

Usually started automatically as part of the API's `docker compose up`.

## tonero-app (React SPA — user portal)

```bash
cd /Users/antonlebedintsev/Documents/git/mine/tonero-app
npm install
npm run dev               # Vite → http://localhost:5173
```

Point `VITE_API_URL` to local API (`http://localhost:3000`) in `.env.local` if needed.

## tonero-web (Landing page — static HTML)

No build step. Open directly or use a static server:

```bash
cd /Users/antonlebedintsev/Documents/git/mine/tonero-web
npx serve .               # http://localhost:3000
# or just open index.html in browser
```

## tonero-extension (Chrome Extension)

No build step. Load unpacked in Chrome:

1. `chrome://extensions/` → **Developer Mode ON**
2. **Load unpacked** → select `tonero-extension/`
3. Clicking reload icon after changes

## tonero-macos (Tauri 2.0)

```bash
cd /Users/antonlebedintsev/Documents/git/mine/tonero-macos
npm run dev               # tauri dev — hot reload for React + Rust
```

Requires Rust toolchain. See `macos-dev.md` for full details.

## tonero-admin / tonero-blog / tonero-status

```bash
cd /Users/antonlebedintsev/Documents/git/mine/<repo>
npm install
npm run dev
```

## Required Environment Variables

Copy `.env.example` to `.env` in each service and fill in:

| Variable | Used in |
|---|---|
| `DATABASE_URL` | tonero-api |
| `JWT_SECRET` | tonero-api |
| `JWT_REFRESH_SECRET` | tonero-api |
| `OPENAI_API_KEY` | tonero-api |
| `STRIPE_SECRET_KEY` | tonero-api |
| `STRIPE_WEBHOOK_SECRET` | tonero-api |
| `STRIPE_PORTAL_CONFIG` | tonero-api (live portal config ID `bpc_*`) |
| `SENDGRID_API_KEY` | tonero-notification |
| `CLOUDFLARE_API_TOKEN` | tonero-infra deploy.sh |

## Useful Commands

```bash
# View API logs in Docker
docker logs tonero-api-api-1 --tail 50 -f

# Connect to local DB
psql $DATABASE_URL

# Check what's running
docker ps

# Restart API container only
docker compose restart api
```
