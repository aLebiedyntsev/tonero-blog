# Skill: Git Workflow & Deploy Pattern

## CRITICAL RULE

**Always commit and push BEFORE running deploy.sh.**

The deploy script does `git pull` on the server — local uncommitted changes are **NEVER** deployed. This is the #1 cause of "my change isn't live" confusion.

---

## Standard Workflow

```bash
# 1. Make changes locally

# 2. Stage and commit
git add -A
git commit -m "feat: description"

# 3. Push to remote
git push

# 4. Deploy (always from tonero-infra)
cd /Users/antonlebedintsev/Documents/git/mine/tonero-infra
bash scripts/deploy.sh <service>
```

---

## Commit Message Convention

| Prefix | When to use |
|---|---|
| `feat:` | New feature or behavior |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `chore:` | Dependencies, configs, maintenance |
| `refactor:` | No behavior change, code reorganization |
| `style:` | Formatting, CSS only |

Examples:
- `feat: add renewal reminder emails 3d and 1d before expiry`
- `fix: stripe portal config missing in live mode`
- `docs: add .agents/skills/ across all repos`

---

## Branch Strategy

- `main` — production branch (what `deploy.sh` pulls by default)
- Feature branches: `feat/<name>`, `fix/<name>`
- Deploy from a feature branch: `bash scripts/deploy.sh api feat/voice-redesign`

---

## Multi-Repo Deploy (API + App changes)

When a change spans multiple repos, **always deploy the backend first**:

```bash
# 1. Commit + push all affected repos
cd /Users/antonlebedintsev/Documents/git/mine/tonero-api
git add -A && git commit -m "feat: ..." && git push

cd /Users/antonlebedintsev/Documents/git/mine/tonero-app
git add -A && git commit -m "feat: ..." && git push

# 2. Deploy API first (backend must be live before new frontend hits it)
cd /Users/antonlebedintsev/Documents/git/mine/tonero-infra
bash scripts/deploy.sh api

# 3. Verify API is healthy, then deploy frontend
bash scripts/deploy.sh app
```

---

## Verifying After Deploy

```bash
# Check docker logs (from local)
ssh root@46.225.147.249 "docker logs tonero-api-api-1 --tail 30"

# Hard-refresh browser to bypass local cache: Cmd+Shift+R
# Cloudflare cache is auto-purged by deploy.sh

# Test via curl
curl -s https://api.tonero.app/health
```

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| Changed code but not deployed | `git add -A && git commit && git push && deploy.sh` |
| Deployed but changes not live | Check: `git push` done? Correct branch? |
| Wrong env var on server | SSH → `cat /opt/tonero/<repo>/.env` |
| Stale Cloudflare cache | `deploy.sh` purges automatically; try Cmd+Shift+R |
| Docker container crashed | `docker logs tonero-api-api-1 --tail 100` for errors |

---

## Checking Current Server State

```bash
# From tonero-infra:
bash scripts/discover.sh

# Or manually:
ssh root@46.225.147.249 "docker ps && echo '---' && df -h"
```
