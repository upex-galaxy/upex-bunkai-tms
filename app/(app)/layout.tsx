import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen min-h-0 flex-col bg-surface-0">
      {children}
    </div>
  );
}
