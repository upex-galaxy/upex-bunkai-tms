'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';

export function HarnessTabs({ items }: { items: { id: string, label: string, content: ReactNode }[] }) {
  return (
    <Tabs defaultValue={items[0]?.id} data-testid="qa-harness-tabs">
      <TabsList className="flex-wrap">
        {items.map(item => (
          <TabsTrigger key={item.id} value={item.id} data-testid={`qa-harness-tab-${item.id}`}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map(item => (
        <TabsContent key={item.id} value={item.id} data-testid={`qa-harness-panel-${item.id}`}>
          {item.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
