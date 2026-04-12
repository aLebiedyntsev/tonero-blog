# Skill: Repo Map & Application Structure

## All Repositories

Located at: `/Users/antonlebedintsev/Documents/git/mine/<repo-name>`

| Repo | Tech | URL | Purpose |
|---|---|---|---|
| `tonero-api` | Node.js / Express | app.tonero.app (API) | REST API: auth, rewrite relay, billing, voice profiles |
| `tonero-app` | React + Vite | app.tonero.app | User portal SPA |
| `tonero-web` | Static HTML/CSS | tonero.app | Marketing landing page |
| `tonero-extension` | Chrome Extension MV3 | Chrome Web Store | Browser keyboard-triggered rewrite |
| `tonero-macos` | Tauri 2.0 + React | Direct distribution | macOS menu bar app |
| `tonero-notification` | Node.js / Express | Internal only | Email microservice (called by API only) |
| `tonero-infra` | Ansible + Bash | Infrastructure | Deploy scripts, Terraform, Ansible configs |
| `tonero-admin` | React + Vite | admin.tonero.app | Internal admin panel |
| `tonero-blog` | Static/React | blog.tonero.app | Blog |
| `tonero-status` | Static/React | status.tonero.app | Status page |

## Server

- **Server:** `root@46.225.147.249` (Hetzner CPX32, Ubuntu 24.04)
- **Server repo paths:** `/opt/tonero/<repo-name>/`
- **Docker services:** `tonero-api`, `tonero-notification` (managed by docker-compose)
- **Static/SPA services:** `tonero-app`, `tonero-web`, `tonero-admin`, `tonero-blog`, `tonero-status` — built with npm then rsync to nginx webroot

## Production URLs

- API: `https://api.tonero.app`
- User app: `https://app.tonero.app`
- Landing: `https://tonero.app`
- Admin: `https://admin.tonero.app`
- Blog: `https://blog.tonero.app`
- Status: `https://status.tonero.app`

---

## tonero-api Layout

```
src/
  index.js              Express entry — middleware, routes, trust proxy
  db.js                 pg Pool singleton
  tokens.js             JWT sign/verify helpers
  jobs/
    cleanup.js          Daily: delete unconfirmed accounts > 30 days
    renewalReminder.js  Daily: renewal reminder emails 3d and 1d before expiry
  middleware/
    auth.js             Bearer token guard (sets req.user.sub)
    pro-check.js        Pro plan enforcement
  routes/
    auth.js             POST /auth/register|login|refresh|logout|change-password|forgot-password|reset-password
    me.js               GET|PUT /me — user profile + default voice profile
    rewrite.js          POST /rewrite — OpenAI relay with anti-injection hardening
    profiles.js         CRUD for voice profiles + POST /profiles/preview (AI generates 5 examples)
    usage.js            GET /usage — daily breakdown
    billing.js          Stripe checkout, portal, webhook (subscription/invoice events)
db/
  schema.sql            DDL (idempotent, safe to re-run)
  migrations/           Numbered SQL migrations (run manually on prod)
docker-compose.yml      Local dev: postgres + nginx lb + 3 api workers + notification service
nginx.conf              nginx load balancer config (round-robin, 3 workers)
Dockerfile              Node app image
.env.example            All required env vars with comments
```

## tonero-app Layout

```
src/
  App.jsx               Router + auth guard
  pages/                Route-level components (Login, Register, Dashboard, Voice, etc.)
  components/           Shared UI (Voice.jsx, Profile.jsx, etc.)
  hooks/                Custom React hooks
  lib/                  API client, utilities
```

## tonero-extension Layout

```
manifest.json           MV3 manifest (version 1.1.1; permissions: storage/tabs/alarms/notifications)
background.js           Service worker (auth tokens, alarms, badge)
content.js              Injected into all pages — handles shortcut + rewrite flow
popup/                  Popup UI (popup.html + JS/CSS)
_locales/               i18n strings (en, ru, etc.)
icons/                  icon16/32/48/128.png
store-assets/           Chrome Web Store screenshots/promo art
```

## tonero-macos Layout

```
src/                    React frontend (Vite)
src-tauri/              Rust backend (Tauri 2.0)
  tauri.conf.json       App config, version, signing
  Cargo.toml            Rust dependencies
  target/               Build output (gitignored)
scripts/
  redeploy.sh           Fast: debug build → reset Accessibility → install → launch
  reinstall.sh          Full: debug build → uninstall (TCC + keychain) → install → launch
  package.sh            Release: build → DMG + SHA-256 in dist/
  uninstall.sh          Remove from /Applications + reset TCC + keychain
```

## tonero-web Layout

```
index.html        Landing page
app.js            Main JS
styles.css        Main CSS
*.html            Static pages (about, faq, privacy, terms, accessibility, changelog, blog, status)
images/           Image assets
```

## Voice Profiles (Pro Feature)

Creation flow: user provides name + description → `POST /profiles/preview` generates 5 examples via gpt-4o-mini → user picks ≥2 → `POST /profiles` saves them → user sets one as default.

When rewriting, pass `voice_profile_id` instead of `tone`. Backend uses profile description + examples in the OpenAI system prompt.

## Billing States

- `plan` ∈ `{free, pro}`
- `status` ∈ `{active, pending_cancel, past_due}`
- `pending_cancel` — set when `cancel_at_period_end` is truthy on `customer.subscription.updated`
- `past_due` — set on `invoice.payment_failed`
