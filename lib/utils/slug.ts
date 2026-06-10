// Framework-agnostic slug helpers. No React/Next/Bun imports — safe to import
// from server routes, client components, or unit tests. Generalizes the
// client-only `slugify` that previously lived inline in the onboarding form.

// Combining diacritical marks (U+0300-U+036F). After NFD normalization accents
// split into a base letter + a combining mark; stripping this range leaves the
// plain ASCII base (e-acute -> e).
const DIACRITICS = /[\u0300-\u036F]/g;

// Derive a URL-safe slug from a human name: lowercase, strip accents, collapse
// any non-alphanumeric run into a single hyphen, trim edge hyphens, cap at 40
// chars. The trailing-hyphen trim runs again after the slice so a cut landing
// mid-separator never leaves a dangling hyphen.
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

// True when the string contains at least one Unicode letter or number — CJK,
// Cyrillic, accented Latin, and ASCII all count (BK-53). Emoji and symbols
// (\p{So}) do not.
export function hasAlphanumeric(s: string): boolean {
  return /[\p{L}\p{N}]/u.test(s);
}

// FNV-1a 32-bit hash over the string's UTF-16 code units, rendered as 8
// lowercase hex chars. Pure JS — no node:crypto — so this file stays safe to
// import from client components. Not cryptographic; only used to derive a
// stable slug fallback.
export function fnv1a32hex(input: string): string {
  let hash = 0x811C9DC5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// Slugify with a deterministic hash fallback for names that transliterate
// poorly (CJK, Cyrillic, …): when the derived slug is shorter than
// `minLength`, return `${prefix}-${hash}` instead. The hash runs over the
// trimmed, NFKC-normalized, lowercased name so visually identical inputs
// (' 日本語 ' vs '日本語') collide on purpose — preserving the duplicate-name
// → unique-violation (23505) → 409 semantics downstream.
export function slugifyWithFallback(name: string, prefix: string, minLength: number): string {
  const slug = slugify(name);
  if (slug.length >= minLength) {
    return slug;
  }
  return `${prefix}-${fnv1a32hex(name.trim().normalize('NFKC').toLowerCase())}`;
}
