import type { AtcAssertionInput, AtcStepInput } from '@lib/supabase/rpc';
import { sanitizeMarkdown } from '@lib/markdown/sanitize';

// BK-18 — save-path Markdown hygiene (BK-16 convention). Step and assertion
// `content` are Markdown prose and are sanitized before persisting, matching
// every sibling write route. `input_data` / `expected` are literal test-data
// values (not rendered Markdown), so they are left untouched to avoid
// corrupting payloads or markup-under-test.

export function sanitizeAtcSteps(steps: AtcStepInput[]): AtcStepInput[] {
  return steps.map(step => ({ ...step, content: sanitizeMarkdown(step.content) }));
}

export function sanitizeAtcAssertions(assertions: AtcAssertionInput[]): AtcAssertionInput[] {
  return assertions.map(assertion => ({ ...assertion, content: sanitizeMarkdown(assertion.content) }));
}
