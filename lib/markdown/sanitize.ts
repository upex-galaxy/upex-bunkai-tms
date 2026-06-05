// Framework-agnostic Markdown save-path sanitizer (BK-16). No React/Next imports.
//
// SECURITY MODEL — two layers, defense in depth:
//   1. RENDER (the hard XSS wall): MarkdownRenderer uses react-markdown WITHOUT
//      rehype-raw (raw HTML in the source is never rendered) plus rehype-sanitize.
//      Nothing in stored content can execute, regardless of what slips past here.
//   2. SAVE (storage hygiene — this file): strips dangerous raw HTML and unsafe
//      link schemes from the Markdown source before persisting, so stored text is
//      clean (AC: "a pasted script is stripped on save", "the javascript link has
//      been removed"). It is intentionally NOT an HTML sanitizer: running
//      sanitize-html over Markdown corrupts legitimate content (an inline-code
//      comparison "a < b" becomes "a &lt; b") and misses Markdown-syntax links
//      like the javascript link form entirely. So we clean the Markdown directly
//      and leave code/text byte-for-byte intact.

// Link schemes that survive. Relative paths and "#anchor" links have no scheme
// and are kept; anything with an unsafe scheme is reduced to its visible text.
const SAFE_SCHEME = /^(?:https?:|mailto:)/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// Raw-HTML elements whose entire content must be removed (not just the tags).
const DANGEROUS_BLOCK = /<(script|style|iframe|object|embed|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
// Dangerous standalone / unclosed tags (no closing tag to anchor on).
const DANGEROUS_TAG = /<\/?(?:script|style|iframe|object|embed|svg|math|link|meta|base)\b[^>]*>/gi;
// Inline event handlers on any surviving tag: on...="..." / on...='...' / on...=word.
const EVENT_HANDLER = /\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// href / src / xlink:href carrying an unsafe scheme, in raw HTML tags.
const UNSAFE_ATTR_URL = /\s(?:href|src|xlink:href)\s*=\s*(?:"\s*(?:javascript|data|vbscript|file):[^"]*"|'\s*(?:javascript|data|vbscript|file):[^']*'|(?:javascript|data|vbscript|file):[^\s>]+)/gi;
// GFM autolink with an unsafe scheme.
const UNSAFE_AUTOLINK = /<\s*(?:javascript|data|vbscript|file):[^>]*>/gi;
// Markdown inline link / image: optional "!", [text], (url ...optional title).
// The URL matcher tolerates one level of balanced parentheses so a scheme with a
// trailing call like alert(1) is captured whole rather than truncated at the "(".
const MD_LINK = /(!?)\[([^\]]*)\]\(\s*(<[^>]*>|(?:[^\s()]|\([^)]*\))+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
// Whitespace used to smuggle a scheme past detection.
const SCHEME_NOISE = /\s+/g;

// Reduce an unsafe-scheme Markdown link/image to its plain text; keep safe and
// relative links untouched.
function stripUnsafeMarkdownLinks(input: string): string {
  return input.replace(MD_LINK, (match, _bang: string, text: string, rawUrl: string) => {
    // Detect the scheme on a whitespace-stripped copy so classic evasions cannot
    // smuggle a scheme past the test. The stored value keeps its original form
    // when it is safe.
    const scheme = rawUrl.replace(/^<|>$/g, '').replace(SCHEME_NOISE, '');
    if (HAS_SCHEME.test(scheme) && !SAFE_SCHEME.test(scheme)) {
      return text; // drop the "!" and the unsafe URL, keep the visible text
    }
    return match;
  });
}

// Clean a Markdown string for safe storage. Lossless for safe content (code,
// text, tables, headings, lists, and safe/relative links all pass through).
export function sanitizeMarkdown(input: string): string {
  let out = input;
  out = out.replace(DANGEROUS_BLOCK, '');
  out = out.replace(DANGEROUS_TAG, '');
  out = out.replace(EVENT_HANDLER, '');
  out = out.replace(UNSAFE_ATTR_URL, '');
  out = out.replace(UNSAFE_AUTOLINK, '');
  out = stripUnsafeMarkdownLinks(out);
  return out;
}

export { stripUnsafeMarkdownLinks };
