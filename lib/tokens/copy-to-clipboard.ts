// Settings > Tokens secret-copy helper (BK-88 Slice B — PO/UX Decision 4).
// Attempts the real Clipboard API; any absence of the API or promise
// rejection resolves silently -- never surfaces a clipboard error to the
// user. The secret box's `user-select: all` (IssueTokenModal Step 2) is the
// standing manual fallback (mockup's `wireCopy()`, settings-tokens.html:
// 1208-1222), so there is nothing to error about here.
export async function copySecret(text: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  }
  catch {
    // Silent fallback per Decision 4 -- never surface a clipboard error.
  }
}
