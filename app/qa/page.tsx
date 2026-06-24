/* qa-guide-snapshot
   skill-version=1.1.0
   stack=next-15
   ui-kit=shadcn
   icons=lucide-react
   auth-method=supabase-password+otp+cookie+bearer-pat
   docs-ui=scalar
   docs-route=/api/docs
   openapi-spec=/api/openapi
   db=supabase-postgres
   orm=none
   repos-shape=mono
   mcp-config-files=mcp.json,opencode.jsonc
   language=es
   publisher=jira-epic
   credentials-source=https://jira.upexgalaxy.com/browse/BK-29
   default-branch=main
   adr=ADR-0007
   generated=2026-06-24
   content-hash=sha256:9e9feb18046fdb3b22b18493f71d1032e7d24f91aa2d8df1487ffad91ee6f61b
*/

import type { Metadata } from 'next';
import { QaShell } from './_components/QaShell';
import { qaConfig } from './qa-config';

export const metadata: Metadata = {
  title: 'Software Testability Guide for QA · Bunkai',
};

// Public teaching surface — no auth gate. The credentials themselves live in the
// Jira Epic linked above, never inlined here.
export default function QaPage() {
  return <QaShell config={qaConfig} />;
}
