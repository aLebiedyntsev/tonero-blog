#!/usr/bin/env node
'use strict';

/**
 * generate-news.js — News-inspired AI blog post generator for tonero.app
 *
 * Fetches latest items from one of the configured RSS feeds, picks the most
 * communication-relevant article (avoiding war / violence content), and asks
 * GPT to rewrite it as a funny Tonero-branded post that connects the story to
 * workplace tone & communication.  Always includes a disclosure that the post
 * was inspired by the original article with a link back.
 *
 * Usage:
 *   node generate-news.js                         # random feed, auto-pick
 *   FEED_ID=ap-politics node generate-news.js     # specific feed, auto-pick
 *   FEED_URL=https://... node generate-news.js    # custom feed URL
 *   ARTICLE_URL=https://... ARTICLE_TITLE="…" node generate-news.js  # exact article
 */

require('dotenv').config();
const OpenAI = require('openai');
const fs     = require('fs');
const path   = require('path');
const https  = require('https');
const http   = require('http');

// ── RSS Feed list ──────────────────────────────────────────────────────────────
const FEEDS = [
  { id: 'ap-politics',     name: 'AP News – Politics',           url: 'https://apnews.com/politics.rss' },
  { id: 'nyt-politics',    name: 'New York Times – Politics',    url: 'https://www.nytimes.com/svc/collections/v1/publish/https://www.nytimes.com/section/politics/rss.xml' },
  { id: 'npr-politics',    name: 'NPR – Politics',               url: 'https://feeds.npr.org/1014/rss.xml' },
  { id: 'politico',        name: 'POLITICO',                     url: 'https://www.politico.com/rss/politicopicks.xml' },
  { id: 'thehill',         name: 'The Hill',                     url: 'https://thehill.com/feed/' },
  { id: 'realclear',       name: 'RealClearPolitics',            url: 'https://www.realclearpolitics.com/index.xml' },
  { id: 'politifact',      name: 'PolitiFact',                   url: 'https://www.politifact.com/rss/all/' },
  { id: 'propublica',      name: 'ProPublica',                   url: 'https://www.propublica.org/feeds/propublica/main' },
  { id: 'slate-politics',  name: 'Slate – News & Politics',      url: 'https://slate.com/feeds/news-and-politics.rss' },
  { id: 'salon-politics',  name: 'Salon – News & Politics',      url: 'https://www.salon.com/category/news-and-politics/feed' },
  { id: 'rolling-stone',   name: 'Rolling Stone – Politics',     url: 'https://www.rollingstone.com/politics/feed/' },
  { id: 'mediaite',        name: 'Mediaite – Politics',          url: 'https://www.mediaite.com/category/politics/feed/' },
  { id: 'cbs-politics',    name: 'CBS News – Politics',          url: 'https://www.cbsnews.com/latest/rss/politics' },
  { id: 'fox-politics',    name: 'Fox News – Politics',          url: 'https://moxie.foxnews.com/google-publisher/politics.xml' },
  { id: 'newsmax',         name: 'Newsmax – Politics',           url: 'https://www.newsmax.com/rss/Politics/1/' },
  { id: 'thenation',       name: 'The Nation – Politics',        url: 'https://www.thenation.com/subject/politics/feed/' },
  { id: 'motherjones',     name: 'Mother Jones – Politics',      url: 'https://www.motherjones.com/politics/feed/' },
  { id: 'foreign-policy',  name: 'Foreign Policy',               url: 'https://foreignpolicy.com/feed/' },
  { id: 'politico-eu',     name: 'POLITICO Europe',              url: 'https://www.politico.eu/feed/' },
  { id: 'national-review', name: 'National Review',              url: 'https://www.nationalreview.com/feed/' },
];

// ── Content filters ────────────────────────────────────────────────────────────
// Articles matching these keywords are skipped — we want nothing about violence, war, death.
const EXCLUDE_RE = /\b(kill(ed|ing|s)?|murder(ed|ing|s|er)?|shoot(ing|er|s)?|shot\s+dead|war(fare|time)?|bomb(ing|ed|s|er)?|missile(s)?|terrorist(s|ism|ist)?|genocide|massacre|casualt(y|ies)|hostage(s)?|explosion(s)?|died\s+in|death\s+toll|attack(ed|s|er|ers)?\s+by|execut(ed|ion|ions)|suicide\s+(bomb|attack)|troops|military\s+(strike|action)|armed\s+conflict)\b/i;

// Articles matching these keywords score higher — communication / speech angles.
const COMM_TOKENS = /\b(speech|statement|debate|comment(s|ed|ing)?|tweet(s|ed|ing)?|post(ed|ing|s)\s+on|interview(s|ed)?|press\s+(conference|briefing)|message(s|d|ing)?|email(s|ed|ing)?|announc(e|ed|ement|ing)|negotiat(e|ed|ion|ing)|rhetoric|tone|language|word(s|ing)|express(ed|ion|ing)|wrote|claim(s|ed|ing)?|demand(s|ed|ing)?|address(ed|ing)?|response|replied|communic(ate|ation|ated)|talks?|said|says|told|threaten(ed|ing|s)?|promised|pledg(e|ed|ing)|remark(s|ed)?|accuse(d|s)?|denied|press\s+release)\b/gi;

function commScore(text) {
  const m = text.match(COMM_TOKENS);
  return m ? m.length : 0;
}

// ── HTTP fetch with redirect following ────────────────────────────────────────
function fetchUrl(url, redirectsLeft) {
  if (redirectsLeft === undefined) redirectsLeft = 8;
  return new Promise((resolve, reject) => {
    if (redirectsLeft < 0) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 ToneroBot/1.0 (+https://tonero.app)' },
      timeout: 20000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchUrl(res.headers.location, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', reject);
  });
}

// ── Minimal RSS / Atom XML parser ──────────────────────────────────────────────
function stripCdata(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m  = xml.match(re);
  if (!m) return '';
  return decodeEntities(stripCdata(m[1]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractLink(itemXml) {
  // RSS <link>url</link> — may appear as #text node (tricky due to atom:link)
  let m = itemXml.match(/<link>([^<]+)<\/link>/i);
  if (m) return m[1].trim();
  // Atom <link href="url" .../>
  m = itemXml.match(/<link[^>]+href="([^"]+)"/i);
  if (m) return m[1].trim();
  // guid that looks like URL
  m = itemXml.match(/<guid[^>]*>https?:\/\/[^\s<]+<\/guid>/i);
  if (m) return m[0].replace(/<[^>]+>/g, '').trim();
  return '';
}

function parseItems(xml) {
  const items = [];
  // Support both RSS <item> and Atom <entry>
  const entryRe = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let m;
  while ((m = entryRe.exec(xml)) !== null && items.length < 15) {
    const body  = m[1];
    const title = extractTag(body, 'title');
    const link  = extractLink(body);
    const desc  = extractTag(body, 'description') ||
                  extractTag(body, 'summary')     ||
                  extractTag(body, 'content');
    if (title && link) items.push({ title, link, desc });
  }
  return items;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.error('ERROR: OPENAI_API_KEY is not set'); process.exit(1); }

  const client   = new OpenAI({ apiKey });
  const model    = process.env.MODEL_OVERRIDE || 'gpt-4o-mini';
  const postsDir = path.join(__dirname, 'posts');
  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

  // ── Resolve which article to use ────────────────────────────────────────────
  let article;

  if (process.env.ARTICLE_URL) {
    // Caller supplied a specific article URL
    article = {
      title: process.env.ARTICLE_TITLE || process.env.ARTICLE_URL,
      link:  process.env.ARTICLE_URL,
      desc:  process.env.ARTICLE_DESC  || '',
    };
    console.log(`Using provided article: "${article.title}"`);
  } else {
    // Fetch from an RSS feed
    let feedUrl  = process.env.FEED_URL || '';
    let feedName = feedUrl;

    if (!feedUrl && process.env.FEED_ID) {
      const found = FEEDS.find(f => f.id === process.env.FEED_ID);
      if (!found) { console.error(`Unknown FEED_ID: ${process.env.FEED_ID}`); process.exit(1); }
      feedUrl  = found.url;
      feedName = found.name;
    }

    if (!feedUrl) {
      const picked = FEEDS[Math.floor(Math.random() * FEEDS.length)];
      feedUrl  = picked.url;
      feedName = picked.name;
      console.log(`Auto-selected feed: ${feedName}`);
    }

    console.log(`Fetching RSS: ${feedUrl}`);
    let xml;
    try { xml = await fetchUrl(feedUrl); }
    catch (e) { console.error('RSS fetch failed:', e.message); process.exit(1); }

    const items = parseItems(xml);
    if (items.length === 0) { console.error('No items found in feed'); process.exit(1); }

    // Score items: exclude violence, rank by communication relevance
    const candidates = items
      .filter(i => !EXCLUDE_RE.test(i.title + ' ' + i.desc))
      .map(i => ({ ...i, score: commScore(i.title + ' ' + i.desc) }))
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      console.error('All articles were filtered by exclusion keywords — try a different feed');
      process.exit(1);
    }

    article = candidates[0];
    console.log(`Selected: "${article.title}" (comm-score: ${article.score})`);
  }

  // ── Build prompt ──────────────────────────────────────────────────────────────
  const systemPrompt = `You are a witty, creative content writer for Tonero, a SaaS Chrome extension.

ABOUT TONERO:
- Chrome extension that adds a one-click tone rewriting toolbar to every text box
- Works in Slack, Gmail, Microsoft Teams, LinkedIn, and any website
- Rewrites messages into: Professional, Direct, Casual, Friendly, Emoji, or a custom "My Voice" profile
- Free plan: 30 rewrites/month with 3 core tones
- Pro plan: $9/month — unlimited rewrites, 6 tones, custom voice profiles, personalization
- Install at tonero.app

YOUR TASK:
Write a humorous, insightful Tonero blog post inspired by the given news article:

1. Spin the story around communication and tone — not politics or the actual news event
2. The angle: "If only [person/organisation in the news] had used Tonero, this could have gone very differently"
3. Be playful and self-aware — never mean, partisan, or political
4. Keep the focus on what YOUR READERS face at work: bad emails, aggressive Slack messages, tone-deaf announcements
5. Mention Tonero naturally 2–3 times (not forced)
6. End with a CTA to try Tonero free at tonero.app
7. Body should be 850–1100 words
8. REQUIRED: Include a news disclaimer block at the very end (exact HTML below — fill in SOURCE_TITLE and SOURCE_URL):
   <p class="news-disclaimer">Inspired by <a href="SOURCE_URL" target="_blank" rel="noopener noreferrer">SOURCE_TITLE</a>. We took the communication angle — kind of what Tonero does, but with words rather than people.</p>

TONE & STYLE:
- Witty, warm, and clever — not cynical or mean
- Use "you" throughout — make the reader feel seen
- Concrete workplace scenarios (Slack, email, meetings)
- Cite plausible-sounding stats if helpful

STRUCTURE:
1. Hook: reference the news moment, then immediately pivot to the reader's experience
2. Why this communication pattern keeps appearing (root cause)
3. Real costs at the workplace level (3-4 paragraphs with <h2> headings)
4. Where Tonero fits — presented helpfully, not as an ad
5. Closing CTA + news disclaimer

RETURN FORMAT: Valid JSON only. No markdown fences. No extra keys.
{
  "slug": "url-slug-max-65-chars-lowercase-hyphenated",
  "title": "Headline 50–65 chars — communicate the workplace angle, not the politics",
  "description": "Meta description 140–156 chars",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "emoji": "single emoji",
  "readTime": "N min",
  "topicSeed": "news-inspired",
  "newsSource": { "title": "EXACT original article title", "url": "EXACT article url" },
  "body": "Full HTML. Use <h2>, <p>, <ul><li>, <strong>, <blockquote>. NO html/head/body tags. NO inline styles. Must end with the news-disclaimer <p>."
}`;

  const userPrompt = `News article:
Title: "${article.title}"
URL:   ${article.link}
${article.desc ? `Summary: ${article.desc.slice(0, 500)}` : ''}

Write the Tonero blog post. Pivot quickly from the news hook to what professionals experience every day. Keep it funny and communication-focused. In the disclaimer paragraph replace SOURCE_TITLE with the exact article title and SOURCE_URL with its URL.`;

  // ── Call OpenAI ────────────────────────────────────────────────────────────────
  console.log(`Calling OpenAI (${model})…`);
  let post;
  try {
    const completion = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      temperature: 0.88,
      max_tokens:  4096,
    });
    post = JSON.parse(completion.choices[0].message.content);
  } catch (e) {
    console.error('OpenAI error:', e.message);
    process.exit(1);
  }

  if (!post.slug || !post.title || !post.body) {
    console.error('Invalid response — missing slug/title/body');
    process.exit(1);
  }

  // ── Save ───────────────────────────────────────────────────────────────────────
  const date     = new Date().toISOString().split('T')[0];
  const filename = `${date}-${post.slug}.json`;
  const outPath  = path.join(postsDir, filename);

  const data = {
    slug:        post.slug,
    title:       post.title,
    description: post.description || '',
    tags:        Array.isArray(post.tags) ? post.tags : [],
    emoji:       post.emoji       || '📰',
    readTime:    post.readTime    || '5 min',
    date,
    topicSeed:   'news-inspired',
    newsSource:  post.newsSource  || { title: article.title, url: article.link },
    body:        post.body,
  };

  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Saved: posts/${filename}`);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
