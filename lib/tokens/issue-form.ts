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
