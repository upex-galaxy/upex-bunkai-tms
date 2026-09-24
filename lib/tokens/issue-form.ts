// Settings > Tokens issuance form client-side validation gate (BK-88 Slice B
// — AC Scenario 2). Mirrors the mockup's `validateIssue()`
// (settings-tokens.html:1158-1162): the Create button stays disabled until a
// non-blank name and at least one scope are selected. The server's own 422 on
// an empty `scopes` array (BK-126) is the belt-and-suspenders backstop; this
// function is what disables the button before any request is sent.

export interface IssueFormState {
  name: string
  scopes: string[]
}

export function canSubmitIssueForm({ name, scopes }: IssueFormState): boolean {
  return name.trim().length > 0 && scopes.length > 0;
}

// BK-1079 — AC2 of BK-88 asks for an inline error, not only a silently
// disabled button. Shown once the user has shown intent (typed a name, or
// touched a scope checkbox) and no scope is selected; before that the
// fieldset legend's hint is enough and an error on a pristine form is noise.
export const SCOPES_REQUIRED_MESSAGE = 'At least one scope is required.';

interface ScopesErrorParams extends IssueFormState {
  scopesTouched: boolean
}

export function scopesError({ name, scopes, scopesTouched }: ScopesErrorParams): string | null {
  if (scopes.length > 0) {
    return null;
  }
  return name.trim().length > 0 || scopesTouched ? SCOPES_REQUIRED_MESSAGE : null;
}
