'use client';

import type { PreparedRequest } from '../_lib/prepare';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { RequestCard } from './RequestCard';

/**
 * Tabbed group of Postman-style RequestCards. Replaces the old AuthMethods
 * curl-tabs — one tab per prepared request, each a read-only RequestCard with
 * a Visual/curl toggle. All html is pre-highlighted server-side.
 */
export function RequestCards({ requests }: { requests: PreparedRequest[] }) {
  if (!requests.length) {
    return <p className="text-sm text-fg-3">Auth no detectado — preguntá a tu lead.</p>;
  }
  return (
    <Tabs defaultValue={requests[0].id} data-testid="qa-auth-methods">
      <TabsList className="flex-wrap">
        {requests.map(r => (
          <TabsTrigger key={r.id} value={r.id} data-testid={`qa-auth-tab-${r.id}`}>
            {r.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {requests.map(r => (
        <TabsContent key={r.id} value={r.id}>
          <RequestCard
            method={r.method}
            url={r.url}
            description={r.description}
            headers={r.headers}
            body={r.body}
            response={r.response}
            curl={r.curl}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
