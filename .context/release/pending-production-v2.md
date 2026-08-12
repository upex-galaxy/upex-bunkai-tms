# Pending for production — v2

Everything that happened on `staging` and does **not** travel in a git commit, but must
still be true before (or at) the v2 release.

Git already knows what code changed. It cannot know that a rate limit was raised in a
dashboard, that a schema was applied out of band, or that two changes must land in the
same breath or break sign-in. That is what this file is for, and it is the only record
of those actions.

**Scope:** the `staging` → `main` promotion tagged as v2. One file per release; when v2
ships, this file is archived and `pending-production-v3.md` starts empty. See
[README.md](./README.md) for the convention and how to add an entry.

**Verify it, don't read it:**

```bash
bun run release:check
```

Every entry below carries an executable check. The command exits non-zero while anything
is still pending, so the release gate is mechanical rather than a matter of remembering.

---

## Pending

### BK-400 · Activate the stateless magic-link rail

- **Type:** supabase-config + code
- **Atomic:** **yes** — both halves together, or neither
- **Applies to:** every environment (one Supabase project currently backs all three)
- **Ticket:** BK-400 · **PR:** #160 (code already on `staging`)

PR #160 is deliberately additive: it built the `token_hash` rail in `/auth/callback` and
made failures visible, but traffic still goes over the PKCE link, so **opening a magic
link on a second device is still broken in production today.**

Switching the traffic over takes two changes that must land together:

1. `app/api/v1/auth/magic-link/route.ts` — the sender becomes non-PKCE
   (`flowType: 'implicit'`), replacing the `@supabase/ssr` server client.
2. Supabase → Auth → Email Templates → **Magic Link** — link to exactly:
   `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=magiclink`

Both reasons were verified, not assumed:

- Under PKCE, GoTrue stores the token with a literal `pkce_` prefix (observed in
  `auth.one_time_tokens`), and `verifyOtp` rejects it — so flipping **only the template**
  mails a hash that cannot verify.
- An implicit sender under the **current** template makes GoTrue return the session in the
  URL *fragment*, which a server route can never read — so flipping **only the sender**
  breaks sign-in on every device, including the one that works today.

`&` not `?` (the redirect already carries `?next=`), and `.RedirectTo` not `.SiteURL`
(`site_url` is pinned to `http://localhost:3000` while one project backs all environments).

> The email template is shared by every environment, so step 2 must not be applied until
> the PR #160 code is live on `main`. Order: promote, then flip both.

```bash verify
# Passes once the Magic Link template links with token_hash.
curl -sf -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/fmbpikzpkafptqximhxn/config/auth" \
  | grep -q 'token_hash={{ .TokenHash }}'
```

---

### AUTH-RATELIMIT · Auth email rate limit raised from 2/hour to 30/hour

- **Type:** supabase-config
- **Atomic:** no
- **Applies to:** the shared project today; **must be re-applied to any new production project**
- **Applied:** 2026-08-12, during the BK-400 investigation

`rate_limit_email_sent` was **2** — project-wide, per hour. The whole product could send
two auth emails an hour; signup returned `429 email rate limit exceeded` under trivial
test load. Raised to **30**, Supabase's own default for a custom SMTP provider.

Already applied to `fmbpikzpkafptqximhxn`, so this entry passes today. It stays in the
ledger because it is invisible in git: a fresh production Supabase project would silently
start at the restrictive default again.

```bash verify
test "$(curl -sf -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/fmbpikzpkafptqximhxn/config/auth" \
  | grep -o '"rate_limit_email_sent":[0-9]*' | cut -d: -f2)" -ge 30
```

---

### AUTH-OTP-COPY · Confirmation email states the real code length

- **Type:** supabase-config
- **Atomic:** no
- **Applies to:** every environment
- **Applied:** 2026-08-12 — stored and read back, **not yet observed in delivered mail**

The signup confirmation template read *"Enter this 6-digit code"* while `mailer_otp_length`
is **8**, so it delivered 8 digits. Template corrected via the Management API.

The check below passes (the stored template is correct), but two signups two minutes apart
still delivered the old copy — GoTrue appears to cache templates. **Confirm against a real
delivered email before calling this done**, rather than trusting the stored value.

```bash verify
curl -sf -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  "https://api.supabase.com/v1/projects/fmbpikzpkafptqximhxn/config/auth" \
  | grep -q '8-digit code'
```

---

### REL-VERSION · Tag the release and make the app self-report it

- **Type:** release-mechanics
- **Atomic:** no
- **Applies to:** the repo

The repo has **zero git tags**, and both `package.json` and the login page badge say
`v0.1.0`. Whatever number v2 ends up being (`v0.2.0` and `v2.0.0` are both defensible from
here — that is a call to make at release time), three things must agree afterwards: the
git tag, `package.json`, and the badge rendered on `/login`.

This is the classic forgotten step: the release ships and the running app keeps announcing
the previous version.

```bash verify
# Passes when a tag exists and package.json agrees with the newest one.
tag="$(git tag --list --sort=-v:refname | head -1)"
test -n "$tag" || exit 1
test "$(node -p "require('./package.json').version")" = "${tag#v}"
```

---

### INFRA-GAP · No Supabase dashboard configuration is in version control

- **Type:** risk / follow-up
- **Atomic:** no
- **Applies to:** any future production Supabase project

There is no `supabase/config.toml` and no tracked snapshot of the GoTrue configuration.
Auth email templates, OTP length and expiry, the SMTP relay, `uri_allow_list` and the rate
limits exist **only** in the dashboard of project `fmbpikzpkafptqximhxn`.

Today that is survivable because one project backs every environment. The moment a real
production project is created, all of it has to be recreated from memory — and the three
entries above are direct evidence of how easily that memory is wrong.

Suggested fix: commit a generated snapshot (`supabase/auth-config.snapshot.json`) plus a
script that diffs the live config against it, so drift is visible in a PR. That is a
tech-story, not a release blocker — but the release is the moment it becomes expensive.

```bash verify
test -f supabase/auth-config.snapshot.json
```

---

## Done

_Nothing yet. Entries move here with the date they were verified, and stay for the record._

<!--
ENTRY FORMAT — the parser in scripts/check-release-readiness.ts depends on this shape:

  ### <KEY> · <Title>
  - **Type:** ...
  ...prose...
  ```bash verify
  <command that exits 0 when the action is genuinely done>
  ```

An entry with no ```bash verify``` block is reported as MANUAL and still blocks the gate,
so an unverifiable action cannot be quietly skipped.
-->
