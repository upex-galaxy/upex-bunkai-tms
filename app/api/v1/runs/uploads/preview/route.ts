import type { NextRequest } from 'next/server';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { assertXmlContentType, parseUploadQuery, previewUpload, readCappedBody } from '@lib/runs/ci-upload-service';

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal } = getAuth(ctx);
  const query = parseUploadQuery(request.nextUrl.searchParams);
  assertXmlContentType(request.headers.get('content-type'));
  const bytes = await readCappedBody(request.body, request.headers.get('content-length'));
  const preview = await previewUpload(principal, query, bytes);
  return jsonResponse({ preview });
}, { auth: 'required', requires: ['run:execute'] });
