import { AcceptClient } from './accept-client';

// Public landing for the invite redemption flow. The page itself is server
// component to keep the bundle small; the client component handles the call
// to /api/v1/invites/accept and the subsequent redirect.
//
// `?token=...` is read at render time and forwarded to the client component
// as a prop so it never lives in the URL search params on the client side
// after acceptance.
export default async function AcceptInvitePage(
  { searchParams }: { searchParams: Promise<{ token?: string, next?: string }> },
) {
  const { token, next } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 px-6 py-10">
      <AcceptClient token={token ?? ''} nextPath={next ?? '/projects'} />
    </div>
  );
}
