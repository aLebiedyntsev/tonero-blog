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

// ── RSS Feed lists ─────────────────────────────────────────────────────────────
const WORLD_FEEDS = [
  { id: 'npr-politics',    name: 'NPR – Politics',               url: 'https://feeds.npr.org/1014/rss.xml' },
  { id: 'nyt-politics',    name: 'New York Times – Politics',    url: 'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml' },
  { id: 'thehill',         name: 'The Hill',                     url: 'https://thehill.com/feed/' },
  { id: 'cbs-politics',    name: 'CBS News – Politics',          url: 'https://www.cbsnews.com/latest/rss/politics' },
  { id: 'fox-politics',    name: 'Fox News – Politics',          url: 'https://moxie.foxnews.com/google-publisher/politics.xml' },
  { id: 'realclear',       name: 'RealClearPolitics',            url: 'https://www.realclearpolitics.com/index.xml' },
  { id: 'politifact',      name: 'PolitiFact',                   url: 'https://www.politifact.com/rss/all/' },
  { id: 'propublica',      name: 'ProPublica',                   url: 'https://www.propublica.org/feeds/propublica/main' },
  { id: 'slate-politics',  name: 'Slate – News & Politics',      url: 'https://slate.com/feeds/news-and-politics.rss' },
  { id: 'rolling-stone',   name: 'Rolling Stone – Politics',     url: 'https://www.rollingstone.com/politics/feed/' },
  { id: 'mediaite',        name: 'Mediaite – Politics',          url: 'https://www.mediaite.com/category/politics/feed/' },
  { id: 'thenation',       name: 'The Nation – Politics',        url: 'https://www.thenation.com/subject/politics/feed/' },
  { id: 'motherjones',     name: 'Mother Jones – Politics',      url: 'https://www.motherjones.com/politics/feed/' },
  { id: 'foreign-policy',  name: 'Foreign Policy',               url: 'https://foreignpolicy.com/feed/' },
  { id: 'politico-eu',     name: 'POLITICO Europe',              url: 'https://www.politico.eu/feed/' },
  { id: 'national-review', name: 'National Review',              url: 'https://www.nationalreview.com/feed/' },
];

const TECH_FEEDS = [
  { id: 'techcrunch',        name: 'TechCrunch',                   url: 'https://techcrunch.com/feed/' },
  { id: 'theverge',          name: 'The Verge',                    url: 'https://www.theverge.com/rss/full.xml' },
  { id: 'venturebeat',       name: 'VentureBeat',                  url: 'https://venturebeat.com/feed/' },
  { id: 'hackernews',        name: 'Hacker News',                  url: 'https://news.ycombinator.com/rss' },
  { id: 'wired',             name: 'Wired',                        url: 'https://www.wired.com/feed/rss' },
  { id: 'arstechnica',       name: 'Ars Technica',                 url: 'https://arstechnica.com/feed/' },
  { id: 'mit-tech-review',   name: 'MIT Technology Review',        url: 'https://www.technologyreview.com/feed/' },
  { id: 'pragmatic-engineer',name: 'The Pragmatic Engineer',       url: 'https://blog.pragmaticengineer.com/rss/' },
  { id: 'joel-on-software',  name: 'Joel on Software',             url: 'https://www.joelonsoftware.com/feed/' },
  { id: 'slack-engineering', name: 'Slack Engineering',            url: 'https://slack.engineering/feed' },
  { id: 'cloudflare-blog',   name: 'Cloudflare Blog',              url: 'https://blog.cloudflare.com/rss/' },
  { id: 'stripe-blog',       name: 'Stripe Blog',                  url: 'https://stripe.com/blog/feed.rss' },
  { id: 'meta-engineering',  name: 'Meta Engineering',             url: 'https://engineering.fb.com/feed/' },
  { id: 'netflix-tech',      name: 'Netflix Tech Blog',            url: 'https://netflixtechblog.com/feed' },
  { id: 'towards-data-science', name: 'Towards Data Science',     url: 'https://towardsdatascience.com/feed' },
  { id: 'farnam-street',     name: 'Farnam Street',                url: 'https://fs.blog/feed/' },
];

// All feeds combined, for FEED_ID lookup
const ALL_FEEDS = [...WORLD_FEEDS, ...TECH_FEEDS];
// ── Length buckets ───────────────────────────────────────────────────────────
const LENGTH_BUCKETS = [
  { label: 'short',  words: '550–750',   readTime: '3–4' },
  { label: 'medium', words: '900–1100',  readTime: '5–6' },
  { label: 'long',   words: '1400–1900', readTime: '7–10' },
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

function extractImage(itemXml) {
  // media:content with image medium or type
  let m = itemXml.match(/<media:content[^>]+url="([^"]+)"[^>]*medium="image"[^>]*\/?>/i);
  if (!m) m = itemXml.match(/<media:content[^>]+medium="image"[^>]+url="([^"]+)"[^>]*\/?>/i);
  if (!m) m = itemXml.match(/<media:content[^>]+url="([^"]+)"[^>]*type="image\/[^"]*"[^>]*\/?>/i);
  if (!m) m = itemXml.match(/<media:content[^>]+type="image\/[^"]*"[^>]+url="([^"]+)"[^>]*\/?>/i);
  // Any media:content with a url (fallback)
  if (!m) m = itemXml.match(/<media:content[^>]+url="([^"]+)"/i);
  if (m) return m[1].trim();
  // media:thumbnail
  m = itemXml.match(/<media:thumbnail[^>]+url="([^"]+)"/i);
  if (m) return m[1].trim();
  // enclosure with image type
  m = itemXml.match(/<enclosure[^>]+url="([^"]+)"[^>]+type="image\/[^"]*"/i);
  if (!m) m = itemXml.match(/<enclosure[^>]+type="image\/[^"]*"[^>]+url="([^"]+)"/i);
  if (m) return m[1].trim();
  // <img src> inside description/content CDATA
  m = itemXml.match(/<img[^>]+src="([^"]+)"/i);
  if (m) return m[1].trim();
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
    const image = extractImage(body);
    if (title && link) items.push({ title, link, desc, image });
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
  let feedCategory = 'world'; // default; updated below when feed is resolved

  if (process.env.ARTICLE_URL) {
    // Caller supplied a specific article URL
    feedCategory = (process.env.FEED_CATEGORY || 'world').toLowerCase().replace('random', 'world');
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
      const found = ALL_FEEDS.find(f => f.id === process.env.FEED_ID);
      if (!found) { console.error(`Unknown FEED_ID: ${process.env.FEED_ID}`); process.exit(1); }
      feedUrl  = found.url;
      feedName = found.name;
      feedCategory = TECH_FEEDS.some(f => f.id === found.id) ? 'tech' : 'world';
    }

    if (!feedUrl) {
      // Resolve feed pool from FEED_CATEGORY env var (world | tech | random)
      let pool;
      const cat = (process.env.FEED_CATEGORY || 'random').toLowerCase();
      if (cat === 'tech')        pool = TECH_FEEDS;
      else if (cat === 'world')  pool = WORLD_FEEDS;
      else {
        // random: pick either pool with equal probability
        pool = Math.random() < 0.5 ? WORLD_FEEDS : TECH_FEEDS;
      }
      feedCategory = (pool === TECH_FEEDS) ? 'tech' : 'world';
      const picked = pool[Math.floor(Math.random() * pool.length)];
      feedUrl  = picked.url;
      feedName = picked.name;
      console.log(`Auto-selected feed: ${feedName} (category: ${feedCategory})`);
    }

    console.log(`Fetching RSS: ${feedUrl}`);
    let xml;
    try { xml = await fetchUrl(feedUrl); }
    catch (e) { console.error('RSS fetch failed:', e.message); process.exit(1); }

    const items = parseItems(xml);
    if (items.length === 0) { console.error('No items found in feed'); process.exit(1); }

    // Score items: exclude violence, rank by communication relevance — keep top 10
    const candidates = items
      .filter(i => !EXCLUDE_RE.test(i.title + ' ' + i.desc))
      .map(i => ({ ...i, score: commScore(i.title + ' ' + i.desc) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (candidates.length === 0) {
      console.error('All articles were filtered by exclusion keywords — try a different feed');
      process.exit(1);
    }

    // article will be resolved from top-10 list by GPT
    article = candidates; // array; main() will handle both array and single-article cases
    console.log(`Top-${candidates.length} candidates collected`);
  }

  // ── Build prompt ──────────────────────────────────────────────────────────────
  // Normalize: article may be an array (from RSS top-10) or a single object (from env vars)
  const articleList = Array.isArray(article) ? article : [article];
  const isWorldCat  = feedCategory === 'world';

  const neutralityBlock = isWorldCat ? `
POLITICAL NEUTRALITY — MANDATORY:
- DO NOT criticize, mock, celebrate, or take sides on any political figure, party, or policy
- DO NOT frame any political actor as having "failed" or done something wrong in a political sense
- political events are ONLY a backdrop — your post pivots immediately to universal workplace communication lessons
- DO NOT use an individual's name in the title — keep the headline about the communication concept
- DO NOT assign blame or make value judgments; describe communication choices factually and neutrally
- Treat ALL political figures exactly as you would treat a neutral hypothetical "executive" — their actions are a communication case-study only` : '';

  const anglesBlock = isWorldCat ? `CREATIVE ANGLES — read all articles first, then pick ONE angle that fits the best article:
  A) "The communication pattern behind this story appears in every office, every week" — use the news as proof of a universal workplace problem
  D) "What any professional can learn about communication timing, word choice, and clarity from this moment" — factual case-study framing
  E) "Why smart, capable people still send terrible messages" — use the news as a springboard to explore why tone is hard even for pros
  F) "What would happen if your manager did this in Slack?" — transpose the news scenario into a relatable office scenario
  G) "When the same message lands differently depending on who hears it" — explore how audience shapes communication
  PICK ONE angle. Do NOT combine all of them. Do NOT mention or label which angle you chose.` : `CREATIVE ANGLES — read all articles first, then pick ONE angle that fits the best article:
  A) "The communication pattern behind this story appears in every office, every week" — use the news as proof of a universal workplace problem
  B) "What this moment teaches us about tone" — treat the event as an unexpected case study
  C) "Breaking: someone said the wrong thing. Here's the workplace version" — parallel between tech drama and everyday messages
  D) "The real story the headline missed: a masterclass in communication clarity" — reframe the event as a communication lesson
  E) "Why smart, capable people still send terrible messages" — use the news as a springboard to explore why tone is hard even for pros
  F) "What would happen if your manager did this in Slack?" — transpose the news scenario into a relatable office scenario
  PICK ONE angle. Do NOT combine all of them. Do NOT mention or label which angle you chose.`;

  const bucket = LENGTH_BUCKETS[Math.floor(Math.random() * LENGTH_BUCKETS.length)];

  const systemPrompt = `You are a witty, insightful content writer for Tonero — a SaaS Chrome extension.

ABOUT TONERO:
- Chrome extension that adds a one-click tone rewriting toolbar to every text box
- Works in Slack, Gmail, Microsoft Teams, LinkedIn, Notion, and any website
- Rewrites messages into: Professional, Direct, Casual, Friendly, Emoji, or a custom "My Voice" profile
- Free plan: 30 rewrites/month with 3 core tones
- Pro plan: $9/month — unlimited rewrites, 6 tones, custom voice profiles, personalization
- Install at tonero.app

YOUR TASK:
You will be given a numbered list of ${articleList.length} news article${articleList.length > 1 ? 's' : ''}. First, pick the ONE article that offers the richest workplace-communication angle. Then write a full Tonero blog post about it.${neutralityBlock}

${anglesBlock}

MANDATORY STRUCTURE:
1. Opening paragraph — hook using the news moment, then immediately connect it to the reader
2. NEWS SUMMARY BOX — right after the opening paragraph:
   <div class="news-summary"><strong>Quick context:</strong> [2–3 sentences: neutral factual summary of what the article is about — no opinion]</div>
3. Pivot to the reader's own professional communication life within 3 paragraphs
4. 3–4 <h2> sections with practical, actionable insight about workplace communication
5. Natural Tonero mention 2–3 times — helpful context, never forced ad copy
6. Closing CTA paragraph encouraging readers to try Tonero free at tonero.app
7. FINAL element — news disclaimer (must be the last thing in body):
   <p class="news-disclaimer">Inspired by <a href="SOURCE_URL" target="_blank" rel="noopener noreferrer">SOURCE_TITLE</a>. We took the communication angle — kind of what Tonero does, but with words rather than people.</p>
8. Total body ${bucket.words} words — a ${bucket.label} post (approx ${bucket.readTime} min read)

IMAGE:
- If an imageUrl is provided in the article data, put it in the featuredImage field
- Do NOT embed <img> tags in the body — the template places the hero image separately

KEYWORDS:
- Extract 4–6 SEO keywords from the article content (names, topics, key phrases)
- Add 2–3 workplace communication keywords ("tone", "Slack", "email tone", etc.)
- Return all combined in the keywords array

TONE & STYLE:
- Warm, witty, clever — never cynical, partisan, or mean
- "You" voice throughout — make the reader feel seen
- Use real tool names: Slack, Gmail, Teams, LinkedIn, Notion
- Short punchy sentences mixed with fuller analytical ones
- Plausible-sounding stats are fine if they support the point

RETURN FORMAT: Valid JSON only. No markdown fences. No extra keys.
{
  "slug": "url-slug-max-65-chars-lowercase-hyphenated",
  "title": "Headline 50–65 chars — workplace angle, not the politics",
  "description": "Meta description 140–156 chars",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "keywords": ["keyword from article 1", "keyword from article 2", "workplace keyword 3", "keyword 4", "keyword 5"],
  "emoji": "single emoji",
  "readTime": "N min",
  "topicSeed": "news-inspired",
  "featuredImage": "image url or empty string",
  "newsSource": { "title": "EXACT original article title", "url": "EXACT article url" },
  "body": "Full HTML body. Use <h2>, <p>, <ul><li>, <strong>, <blockquote>. NO html/head/body tags. NO inline styles. MUST contain the news-summary div. MUST end with the news-disclaimer p."
}`;

  // Build user prompt with all candidate articles listed
  const articlePrompts = articleList.map((a, i) => {
    const imageHint = a.image ? `\n   Image URL: ${a.image}` : '';
    return `Article ${i + 1}:\n   Title: "${a.title}"\n   URL:   ${a.link}${a.desc ? `\n   Summary: ${a.desc.slice(0, 400)}` : ''}${imageHint}`;
  }).join('\n\n');

  const userPrompt = `Here are ${articleList.length} candidate article${articleList.length > 1 ? 's' : ''}. Pick the ONE with the richest workplace-communication angle, then write the full post for it.

${articlePrompts}

Instructions:
- Pick the single most relevant article for a Tonero post about workplace communication
- Choose the best creative angle
- In the body: include the news-summary box right after the opening paragraph
- Replace SOURCE_TITLE and SOURCE_URL in the disclaimer with the exact title/URL of the article you chose
- Put the image URL in featuredImage if one was provided for your chosen article`;

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
  const _now     = new Date();
  const date     = _now.toISOString().split('T')[0];
  const filename = `${date}-${post.slug}.json`;
  const outPath  = path.join(postsDir, filename);

  // Resolve the primary article used (GPT may have picked from the list)
  const primaryArticle = articleList[0];

  const data = {
    slug:          post.slug,
    title:         post.title,
    description:   post.description || '',
    tags:          Array.isArray(post.tags) ? post.tags : [],
    keywords:      Array.isArray(post.keywords) ? post.keywords : [],
    emoji:         post.emoji          || '📰',
    readTime:      post.readTime       || '5 min',
    date,
    createdAt:     _now.toISOString(),
    topicSeed:     'news-inspired',
    category:      feedCategory,
    featuredImage: post.featuredImage  || primaryArticle.image || '',
    newsSource:    post.newsSource     || { title: primaryArticle.title, url: primaryArticle.link },
    body:          post.body,
  };

  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Saved: posts/${filename}`);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
