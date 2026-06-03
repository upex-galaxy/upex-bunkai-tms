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

// True when the string contains at least one ASCII alphanumeric character.
export function hasAlphanumeric(s: string): boolean {
  return /[a-z0-9]/i.test(s);
}
