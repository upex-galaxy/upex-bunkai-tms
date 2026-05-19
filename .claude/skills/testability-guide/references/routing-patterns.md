# Routing Patterns

> **Purpose**: Per-framework file location for the new `/qa` page + redirect mechanism for the old route (Q4 = yes).
>
> **When to read**: Phase 4 of `SKILL.md`, after pre-flight detected the framework.

---

## Where the page file lives

| Framework            | Page file path                                                   | Notes                                                                            |
| -------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Next.js App Router   | `app/qa/page.tsx`                                                | Default for modern Next.js. Add `metadata` export with the page title.           |
| Next.js Pages Router | `pages/qa.tsx`                                                   | Legacy Next.js. Use `Head` for the page title.                                   |
| Remix                | `app/routes/qa.tsx`                                              | Default route convention.                                                        |
| Astro                | `src/pages/qa.astro`                                             | Static by default; mark interactive sections with `client:load` if they need JS. |
| SvelteKit            | `src/routes/qa/+page.svelte`                                     | Use a `+page.ts` only if data loading is needed (none required for this page).   |
| Vite + React Router  | beside other route components, plus a `<Route path="/qa">` entry | Register in the router config file the host already uses.                        |
| Nuxt                 | `pages/qa.vue`                                                   | Layout: host default.                                                            |

If the host framework is none of these → STOP and ask the user where to put the page. Do not invent.

---

## Redirect mechanism for the old route (Q4 = yes)

The pre-flight detected one of `/guide`, `/docs`, `/onboarding`, `/integration` overlapping with `/qa`. Replace its content with a server-side redirect (faster, no client-side flash). Fall back to client-side only if the framework cannot do server-side redirects in this context.

### Next.js (App or Pages Router)

Add to `next.config.{ts,js}`:

```ts
async redirects() {
  return [
    { source: '/guide', destination: '/qa', permanent: true },
  ];
}
```

Permanent (`true`) → 308. Use `false` (307) only if the team wants to preserve the option to revert without cache pollution.

### Remix

In `app/routes/guide.tsx`:

```ts
import { redirect } from '@remix-run/node';
export const loader = () => redirect('/qa', 301);
```

### Astro

In `src/pages/guide.astro` (or `src/pages/guide.ts` for endpoint redirect):

```ts
export const GET = () => new Response(null, { status: 301, headers: { Location: '/qa' } });
```

### SvelteKit

In `src/routes/guide/+server.ts`:

```ts
import { redirect } from '@sveltejs/kit';
export const GET = () => {
  throw redirect(301, '/qa');
};
```

### Nuxt

In `nuxt.config.{ts,js}`:

```ts
routeRules: {
  '/guide': { redirect: { to: '/qa', statusCode: 301 } },
}
```

### Client-side fallback (only if the host config does not support server-side)

In the old route's component:

```ts
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GuideRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/qa'); }, [router]);
  return <p>Redirecting…</p>;
}
```

Pick `useEffect` + `router.replace` (history-replacing) over `router.push` (history-appending) so the back button still works.

---

## Keep the old route reachable for one release cycle

Even when redirecting, do NOT delete the old route's file. External bookmarks, internal Slack pins, and CI links may point at it. The redirect lets them keep working. Schedule removal in a follow-up cycle (the skill records this in the audit trail).

---

## Page metadata (per framework)

| Framework            | Where the title goes                                                          |
| -------------------- | ----------------------------------------------------------------------------- |
| Next.js App Router   | `export const metadata = { title: 'Software Testability Guide for QA' };`     |
| Next.js Pages Router | `<Head><title>Software Testability Guide for QA</title></Head>`               |
| Remix                | `export const meta = () => [{ title: 'Software Testability Guide for QA' }];` |
| Astro                | `<title>Software Testability Guide for QA</title>` inside `<head>`            |
| SvelteKit            | `<svelte:head><title>…</title></svelte:head>`                                 |
| Nuxt                 | `useHead({ title: 'Software Testability Guide for QA' })`                     |

The visible page H1 ALWAYS reads `Software Testability Guide for QA` regardless of language (only translated when Q5 demands it).
