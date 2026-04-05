# tonero-blog

AI-powered blog generator for [tonero.app](https://tonero.app).  
Generates SEO-optimized, click-bait–style blog posts that promote Tonero and attract organic search traffic. Publishes twice a week via GitHub Actions.

## How it works

1. **`generate.js`** — picks a topic from a curated list, calls OpenAI GPT-4o, saves the post as `posts/YYYY-MM-DD-slug.json`
2. **`build.js`** — reads all post JSON files, generates individual HTML pages in `public/posts/`, and generates `public/posts/manifest.js` (a JS data file listing all post metadata)
3. **GitHub Actions** (`.github/workflows/generate.yml`) — runs every Monday and Thursday at 09:00 UTC, commits the new post, then SSHs to the server to build and deploy

## Output

Posts are deployed to `/opt/tonero/tonero-web/posts/` on the production server, so they're served at:

- `https://tonero.app/posts/<slug>.html` — individual post
- `https://tonero.app/posts/manifest.js` — post list loaded by `blog.html` and `index.html`

## Local setup

```bash
cp .env.example .env
# Add your OPENAI_API_KEY to .env
npm install

# Generate one post
npm run generate

# Build HTML output
npm run build

# Or both in one step
npm run gen-and-build
```

The built files will be in `public/posts/`. For local preview, open any `.html` file there in a browser (note: relative paths assume the file is served from the `tonero-web` root, so styles/images won't load from the `public/posts/` directory directly without a web server pointing to `tonero-web/`).

## Manual trigger

In the GitHub Actions UI: **Actions → Generate Blog Post → Run workflow**.  
You can optionally supply a `topic_override` to specify the exact topic.

## GitHub Secrets required

| Secret | Description |
|--------|-------------|
| `OPENAI_API_KEY` | OpenAI API key (same one used by tonero-api) |
| `DEPLOY_SSH_KEY` | Private SSH key for `root@<server>` |
| `SERVER_HOST` | Server IP or hostname |
| `CLOUDFLARE_API_TOKEN` | CF token with Zone:Cache Purge for tonero.app |

## Post format (posts/*.json)

```json
{
  "slug": "why-slack-messages-kill-your-career",
  "title": "Why Your Slack Messages Are Quietly Killing Your Career",
  "description": "155-char meta description…",
  "tags": ["slack", "communication", "remote work"],
  "emoji": "💬",
  "readTime": "6 min",
  "date": "2026-04-07",
  "topicSeed": "original topic string",
  "body": "<p>Full HTML body…</p>"
}
```
