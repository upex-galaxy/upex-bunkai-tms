// BK-222 — the one rule for an evidence link, shared by the submission
// validation (server) and the run detail (client), so neither imports the other's
// dependencies: http or https only, no whitespace, at most 2048 characters.
export const SUBMISSION_EVIDENCE_URL_MAX = 2048;

export function isHttpUrl(value: string): boolean {
  if (value.length > SUBMISSION_EVIDENCE_URL_MAX || /\s/.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  }
  catch {
    return false;
  }
}
