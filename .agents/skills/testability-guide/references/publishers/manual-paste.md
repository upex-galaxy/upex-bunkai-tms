# Publisher — Manual Paste (always-available fallback)

> **When this adapter runs**:
>
> - Q1 explicitly answered `Manual paste`.
> - OR Q1 picked another destination but no MCP / CLI is reachable for it.
> - OR the user wants to inspect the body before publishing automatically.
>
> **Tool**: none. The skill renders the body, names the destination URL, hands the user instructions.
>
> **Body**: `references/credentials-content-template.md`.

---

## Why this adapter ALWAYS exists

- The skill's primary output is the markdown body. The publish step is a thin adapter on top. If automation fails, the body is still complete and valuable.
- Some destinations are intentionally human-only (private wikis behind SSO, paper runbooks, on-prem ticketing systems with no API).
- It is the canonical "audit before publish" path. The user inspects the rendered body in plain text before any external tool sees it.

---

## Pre-publish checks

1. Run `security-rules.md` checklist against the body (same standard as the automated adapters).
2. Confirm the user has named a destination URL. The URL pattern must look access-gated (`/private/…`, `/internal/…`, SSO host, password manager). If it looks public → warn the user and ask for an access-gated destination.

---

## Execution

1. Render the credentials-content body from the template with all `.agents/project.yaml` placeholders substituted. Real passwords stay as `<see secrets store>`.
2. Write to a temp file the user can `cat` or download: `/tmp/qa-credentials-body.md`.
3. Print a clear instruction block to the user:

```
The credentials artifact body is ready.

Destination: <user-supplied URL>

Steps for you to publish manually:
  1. Open the destination.
  2. Paste the contents of /tmp/qa-credentials-body.md.
  3. Replace each <see secrets store> token with the real value from your secrets manager.
  4. Apply view restrictions to the QA group.
  5. Share the destination URL back to me so I can wire it into the /qa page CTA.
```

4. Wait for the user to reply with the final URL.
5. Once received, set the snapshot's `credentials-source` to that URL.
6. Update the `/qa` page's credentials CTA `href`.
7. Re-run §verification.

---

## Why the skill does NOT auto-substitute real passwords here

Even in manual-paste mode, the skill keeps `<see secrets store>` literal in the body. Reasons:

- The body is rendered in the chat / temp file before the user pastes it. Chat transcripts can be screenshotted or logged.
- The user fills real values INSIDE the destination tool, where access is gated. The substitution never crosses the skill / destination boundary.
- Mirrors the automated adapters' behavior — same security guarantees regardless of channel.

---

## When the user comes back with a URL that looks unsafe

If the URL is a public Google Doc, a public Notion page, a public GitHub Gist, or any other public surface:

- Refuse to wire it into the CTA.
- Recommend a safer destination (private workspace, password manager, access-gated wiki).
- Explain the threat model in one short paragraph (anyone with the link, search-indexable, etc.).

---

## Failure modes

| Symptom                                                              | Cause                                     | Fix                                                                                                                 |
| -------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| User never returns a URL                                             | Workflow stalled                          | Mark the run as `published: manual-pending` in the audit trail. Re-running the skill later resumes from this state. |
| User pastes the body verbatim including `<see secrets store>` tokens | Forgot step 3 of the instructions         | Surface the issue, ask them to update the destination. Do NOT auto-replace from `.env`.                             |
| User's destination URL is the page URL itself                        | Confusion about what gets published where | Re-explain: the page is in-app, the artifact is external. They are two things.                                      |

---

## After publish

1. `credentials-source` snapshot field → user-supplied URL.
2. `/qa` page CTA `href` → same URL.
3. Audit trail: `publisher: manual-paste, user-confirmed: true`.

---

## Cross-reference

- Body: `references/credentials-content-template.md`
- Security: `references/security-rules.md`
- The other adapters all degrade to this when their tool is missing.
