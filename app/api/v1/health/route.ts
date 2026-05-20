import { jsonResponse, withApiHandler } from '@lib/api/handler';
import { getEnvironment } from '@lib/urls';

export const dynamic = 'force-dynamic';

export const GET = withApiHandler(async () => {
  return jsonResponse({
    ok: true,
    service: 'bunkai-tms',
    env: getEnvironment(),
    ts: new Date().toISOString(),
  });
});
