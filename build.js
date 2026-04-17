#!/usr/bin/env node
'use strict';

/**
 * build.js — Static site builder for tonero-blog
 *
 * Reads all JSON post files from posts/, then generates:
 *   public/posts/manifest.js      — JS data file loaded by blog.html and index.html
 *   public/posts/<slug>.html      — Individual post pages (linked to tonero-web styles)
 *
 * These files are later copied to /opt/tonero/tonero-web/posts/ on the server.
 *
 * Usage:
 *   node build.js
 */

const fs = require('fs');
const path = require('path');

const POSTS_DIR = path.join(__dirname, 'posts');
const PUBLIC_POSTS_DIR = path.join(__dirname, 'public', 'posts');

// ── Helpers ───────────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(str) {
  return escHtml(str);
}

function escJsonStr(str) {
  if (str == null) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '');
}

function formatDate(dateStr, createdAt) {
  // If full ISO timestamp available, show date + time
  if (createdAt) {
    const d = new Date(createdAt);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) +
           ' · ' +
           d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  }
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

// ── Load posts ────────────────────────────────────────────────────────────────
function loadPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const files = fs.readdirSync(POSTS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse(); // newest first

  return files.map(file => {
    try {
      const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`  [warn] skipping ${file}: ${e.message}`);
      return null;
    }
  }).filter(Boolean);
}

// ── Build manifest.js ─────────────────────────────────────────────────────────
// We use a .js file (not .json) because nginx for tonero-web blocks .json files.
// blog.html and index.html load this via <script src="/posts/manifest.js">.
function buildManifest(posts) {
  const metadata = posts.map(p => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    date: p.date,
    createdAt: p.createdAt || null,
    tags: Array.isArray(p.tags) ? p.tags : [],
    emoji: p.emoji || '✦',
    readTime: p.readTime || '5 min',
  }));

  const content = `/* generated ${new Date().toISOString().split('T')[0]} — do not edit manually */\nwindow.TONERO_POSTS = ${JSON.stringify(metadata, null, 2)};\n`;
  const outPath = path.join(PUBLIC_POSTS_DIR, 'manifest.js');
  fs.writeFileSync(outPath, content);
  console.log(`  ✓ public/posts/manifest.js  (${metadata.length} posts)`);
}

// ── Cross-link helpers ───────────────────────────────────────────────────────

// SEO landing pages with keyword lists for matching.
const SEO_PAGES = [
  { url: '../grammarly-alternative.html',           title: 'Tonero vs Grammarly',                 keywords: ['grammarly', 'grammar', 'spelling', 'checker'] },
  { url: '../quillbot-alternative.html',            title: 'Tonero vs QuillBot',                  keywords: ['quillbot', 'paraphrase', 'rephrase', 'paraphrasing'] },
  { url: '../wordtune-alternative.html',            title: 'Tonero vs Wordtune',                  keywords: ['wordtune', 'rephrase', 'sentence rewriter'] },
  { url: '../rewrite-email-to-be-professional.html',title: 'How to write professional emails',    keywords: ['professional', 'formal', 'polished', 'credible'] },
  { url: '../rewrite-email-to-be-friendly.html',   title: 'How to write friendly emails',        keywords: ['friendly', 'warm', 'casual', 'approachable'] },
  { url: '../rewrite-email-to-be-polite.html',     title: 'How to write polite emails',          keywords: ['polite', 'rude', 'harsh', 'impolite'] },
  { url: '../rewrite-email-to-be-confident.html',  title: 'How to sound confident in emails',    keywords: ['confident', 'assertive', 'hesitant', 'uncertainty', 'confident'] },
  { url: '../rewrite-email-to-be-direct.html',     title: 'How to write direct emails',          keywords: ['direct', 'concise', 'vague', 'unclear', 'straightforward'] },
  { url: '../rewrite-angry-email.html',            title: 'Fix angry emails before you send',    keywords: ['angry', 'frustrated', 'aggressive', 'emotional', 'heated'] },
  { url: '../rewrite-passive-aggressive-email.html',title: 'Fix passive-aggressive emails',      keywords: ['passive', 'passive-aggressive', 'sarcasm', 'sarcastic', 'subtle'] },
  { url: '../ai-email-rewriter.html',              title: 'AI email rewriter',                   keywords: ['ai', 'chatgpt', 'rewriter', 'rewrite', 'artificial intelligence'] },
  { url: '../improve-message-tone.html',           title: 'Improve message tone',                keywords: ['tone', 'message', 'improve', 'slack', 'workplace'] },
  { url: '../make-email-more-professional.html',   title: 'Make email more professional',        keywords: ['professional', 'email', 'work', 'career'] },
  { url: '../polite-email-generator.html',         title: 'Polite email generator',              keywords: ['polite', 'generator', 'soft', 'gentle'] },
  { url: '../rewrite-email-tone.html',             title: 'Rewrite email tone',                  keywords: ['tone', 'email', 'rewrite'] },
  { url: '../tonero-for-gmail.html',               title: 'Tonero for Gmail',                    keywords: ['gmail', 'google mail', 'email'] },
  { url: '../tonero-for-slack.html',               title: 'Tonero for Slack',                    keywords: ['slack', 'message', 'dm', 'channel'] },
  { url: '../tonero-for-teams.html',               title: 'Tonero for Microsoft Teams',          keywords: ['teams', 'microsoft', 'microsoft teams'] },
];

/**
 * Returns up to `max` published posts most related to `post` by tag overlap.
 * Excludes the post itself. Falls back to most-recent posts.
 */
function findRelatedPosts(post, allPosts, max = 3) {
  const myTags = new Set((post.tags || []).map(t => t.toLowerCase()));
  const mySlug = post.slug;

  const scored = allPosts
    .filter(p => p.slug && p.slug !== mySlug && p.published !== false)
    .map(p => {
      const theirTags = (p.tags || []).map(t => t.toLowerCase());
      const overlap   = theirTags.filter(t => myTags.has(t)).length;
      return { post: p, score: overlap };
    })
    .sort((a, b) => b.score - a.score || 0);

  return scored.slice(0, max).map(s => s.post);
}

/**
 * Returns up to `max` SEO landing pages that best match the post's title + tags.
 */
function findRelatedSeoPages(post, max = 2) {
  const haystack = [
    post.title || '',
    post.description || '',
    ...(post.tags || []),
  ].join(' ').toLowerCase();

  const scored = SEO_PAGES.map(page => {
    const hits = page.keywords.filter(kw => haystack.includes(kw)).length;
    return { page, hits };
  }).filter(s => s.hits > 0).sort((a, b) => b.hits - a.hits);

  return scored.slice(0, max).map(s => s.page);
}

/**
 * Builds the HTML for the cross-links section (related posts + SEO pages).
 * Returns empty string if nothing to link.
 */
function buildCrossLinksSection(post, allPosts) {
  const relatedPosts    = findRelatedPosts(post, allPosts, 3);
  const relatedSeoPages = findRelatedSeoPages(post, 2);

  if (relatedPosts.length === 0 && relatedSeoPages.length === 0) return '';

  const postCards = relatedPosts.map(p => `
          <a href="${escAttr(p.slug)}.html" class="cross-link-card">
            <span class="cross-link-emoji">${escHtml(p.emoji || '✦')}</span>
            <span class="cross-link-title">${escHtml(p.title)}</span>
            <span class="cross-link-meta">${escHtml(p.readTime || '')} read</span>
          </a>`).join('');

  const pageCards = relatedSeoPages.map(p => `
          <a href="${escAttr(p.url)}" class="cross-link-card cross-link-card--guide">
            <span class="cross-link-emoji">→</span>
            <span class="cross-link-title">${escHtml(p.title)}</span>
            <span class="cross-link-meta">Guide</span>
          </a>`).join('');

  return `
        <div class="cross-links">
          <h3 class="cross-links__heading">Continue reading</h3>
          <div class="cross-links__grid">${postCards}${pageCards}
          </div>
        </div>`;
}

// ── Build individual post pages ───────────────────────────────────────────────
function buildPostPage(post, allPosts) {
  const tags = Array.isArray(post.tags) ? post.tags : [];
  const tagBadges = tags.slice(0, 2).map(t =>
    `<span class="post-tag">${escHtml(t)}</span>`
  ).join('');

  const ldJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date + 'T00:00:00Z',
    keywords: tags.join(', '),
    publisher: { '@type': 'Organization', name: 'Tonero', url: 'https://tonero.app' },
    url: `https://tonero.app/posts/${post.slug}.html`,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escAttr(post.title)} – Tonero Blog</title>
  <meta name="description" content="${escAttr(post.description)}" />
  ${(post.keywords && post.keywords.length > 0) ? `<meta name="keywords" content="${escAttr([...(post.keywords||[]), ...(tags||[])].join(', '))}" />` : ''}
  <link rel="canonical" href="https://tonero.app/posts/${escAttr(post.slug)}.html" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://tonero.app/posts/${escAttr(post.slug)}.html" />
  <meta property="og:title" content="${escAttr(post.title)}" />
  <meta property="og:description" content="${escAttr(post.description)}" />
  <meta property="og:image" content="${escAttr(post.featuredImage || 'https://tonero.app/og-image.png')}" />
  <meta property="article:published_time" content="${escAttr(post.date)}T00:00:00Z" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escAttr(post.title)}" />
  <meta name="twitter:description" content="${escAttr(post.description)}" />
  <link rel="icon" type="image/svg+xml" href="../images/logo-mark.svg" />
  <link rel="stylesheet" href="../styles.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <script type="application/ld+json">${ldJson}</script>
  <style>
    .post-hero { padding: 120px 0 56px; background: var(--surface); border-bottom: 1px solid var(--border); }
    .post-meta { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
    .post-tag {
      font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.05em; color: var(--brand);
      background: var(--brand-light); padding: 3px 10px; border-radius: 99px;
    }
    .post-meta time, .post-read-time { font-size: 0.85rem; color: var(--text-muted); }
    .post-hero h1 {
      font-size: clamp(1.75rem, 4vw, 2.75rem); font-weight: 800;
      line-height: 1.2; max-width: 760px; margin-bottom: 20px;
    }
    .post-hero .post-desc {
      font-size: 1.0625rem; color: var(--text-muted); max-width: 640px; line-height: 1.75;
    }
    .post-body { padding: 72px 0 96px; }
    .post-content { max-width: 720px; }
    .post-content h2 { font-size: 1.45rem; font-weight: 700; margin: 48px 0 16px; line-height: 1.3; }
    .post-content h3 { font-size: 1.15rem; font-weight: 700; margin: 32px 0 12px; }
    .post-content p { font-size: 1.0625rem; line-height: 1.8; color: var(--text); margin-bottom: 20px; }
    .post-content ul, .post-content ol { margin: 0 0 20px 24px; }
    .post-content li { font-size: 1.0625rem; line-height: 1.8; margin-bottom: 8px; }
    .post-content blockquote {
      border-left: 3px solid var(--brand); margin: 32px 0; padding: 16px 24px;
      background: var(--brand-light); border-radius: 0 8px 8px 0;
      font-style: italic; color: var(--text-muted);
    }
    .post-content strong { color: var(--text); }
    .post-cta {
      margin-top: 64px; padding: 40px 40px 44px;
      background: linear-gradient(135deg, #6366f1 0%, #7c3aed 100%);
      border-radius: 20px; text-align: center;
    }
    .post-cta h3 { color: #fff; font-size: 1.5rem; font-weight: 700; margin-bottom: 12px; }
    .post-cta p { color: rgba(255,255,255,.85); font-size: 1rem; margin-bottom: 28px; }
    .post-nav { margin-top: 56px; padding-top: 32px; border-top: 1px solid var(--border); }
    .post-nav a { color: var(--brand); font-weight: 600; text-decoration: none; }
    .post-nav a:hover { text-decoration: underline; }
    .cross-links { margin-top: 56px; padding-top: 32px; border-top: 1px solid var(--border); }
    .cross-links__heading { font-size: 1rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 16px; }
    .cross-links__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .cross-link-card { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; text-decoration: none; transition: border-color .15s, box-shadow .15s; }
    .cross-link-card:hover { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-light); }
    .cross-link-emoji { font-size: 1.1rem; line-height: 1; }
    .cross-link-title { font-size: 0.9375rem; font-weight: 600; color: var(--text); line-height: 1.35; }
    .cross-link-meta { font-size: 0.8rem; color: var(--text-muted); }
    .cross-link-card--guide .cross-link-emoji { color: var(--brand); font-weight: 700; }
    .post-featured-image { width: 100%; max-height: 420px; object-fit: cover; border-radius: 16px; margin-bottom: 40px; display: block; }
    .news-summary {
      background: var(--surface); border-left: 3px solid var(--brand);
      border-radius: 0 10px 10px 0; padding: 14px 20px; margin: 0 0 28px;
      font-size: 0.9375rem; line-height: 1.7; color: var(--text-muted);
    }
    .news-summary strong { color: var(--text); }
    .news-disclaimer {
      margin-top: 48px; font-size: 0.8125rem; color: var(--text-muted);
      border-top: 1px solid var(--border); padding-top: 16px; line-height: 1.6;
    }
    .news-disclaimer a { color: var(--brand); }
  </style>
</head>
<body>

  <!-- ── NAV ── -->
  <nav class="nav">
    <div class="container nav__inner">
      <a href="/" class="logo">
        <img src="../images/logo-mark.svg" alt="" class="logo-icon"> Tonero
      </a>
      <ul class="nav__links">
        <li><a href="/#how">How it works</a></li>
        <li><a href="/#pricing">Pricing</a></li>
        <li><a href="../blog.html">Blog</a></li>
      </ul>
      <div class="nav__auth">
        <a href="https://app.tonero.app/login" class="btn btn--ghost btn--sm">Log in</a>
        <a href="https://app.tonero.app/register" class="btn btn--primary btn--sm">Try free</a>
      </div>
    </div>
  </nav>

  <!-- ── HERO ── -->
  <div class="post-hero">
    <div class="container">
      <div class="post-meta">
        ${tagBadges}
        <time datetime="${escAttr(post.createdAt || post.date)}">${formatDate(post.date, post.createdAt)}</time>
        <span class="post-read-time">· ${escHtml(post.readTime)} read</span>
      </div>
      <h1>${escHtml(post.emoji)} ${escHtml(post.title)}</h1>
      <p class="post-desc">${escHtml(post.description)}</p>
    </div>
  </div>

  <!-- ── BODY ── -->
  <div class="post-body">
    <div class="container">
      <div class="post-content">
        ${post.featuredImage ? `<img src="${escAttr(post.featuredImage)}" alt="${escAttr(post.title)}" class="post-featured-image" loading="lazy" />` : ''}
        ${post.body}
        ${buildCrossLinksSection(post, allPosts)}
        <div class="post-cta">
          <h3>Stop guessing — let Tonero fix your tone in one click</h3>
          <p>Works inside Slack, Gmail, Teams, LinkedIn and every text box in Chrome.<br />30 free rewrites/month. No credit card required.</p>
          <a href="https://app.tonero.app/register" class="btn btn--white btn--lg">Try Tonero Free →</a>
        </div>
        <div class="post-nav">
          <a href="../blog.html">← Back to Blog</a>
        </div>
      </div>
    </div>
  </div>

  <!-- ── FOOTER ── -->
  <footer class="footer">
    <div class="container footer__inner">
      <div class="footer__brand">
        <a href="/" class="logo">
          <img src="../images/logo-mark.svg" alt="" class="logo-icon"> Tonero
        </a>
        <p>Write better. Sound smarter. Every time.</p>
      </div>
      <div class="footer__links">
        <div class="footer__col">
          <strong>Product</strong>
          <a href="/#how">How it works</a>
          <a href="/#pricing">Pricing</a>
        </div>
        <div class="footer__col">
          <strong>Company</strong>
          <a href="../about.html">About</a>
          <a href="../blog.html">Blog</a>
          <a href="../changelog.html">Changelog</a>
        </div>
        <div class="footer__col">
          <strong>Legal</strong>
          <a href="../privacy.html">Privacy Policy</a>
          <a href="../terms.html">Terms of Service</a>
        </div>
      </div>
    </div>
    <div class="container footer__bottom">
      <p>© 2026 Tonero. All rights reserved.</p>
    </div>
  </footer>

  <script>
    (function () {
      var slug = ${JSON.stringify(post.slug)};
      if (!slug) return;
      // Fire read beacon once per page load (fire-and-forget, silent on error)
      fetch('https://api.tonero.app/public/blog/' + encodeURIComponent(slug) + '/read', {
        method: 'POST', keepalive: true,
      }).catch(function () {});
    }());
  </script>

</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  ensureDir(PUBLIC_POSTS_DIR);

  const posts = loadPosts();
  console.log(`Building ${posts.length} post(s)…`);

  // manifest.js (always regenerate, even if 0 posts)
  buildManifest(posts);

  // Individual post pages
  for (const post of posts) {
    if (!post.slug) { console.warn('  [warn] post without slug, skipping'); continue; }
    const html = buildPostPage(post, posts);
    const outPath = path.join(PUBLIC_POSTS_DIR, `${post.slug}.html`);
    fs.writeFileSync(outPath, html);
    console.log(`  ✓ public/posts/${post.slug}.html`);
  }

  console.log(`\nDone. Output in public/posts/ (${posts.length + 1} files)`);
  console.log('Next: copy public/posts/ to /opt/tonero/tonero-web/posts/ on the server.');
}

main();
