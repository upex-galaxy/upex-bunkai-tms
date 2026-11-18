# Publisher: Manual Paste (always-available fallback)

Runs when:

- the Q1 answer is `Manual paste`,
- Q1 picked another destination but no MCP or CLI is reachable for it, or
- the user wants to inspect the body before anything publishes automatically.

Tool: none. The skill renders the body, names the destination URL and hands the user instructions.

Body: `references/credentials-content-template.md`.

## When to prefer it

This adapter always exists:

- The skill's primary output is the markdown body, and publishing is a thin adapter on top. If automation fails, the body is still complete and useful.
- Some destinations are human-only by design: private wikis behind SSO, paper runbooks, on-prem ticketing systems with no API.
- It is the audit-before-publish path. The user reads the rendered body in plain text before any external tool sees it.

## Before publishing

1. Run the `security-rules.md` checklist against the body, to the same standard as the automated adapters.
2. Confirm the user named a destination URL, and that its pattern looks access-gated (`/private/…`, `/internal/…`, an SSO host, a password manager). If it looks public, warn the user and ask for an access-gated destination.

## Execution

1. Render the credentials-content body from the template with every `.agents/project.yaml` placeholder substituted. Real passwords stay as `<see secrets store>`.
2. Write it to a temp file the user can `cat` or download: `/tmp/qa-credentials-body.md`.
3. Print this instruction block to the user:

   ```text
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
5. Set the snapshot's `credentials-source` to that URL.
6. Update the `/qa` page's credentials CTA `href`.
7. Re-run §verification.

## Why real passwords stay out of the body

Even here, the body keeps `<see secrets store>` literal:

- The body is rendered in the chat and a temp file before the user pastes it, and chat transcripts can be screenshotted or logged.
- The user fills in real values inside the destination tool, where access is gated, so the substitution never crosses the skill-to-destination boundary.
- It matches the automated adapters, so the security guarantees are the same on every channel.

## When the user returns a URL that looks unsafe

If the URL is a public Google Doc, a public Notion page, a public GitHub Gist or any other public surface:

- Do not wire it into the CTA.
- Recommend a safer destination (a private workspace, a password manager, an access-gated wiki).
- Explain the threat model in one short paragraph (anyone with the link can read it, it can be indexed by search engines).

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| User never returns a URL | Workflow stalled | Mark the run `published: manual-pending` in the audit trail. Re-running the skill later resumes from that state. |
| User pastes the body verbatim, `<see secrets store>` tokens included | Skipped step 3 of the instructions | Tell them and ask them to update the destination. Do not replace the tokens from `.env`. |
| User's destination URL is the page URL itself | Confusion about what gets published where | Explain again: the page is in-app and the artifact is external, so they are two things. |

## After publish

1. Set the `credentials-source` snapshot field to the user-supplied URL.
2. Set the `/qa` page CTA `href` to the same URL.
3. Audit trail: `publisher: manual-paste, user-confirmed: true`.

## Without a person present

This adapter writes only local files, so a routine runs it in full up to step 3: it renders the body, writes `/tmp/qa-credentials-body.md`, puts the instruction block in its report and records `published: manual-pending` and `user-confirmed: pending` in the audit trail. Steps 4 to 7 wait for a person. This is also where every outward adapter lands when a routine has no covering brief. A supervised worker sends the instruction block to its launcher, which holds the gate. The rule is `agentic-dev-core/references/decision-protocol.md`.

## Cross-reference

- Body: `references/credentials-content-template.md`
- Security: `references/security-rules.md`
- Every other adapter degrades to this one when its tool is missing.
