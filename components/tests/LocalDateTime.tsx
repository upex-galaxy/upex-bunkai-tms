'use client';

import { formatStatusChangeTime } from '@lib/tests/automation-status';
import { useSyncExternalStore } from 'react';

// BK-227 — a timestamp in the viewer's own time zone. The server cannot know
// it, so the first paint states UTC and the browser swaps in local time
// without a hydration mismatch.

const subscribe = () => () => {};

export function LocalDateTime({ iso, 'data-testid': testId }: { 'iso': string, 'data-testid'?: string }) {
  const local = useSyncExternalStore(subscribe, () => formatStatusChangeTime(iso), () => null);
  return (
    <time dateTime={iso} title={iso} data-testid={testId}>
      {local ?? `${formatStatusChangeTime(iso, 'UTC')} UTC`}
    </time>
  );
}
