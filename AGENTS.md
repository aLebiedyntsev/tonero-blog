# AGENTS.md — tonero-blog

## Purpose
AI-powered blog post generator for tonero.app. Runs on a cron schedule via GitHub Actions and publishes posts to the production server.

## Repo layout
```
generate.js          Topic-based post generator (from curated topic list)
generate-news.js     News-inspired post generator (from RSS feeds)
build.js             Reads posts/*.json, emits public/posts/*.html + manifest.js
posts/               Source JSON for each post
public/posts/        Built HTML pages + manifest.js (deployed to tonero-web)
.github/workflows/
  generate.yml       Cron workflow (Monday + Thursday 09:00 UTC)
```

## Post generation modes

### 1. Topic-based (`generate.js`)
Picks a topic from a curated list, calls GPT-4o Mini, saves `posts/YYYY-MM-DD-slug.json`.

```bash
node generate.js
# or override topic:
TOPIC_OVERRIDE="remote work culture" node generate.js
```

### 2. News-inspired (`generate-news.js`)
Fetches the latest RSS items from one of many configured feeds, selects the most communication-relevant article (filtering violence/war), and rewrites it as a Tonero-branded post.

```bash
node generate-news.js               # random feed, auto-pick article
FEED_ID=techcrunch node generate-news.js   # specific pre-configured feed
FEED_URL=https://...  node generate-news.js   # custom RSS URL
ARTICLE_URL=https://... ARTICLE_TITLE="…" node generate-news.js   # exact article
```

#### News age filtering
`NEWS_MAX_AGE_DAYS` (int, default `3`): articles older than N days are excluded.  
Set to `0` to disable the filter (include all articles regardless of date).  
This is set by the admin panel when triggering generation via the API.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | GPT-4o / GPT-4o Mini API key |
| `FEED_ID` | No | Pre-configured feed ID (e.g. `techcrunch`, `npr-politics`) |
| `FEED_URL` | No | Custom RSS feed URL (overrides FEED_ID) |
| `ARTICLE_URL` | No | Force-use a specific article URL |
| `ARTICLE_TITLE` | No | Title for forced article (used with ARTICLE_URL) |
| `MODEL_OVERRIDE` | No | OpenAI model to use (default: gpt-4o-mini) |
| `FEED_CATEGORY` | No | `world` or `tech` — filters the random feed pool |
| `NEWS_MAX_AGE_DAYS` | No | Only include articles published within N days (default: 3) |

## Build pipeline

```bash
node build.js
# Reads posts/*.json
# Emits public/posts/<slug>.html for each post
# Emits public/posts/manifest.js (array of all post metadata)
```

Built output is deployed to `/opt/tonero/tonero-web/posts/` on the production server.

## GitHub Actions workflow

`.github/workflows/generate.yml` runs on schedule (Monday + Thursday 09:00 UTC) or manually:
1. `npm ci`
2. `node generate-news.js` — picks a fresh article from a random feed
3. Commits the new `posts/*.json` file
4. SSHs to the server: `node build.js && rsync public/posts/ → tonero-web/posts/`
5. Purges the Cloudflare cache for `tonero.app/posts/*`

## Post JSON format

```json
{
  "slug": "why-slack-messages-kill-your-career",
  "title": "…",
  "description": "155-char meta description",
  "tags": ["slack", "communication"],
  "emoji": "💬",
  "readTime": "6 min",
  "date": "2026-04-07",
  "topicSeed": "original topic or article URL",
  "body": "<p>Full HTML body…</p>"
}
```

## Admin-triggered generation

`POST /admin/blog/generate-from-news` in `tonero-api` spawns `node generate-news.js` with env vars:
- `FEED_ID`, `FEED_URL`, `ARTICLE_URL`, `MODEL_OVERRIDE`, `FEED_CATEGORY`, `NEWS_MAX_AGE_DAYS`
- After the script exits successfully, the API runs `node build.js` and deploys

## Key decisions
- **No database** — posts stored as JSON files on disk; fast to deploy, easy to inspect
- **Single-file post format** — JSON with embedded HTML body; no templating engine needed at generation time
- **Disclosure required** — every news-inspired post links back to the original article (enforced in the GPT prompt)
- **Violence filter** — `EXCLUDE_RE` regex blocks categories like war/military/crime from being selected
