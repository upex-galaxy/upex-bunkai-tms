#!/usr/bin/env bun
/**
 * Match brand — rank getdesign brands against a project's business context.
 *
 * Invoked from the /design-system skill, Path B (references/getdesign-matcher.md).
 *
 * Usage:
 *   bun .claude/skills/design-system/scripts/match-brand.ts \
 *     --context  <path-to-business-context.json> \
 *     --catalog  <path-to-getdesign-catalog.json> \
 *     --top      3
 *
 * Stdout: a JSON array of MatchResult, sorted by descending score.
 * Stderr: human-readable progress and error messages.
 *
 * Exit codes:
 *   0  success
 *   1  usage error (missing/invalid CLI args)
 *   2  parse/IO error on context or catalog
 *   3  no matches above zero score (catalog returned, but nothing scored)
 *
 * Why heuristic v1 (not embeddings):
 * Simple, debuggable, no API key, no model call. The score is the weighted sum of
 * three terms: tag overlap (0.5), competitor name match (0.3), keyword similarity
 * over the description (0.2). If evals show this is too crude we upgrade to
 * embeddings (text-embedding-3-small or similar) in v2 — but only then.
 *
 * Sample catalog shape (as of getdesign v0.6.x — `getdesign list` outputs PLAIN
 * TEXT, one brand per line: "slug - description". The upstream CLI does NOT emit
 * JSON despite a documented --json flag; the caller (reference doc) is expected
 * to parse the text into the shape below before invoking this script):
 *   [
 *     { "slug": "linear.app", "name": "Linear", "description": "...", "tags": ["dark","minimal"] },
 *     { "slug": "stripe",     "name": "Stripe",  "description": "..." }
 *   ]
 * "name" and "tags" are optional; the matcher falls back to slug and to keywords
 * mined from the description when they are absent.
 */

import { parseArgs } from 'node:util';

// ---- Types ----

type BusinessContext = {
  industry: string;
  tone: string[];
  target: 'B2B' | 'B2C' | 'internal';
  competitors: string[];
  keywords: string[];
};

type CatalogBrand = {
  slug: string;
  name?: string;
  description?: string;
  tags?: string[];
};

type MatchResult = {
  slug: string;
  name: string;
  score: number;
  reason: string;
};

// ---- Helpers ----

// Tokenize lowercases, strips punctuation, splits on whitespace, drops stopwords.
// Used everywhere we compare free text — keep behaviour identical across terms.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'for', 'to', 'with', 'on', 'in', 'is',
  'app', 'platform', 'tool', 'design', 'system',
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

// ---- Scoring terms ----

// tagOverlap: how many ctx tone/keyword tokens appear in brand.tags (or, as a
// fallback, in the description). Normalised against ctx-side tokens so a brand
// with many tags is not penalised, and a ctx with many tones is not amplified.
function tagOverlap(ctx: BusinessContext, brand: CatalogBrand): { score: number; matched: string[] } {
  const ctxTokens = uniq([...ctx.tone, ...ctx.keywords].flatMap(tokenize));
  if (ctxTokens.length === 0) { return { score: 0, matched: [] }; }
  const brandTokens = new Set([
    ...(brand.tags ?? []).flatMap(tokenize),
    ...tokenize(brand.description ?? ''),
  ]);
  const matched = ctxTokens.filter((t) => brandTokens.has(t));
  return { score: matched.length / ctxTokens.length, matched };
}

// competitorMatch: 1.0 if any competitor name appears in brand.slug or brand.name,
// scaled by how many competitors hit (capped at 1.0). Slug match is the strongest
// signal — getdesign slugs ARE the brand names (linear.app, stripe, vercel).
function competitorMatch(ctx: BusinessContext, brand: CatalogBrand): { score: number; matched: string[] } {
  if (ctx.competitors.length === 0) { return { score: 0, matched: [] }; }
  const haystack = `${brand.slug} ${brand.name ?? ''}`.toLowerCase();
  const matched = ctx.competitors.filter((c) => {
    const needle = c.toLowerCase().trim();
    return needle.length > 0 && haystack.includes(needle);
  });
  return { score: Math.min(1, matched.length / ctx.competitors.length + (matched.length > 0 ? 0.5 : 0)), matched };
}

// keywordSimilarity: jaccard between ctx.keywords + industry vs brand description
// tokens. Cheaper than cosine and good enough for short descriptions.
function keywordSimilarity(ctx: BusinessContext, brand: CatalogBrand): { score: number; matched: string[] } {
  const ctxTokens = new Set(uniq([ctx.industry, ...ctx.keywords].flatMap(tokenize)));
  const brandTokens = new Set(tokenize(brand.description ?? ''));
  if (ctxTokens.size === 0 || brandTokens.size === 0) { return { score: 0, matched: [] }; }
  const matched = [...ctxTokens].filter((t) => brandTokens.has(t));
  const union = new Set([...ctxTokens, ...brandTokens]).size;
  return { score: matched.length / union, matched };
}

function buildReason(tag: string[], comp: string[], kw: string[]): string {
  const parts: string[] = [];
  if (tag.length > 0) { parts.push(`tags [${tag.slice(0, 4).join(', ')}]`); }
  if (comp.length > 0) { parts.push(`competitor ${comp.join('/')}`); }
  if (kw.length > 0) { parts.push(`keyword ${kw.slice(0, 3).join('/')}`); }
  return parts.length > 0 ? `matched on ${parts.join(' + ')}` : 'no strong signal — fallback';
}

// ---- Scoring (weights confirmed against PLAN §5.1) ----

const W_TAG = 0.5;
const W_COMPETITOR = 0.3;
const W_KEYWORD = 0.2;

function scoreBrand(ctx: BusinessContext, brand: CatalogBrand): MatchResult {
  const t = tagOverlap(ctx, brand);
  const c = competitorMatch(ctx, brand);
  const k = keywordSimilarity(ctx, brand);
  const score = W_TAG * t.score + W_COMPETITOR * c.score + W_KEYWORD * k.score;
  return {
    slug: brand.slug,
    name: brand.name ?? brand.slug,
    score: Math.round(score * 1000) / 1000,
    reason: buildReason(t.matched, c.matched, k.matched),
  };
}

// ---- IO ----

async function readJson<T>(path: string, label: string): Promise<T> {
  try {
    const text = await Bun.file(path).text();
    return JSON.parse(text) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to read ${label} at ${path}: ${msg}`);
  }
}

function usage(): never {
  process.stderr.write(
    'Usage: bun match-brand.ts --context <ctx.json> --catalog <catalog.json> [--top N]\n',
  );
  process.exit(1);
}

// ---- Main ----

async function main(): Promise<void> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({
      args: Bun.argv.slice(2),
      options: {
        context: { type: 'string' },
        catalog: { type: 'string' },
        top: { type: 'string', default: '3' },
      },
      strict: true,
    });
  } catch {
    usage();
  }
  const { context: ctxPath, catalog: catPath, top: topRaw } = parsed.values as {
    context?: string; catalog?: string; top?: string;
  };
  if (!ctxPath || !catPath) { usage(); }

  const top = Number.parseInt(topRaw ?? '3', 10);
  if (!Number.isFinite(top) || top < 1) {
    process.stderr.write(`invalid --top: ${topRaw}\n`);
    process.exit(1);
  }

  let ctx: BusinessContext;
  let catalog: CatalogBrand[];
  try {
    ctx = await readJson<BusinessContext>(ctxPath, 'context');
    catalog = await readJson<CatalogBrand[]>(catPath, 'catalog');
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
  if (!Array.isArray(catalog) || catalog.length === 0) {
    process.stderr.write('catalog must be a non-empty array of brands\n');
    process.exit(2);
  }

  const ranked = catalog
    .map((b) => scoreBrand(ctx, b))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top);

  if (ranked.length === 0) {
    process.stderr.write('no brand scored above zero against this context\n');
    process.exit(3);
  }

  process.stdout.write(JSON.stringify(ranked, null, 2) + '\n');
}

// ---- Inline smoke test ----
// Run with: bun match-brand.ts --self-test
// Keeps the matcher honest without pulling in bun:test infra.

function selfTest(): void {
  const ctx: BusinessContext = {
    industry: 'fintech',
    tone: ['serious', 'minimal'],
    target: 'B2B',
    competitors: ['Linear', 'Vercel'],
    keywords: ['dark', 'premium', 'data-dense'],
  };
  const fakeCatalog: CatalogBrand[] = [
    { slug: 'linear.app', name: 'Linear', description: 'Ultra-minimal project management, dark, precise.', tags: ['dark', 'minimal'] },
    { slug: 'airbnb', name: 'Airbnb', description: 'Warm coral, photography-driven, rounded UI.', tags: ['warm', 'consumer'] },
    { slug: 'notion', name: 'Notion', description: 'Warm minimalism, serif headings, soft surfaces.', tags: ['warm', 'minimal'] },
  ];
  const ranked = fakeCatalog
    .map((b) => scoreBrand(ctx, b))
    .sort((a, b) => b.score - a.score);
  console.assert(ranked[0].slug === 'linear.app', `expected linear.app top, got ${ranked[0].slug}`);
  console.assert(ranked[0].score > ranked[1].score, 'top score should beat second');
  process.stderr.write(`self-test ok: top=${ranked[0].slug} score=${ranked[0].score}\n`);
}

if (Bun.argv.includes('--self-test')) {
  selfTest();
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});
