'use client';

import type { QaConfig } from '../qa-config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { CodeBlock } from './CodeBlock';

export function AuthMethods({ config }: { config: QaConfig }) {
  const methods = config.api.authMethods;
  if (!methods.length) {
    return <p className="text-sm text-fg-3">Auth no detectado — preguntá a tu lead.</p>;
  }
  return (
    <Tabs defaultValue={methods[0].id} data-testid="qa-auth-methods">
      <TabsList className="flex-wrap">
        {methods.map(m => (
          <TabsTrigger key={m.id} value={m.id} data-testid={`qa-auth-tab-${m.id}`}>
            {m.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {methods.map(m => (
        <TabsContent key={m.id} value={m.id}>
          <CodeBlock language="bash" code={m.snippet} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
