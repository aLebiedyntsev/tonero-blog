#!/usr/bin/env node
'use strict';

/**
 * generate.js — AI blog post generator for tonero.app
 *
 * Picks a topic from TOPICS, calls OpenAI GPT-4o to generate an SEO-optimized,
 * clickbait-style post that naturally promotes Tonero, and saves it as a JSON
 * file in posts/YYYY-MM-DD-slug.json.
 *
 * Usage:
 *   node generate.js
 *   TOPIC_OVERRIDE="custom topic to write about" node generate.js
 */

require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// ── Topic pool ────────────────────────────────────────────────────────────────
// High-intent topics that attract Tonero's target audience: professionals
// who write in Slack, Gmail, Teams, LinkedIn and care about how they sound.
const TOPICS = [
  'Why your Slack messages are quietly killing your career',
  'The passive-aggressive email mistake 73% of professionals make daily',
  'Why non-native English speakers get promoted less at work — and the fix that takes 3 seconds',
  'How one word can make you sound incompetent on Slack',
  'The email tone problem no one talks about in remote teams',
  'Why your boss thinks you are rude when you were just being efficient',
  '7 phrases that make you sound passive-aggressive on Slack or Teams',
  'The one communication skill that separates top performers from everyone else',
  'Why remote workers get blamed for poor communication — and the real cause',
  'How AI is changing the way professionals write emails in 2026',
  'The tone gap: why what you type and what your colleague reads are two different messages',
  'Why your emails feel cold even when you do not mean them to',
  'The hidden reason your Slack messages keep getting ignored',
  'How to sound more confident in business writing without coming across as arrogant',
  'Why "per my last email" is career-limiting and what to write instead',
  'Why German, Russian, and French professionals sound rude in English emails — it is not what you think',
  'How to write meeting requests that actually get accepted',
  'The science of professional tone: why word choice matters more than you think',
  'How to ask for a raise over email without damaging the relationship',
  'Why context-switching kills your writing quality on remote teams',
  'The 3 words that instantly make any work message sound more professional',
  'How to decline a request at work without damaging the relationship',
  'Why your LinkedIn messages get zero response — and how tone is to blame',
  'The most common English tone mistakes made by non-native speakers at work',
  'How top executives write Slack messages differently than everyone else',
  'Why sounding professional in English is harder than speaking it fluently',
  'How to give negative feedback over Slack without it blowing up',
  'The real reason your manager ignores your emails',
  'How to follow up on an unanswered email without sounding desperate or aggressive',
  'Why one poorly worded message can undo months of trust at work',
];

// ── Length buckets ────────────────────────────────────────────────────────────
const LENGTH_BUCKETS = [
  { label: 'short',  words: '550–750',   readTime: '3–4' },
  { label: 'medium', words: '950–1250',  readTime: '5–6' },
  { label: 'long',   words: '1500–2000', readTime: '8–10' },
];

// ── Rewrite existing post ─────────────────────────────────────────────────────
async function rewriteExisting(client, postsDir) {
  const filename     = process.env.REWRITE_FILE.trim();
  const reviewerNote = (process.env.REVIEWER_NOTE || '').trim();
  const model        = (process.env.MODEL_OVERRIDE || 'gpt-4o-mini').trim();

  const filepath = path.resolve(postsDir, filename);
  if (!filepath.startsWith(postsDir + path.sep)) {
    console.error(`ERROR: Path traversal detected in REWRITE_FILE: ${filename}`);
    process.exit(1);
  }
  if (!fs.existsSync(filepath)) {
    console.error(`ERROR: File not found: posts/${filename}`);
    process.exit(1);
  }

  const original = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  const bucket   = LENGTH_BUCKETS[Math.floor(Math.random() * LENGTH_BUCKETS.length)];

  const systemPrompt = `You are a senior content writer for Tonero, a SaaS Chrome extension.

ABOUT TONERO:
- Chrome extension that adds a one-click tone rewriting toolbar to every text box
- Works in Slack, Gmail, Microsoft Teams, LinkedIn, and any website
- Rewrites messages into: Professional, Direct, Casual, Friendly, Emoji, or a custom "My Voice" profile
- Free plan: 30 rewrites/month with 3 core tones
- Pro plan: $9/month — unlimited rewrites, 6 tones, custom voice profiles, personalization
- Install at tonero.app

YOUR TASK:
Rewrite the provided blog post based on reviewer feedback. Keep the same core topic and Tonero angle.
1. Address the reviewer's feedback precisely — this is the PRIMARY requirement
2. Keep the same SEO keyword targets and punchy headline style
3. Preserve Tonero mentions naturally in the body (2–3 times)
4. Keep the CTA at the end pointing to tonero.app
5. Is ${bucket.words} words in the body HTML — a ${bucket.label} post (approx ${bucket.readTime} min read)

TONE & STYLE:
- Direct, confident, slightly provocative
- Use "you" throughout
- Cite plausible stats when they support the point
- No vague corporate advice — be specific and opinionated

RETURN FORMAT: Valid JSON only. No markdown, no code fences.
{
  "title": "Headline 50-65 chars",
  "description": "Meta description 140-156 chars",
  "tags": ["tag1", "tag2", "tag3"],
  "keywords": ["kw1", "kw2", "kw3", "kw4", "kw5"],
  "emoji": "single emoji",
  "readTime": "N min",
  "body": "Full HTML body. Use <h2>, <p>, <ul><li>, <strong>, <blockquote>. NO html/head/body tags. NO inline styles."
}`;

  const userPrompt = `ORIGINAL POST:
Title: ${original.title}
Body:
${original.body}

REVIEWER FEEDBACK:
"${reviewerNote}"

Rewrite the post fully, addressing the reviewer's feedback. Return the specified JSON format.`;

  console.log(`Rewriting: posts/${filename}`);
  console.log(`Reviewer: "${reviewerNote.slice(0, 80)}"`);
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
      temperature: 0.82,
      max_tokens: 4096,
    });
    post = JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    console.error('OpenAI error:', err.message);
    process.exit(1);
  }

  if (!post.body || !post.title) {
    console.error('ERROR: Rewrite response missing title or body');
    process.exit(1);
  }

  const updated = {
    ...original,
    title:        post.title       || original.title,
    description:  post.description || original.description,
    tags:         Array.isArray(post.tags)     ? post.tags     : original.tags,
    keywords:     Array.isArray(post.keywords) ? post.keywords : (original.keywords || []),
    emoji:        post.emoji    || original.emoji,
    readTime:     post.readTime || original.readTime,
    body:         post.body,
    reviewerNote: reviewerNote,
    updatedAt:    new Date().toISOString(),
  };

  fs.writeFileSync(filepath, JSON.stringify(updated, null, 2));
  console.log(`Saved (rewrite): posts/${filename}`);
  console.log(`  Title    : ${updated.title}`);
  console.log(`  Read time: ${updated.readTime}`);
  console.log(`  Body len : ${updated.body.length} chars`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function generate() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: OPENAI_API_KEY is not set in .env');
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });

  const postsDir = path.join(__dirname, 'posts');
  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

  // ── Rewrite mode ───────────────────────────────────────────────────────────
  if (process.env.REWRITE_FILE) {
    await rewriteExisting(client, postsDir);
    return;
  }

  // Read topics already covered so we don't repeat
  const existingFiles = fs.readdirSync(postsDir).filter(f => f.endsWith('.json'));
  const usedTopics = new Set(
    existingFiles.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(postsDir, f), 'utf8'));
        return data.topicSeed || '';
      } catch { return ''; }
    })
  );

  // Pick a topic
  let topic;
  if (process.env.TOPIC_OVERRIDE) {
    topic = process.env.TOPIC_OVERRIDE.trim();
    console.log(`Using overridden topic: "${topic}"`);
  } else {
    const fresh = TOPICS.filter(t => !usedTopics.has(t));
    const pool = fresh.length > 0 ? fresh : TOPICS; // cycle if exhausted
    topic = pool[Math.floor(Math.random() * pool.length)];
    console.log(`Selected topic: "${topic}"`);
  }

  const bucket = LENGTH_BUCKETS[Math.floor(Math.random() * LENGTH_BUCKETS.length)];

  // ── System prompt ──────────────────────────────────────────────────────────
  const systemPrompt = `You are a senior content writer for Tonero, a SaaS Chrome extension.

ABOUT TONERO:
- Chrome extension that adds a one-click tone rewriting toolbar to every text box
- Works in Slack, Gmail, Microsoft Teams, LinkedIn, and any website
- Rewrites messages into: Professional, Direct, Casual, Friendly, Emoji, or a custom "My Voice" profile
- Free plan: 30 rewrites/month with 3 core tones
- Pro plan: $9/month — unlimited rewrites, 6 tones, custom voice profiles, personalization
- No AI buzzword experience: user just clicks a button, message is instantly rewritten
- Install at tonero.app

YOUR TASK:
Write a blog post that:
1. Has a punchy, click-bait headline that will rank on Google for workplace communication queries
2. Addresses a real pain point professionals face when writing at work
3. Is genuinely useful — gives actionable, specific tips (not vague advice)
4. Mentions Tonero naturally in the body (2-3 times) as a tool the writer uses/recommends
5. Ends with a natural CTA to try Tonero free at tonero.app
6. Is ${bucket.words} words in the body HTML — a ${bucket.label} post (approx ${bucket.readTime} min read)

TONE & STYLE:
- Direct, confident, slightly provocative
- Use "you" throughout — make it personal
- Cite plausible stats (you may create realistic-sounding statistics)
- Use real-world examples and scenarios
- No vague corporate advice — be specific and opinionated

STRUCTURE TO FOLLOW:
1. Hook (1–2 punchy paragraphs that call out the problem)
2. Why this happens (root cause, 1–3 paragraphs)
3. The real cost (what's at stake — career, relationships, promotions)
4. 4–6 practical tips with <h2> headings each
5. How Tonero fits in (natural mention as a practical solution)
6. Closing paragraph + CTA

RETURN FORMAT: Valid JSON only. No markdown, no code fences.
{
  "slug": "url-slug-max-65-chars-lowercase-hyphenated",
  "title": "Headline 50-65 chars — attention-grabbing and SEO keyword-rich",
  "description": "Meta description 140-156 chars — what the reader will learn, with a hook",
  "tags": ["tag1", "tag2", "tag3"],
  "keywords": ["seo keyword 1", "seo keyword 2", "seo keyword 3", "seo keyword 4", "seo keyword 5"],
  "emoji": "single emoji that represents the post",
  "readTime": "N min",
  "topicSeed": "the exact topic string you were given",
  "body": "Full HTML body. Use <h2>, <p>, <ul><li>, <ol><li>, <strong>, <blockquote>. NO html/head/body tags. NO inline styles."
}`;

  const userPrompt = `Write a blog post about: "${topic}"
${process.env.TAGS_INPUT ? `\nTarget SEO keywords — include naturally in content and return in the tags array: ${process.env.TAGS_INPUT.trim()}` : ''}
Make sure the title is phrased to attract clicks from Google — someone searching for Slack/email/communication advice must want to click it.`;

  // ── Call OpenAI ────────────────────────────────────────────────────────────
  const model = (process.env.MODEL_OVERRIDE || 'gpt-4o').trim();
  console.log(`Calling OpenAI (${model})…`);
  let post;
  try {
    const completion = await client.chat.completions.create({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.82,
      max_tokens: 4096,
    });
    post = JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    console.error('OpenAI error:', err.message);
    process.exit(1);
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  const required = ['slug', 'title', 'description', 'tags', 'emoji', 'readTime', 'body'];
  for (const field of required) {
    if (!post[field]) {
      console.error(`ERROR: AI response missing required field: "${field}"`);
      process.exit(1);
    }
  }

  // ── Sanitize & enrich ─────────────────────────────────────────────────────
  post.slug = post.slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  const _now = new Date();
  post.date      = _now.toISOString().split('T')[0]; // YYYY-MM-DD
  post.createdAt = _now.toISOString();               // full ISO timestamp
  post.topicSeed = topic;
  post.keywords  = Array.isArray(post.keywords) ? post.keywords : [];

  // ── Save ──────────────────────────────────────────────────────────────────
  const filename = `${post.date}-${post.slug}.json`;
  const filepath = path.join(postsDir, filename);

  if (fs.existsSync(filepath)) {
    // Avoid overwriting if run twice on the same day for the same topic
    const ts = Date.now();
    const alt = path.join(postsDir, `${post.date}-${post.slug}-${ts}.json`);
    fs.writeFileSync(alt, JSON.stringify(post, null, 2));
    console.log(`✓ Saved (name collision avoided): posts/${path.basename(alt)}`);
  } else {
    fs.writeFileSync(filepath, JSON.stringify(post, null, 2));
    console.log(`✓ Saved: posts/${filename}`);
  }

  console.log(`  Title    : ${post.title}`);
  console.log(`  Tags     : ${Array.isArray(post.tags) ? post.tags.join(', ') : post.tags}`);
  console.log(`  Read time: ${post.readTime}`);
  console.log(`  Body len : ${post.body.length} chars`);
}

generate().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
