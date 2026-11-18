# Routing patterns

> **Purpose**: Where the new `/qa` page file lives in each framework, and how to redirect the old route (Q4 = yes).
>
> **When to read**: Phase 4 of `SKILL.md`, after pre-flight detected the framework.

---

## Where the page file lives

| Framework            | Page file path                                                   | Notes                                                                            |
| -------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Next.js App Router   | `app/qa/page.tsx`                                                | Default for modern Next.js. Add a `metadata` export with the page title.         |
| Next.js Pages Router | `pages/qa.tsx`                                                   | Legacy Next.js. Use `Head` for the page title.                                   |
| Remix                | `app/routes/qa.tsx`                                              | Default route convention.                                                        |
| Astro                | `src/pages/qa.astro`                                             | Static by default; mark interactive sections with `client:load` if they need JS. |
| SvelteKit            | `src/routes/qa/+page.svelte`                                     | Add a `+page.ts` only if data loading is needed (this page needs none).          |
| Vite + React Router  | beside other route components, plus a `<Route path="/qa">` entry | Register in the router config file the host already uses.                        |
| Nuxt                 | `pages/qa.vue`                                                   | Layout: host default.                                                            |

When the host framework is none of these, ask the user where the page goes instead of inventing a location. With nobody at the keyboard, write the page nowhere, list the framework and the question in the run report, and stop that step.

---

## Redirect mechanism for the old route (Q4 = yes)

Pre-flight found one of `/guide`, `/docs`, `/onboarding` or `/integration` overlapping with `/qa`. Replace its content with a server-side redirect (faster, no client-side flash). Fall back to client-side only when the framework cannot redirect on the server in this context.

### Next.js (App or Pages Router)

Add to `next.config.{ts,js}`:

```ts
async redirects() {
  return [
    { source: '/guide', destination: '/qa', permanent: true },
  ];
}
```

`permanent: true` gives a 308. Use `false` (307) only when the team wants to keep the option of reverting without cache pollution.

### Remix

In `app/routes/guide.tsx`:

```ts
import { redirect } from '@remix-run/node';
export const loader = () => redirect('/qa', 301);
```

### Astro

In `src/pages/guide.astro` (or `src/pages/guide.ts` for an endpoint redirect):

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

### Client-side fallback (only when the host config does not support a server-side redirect)

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

Pick `useEffect` with `router.replace` (history-replacing) over `router.push` (history-appending), so the back button still works.

---

## Keep the old route reachable for one release cycle

Even when redirecting, leave the old route's file in place. External bookmarks, internal Slack pins and CI links may point at it, and the redirect keeps them working. Schedule its removal for a follow-up cycle (the skill records this in the audit trail).

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

The visible page H1 always reads `Software Testability Guide for QA`, whatever the page language (it is translated only when Q5 demands it).
