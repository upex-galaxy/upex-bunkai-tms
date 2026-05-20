import type { ReactNode } from 'react';
import { AuthProvider } from '@components/providers/auth-context';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex h-screen min-h-0 flex-col bg-surface-0">
        {children}
      </div>
    </AuthProvider>
  );
}
