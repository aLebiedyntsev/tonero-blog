# Skill: Deployment Flow

## Overview

All services deploy via a single script in `tonero-infra`:

```bash
cd /Users/antonlebedintsev/Documents/git/mine/tonero-infra
bash scripts/deploy.sh <service> [branch]
```

## Prerequisites

1. SSH agent running with the server key loaded (`ssh-add ~/.ssh/id_ed25519` or similar)
2. `CLOUDFLARE_API_TOKEN` env var set — or source it first:
   ```bash
   source scripts/tf-env.sh
   ```

## Services

| Alias | Repo deployed | Type |
|---|---|---|
| `api` | tonero-api | Docker (compose up --build) |
| `notification` | tonero-notification | Docker (compose up --build) |
| `app` | tonero-app | npm build + rsync to nginx |
| `web` | tonero-web | npm build + rsync to nginx |
| `admin` | tonero-admin | npm build + rsync to nginx |
| `blog` | tonero-blog | npm build + rsync to nginx |
| `status` | tonero-status | npm build + rsync to nginx |
| `all` | all of the above | sequential |

## Deploy Flow (per service)

1. SSH to `root@46.225.147.249`
2. `git pull origin <branch>` in `/opt/tonero/<repo>/`
3. **Docker services** (`api`, `notification`):
   ```bash
   docker compose up -d --build --remove-orphans
   ```
4. **Frontend services** (`app`, `web`, `admin`, `blog`, `status`):
   ```bash
   npm ci && npm run build
   # rsync build output → nginx webroot
   ```
5. Purge Cloudflare cache for the `tonero.app` zone automatically

## Examples

```bash
# Deploy API only (main branch)
bash scripts/deploy.sh api

# Deploy app from a feature branch
bash scripts/deploy.sh app feat/voice-redesign

# Deploy everything
bash scripts/deploy.sh all

# Deploy with explicit branch
bash scripts/deploy.sh notification fix/email-retry
```

## CRITICAL: Commit Before Deploy

The deploy script does `git pull` on the server.
**Local uncommitted changes are NEVER deployed.**

Always:
```bash
git add -A && git commit -m "..." && git push
# then:
bash scripts/deploy.sh <service>
```

## Checking Logs After Deploy

```bash
# SSH in
ssh root@46.225.147.249

# Docker logs
docker logs tonero-api-api-1 --tail 50
docker logs tonero-api-notification-1 --tail 50

# Or from local:
ssh root@46.225.147.249 "docker logs tonero-api-api-1 --tail 30"
```

## Additional Scripts

- `scripts/tf-env.sh` — exports Cloudflare + Terraform env vars from local secrets
- `scripts/discover.sh` — inspect server state (docker ps, nginx status, disk, etc.)

## Server Info

- **IP:** `46.225.147.249` (resolved from `ansible/inventory/hosts.yml`)
- **Server repo paths:** `/opt/tonero/<repo-name>/`
- **Docker compose:** lives inside `/opt/tonero/tonero-api/`
