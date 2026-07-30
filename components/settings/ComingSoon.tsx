import { Card, CardContent } from '@components/ui/card';
import Link from 'next/link';

interface ComingSoonProps {
  title: string
  description: string
  route: string
}

// Generic "not shipped yet" card for Settings sections without a real screen
// yet (BK-87 TD10). Mirrors `settings-coming-soon.html`'s honest dead-end
// pattern: one-liner of what ships, "planned, no committed date", a route
// that still resolves (200, never a 404), and a way back to a live section.
// Zero fake forms/controls/JS.
export function ComingSoon({ title, description, route }: ComingSoonProps) {
  return (
    <Card data-testid="coming-soon-card">
      <CardContent className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-fg-0">
            {title}
            <span
              data-testid="coming-soon-tag"
              className="rounded-2 border border-stroke-2 bg-surface-3 px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-fg-3"
            >
              not shipped
            </span>
          </h2>
          <p className="mt-2 max-w-[62ch] text-sm text-fg-2">{description}</p>
          <p className="mt-2 max-w-[62ch] text-xs text-fg-3">
            Planned, with no committed date. Your link worked and nothing is wrong
            {' '}
            — this section just isn&apos;t in the product yet.
          </p>
        </div>
        <div data-testid="coming-soon-route-line" className="rounded-2 border border-stroke-1 bg-surface-1 px-3 py-2 font-mono text-xs text-fg-3">
          GET
          {' '}
          {route}
          {' → '}
          <span className="text-signal-pass">200</span>
          {' '}
          · rendered as coming-soon — a planned section is never a 404
        </div>
        <div>
          <Link
            href="/settings/account"
            data-testid="coming-soon-back-link"
            className="inline-flex h-8 items-center gap-2 rounded-2 bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hi"
          >
            Back to Account
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
