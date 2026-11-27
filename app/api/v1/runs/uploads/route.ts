import type { NextRequest } from 'next/server';
import { getAuth, jsonResponse, withApiHandler } from '@lib/api/handler';
import { assertXmlContentType, executeUpload, parseUploadCiContext, parseUploadQuery, readCappedBody } from '@lib/runs/ci-upload-service';

export const POST = withApiHandler(async (request: NextRequest, ctx) => {
  const { principal } = getAuth(ctx);
  const params = request.nextUrl.searchParams;
  const query = { ...parseUploadQuery(params), ci: parseUploadCiContext(params) };
  const encoding = assertXmlContentType(request.headers.get('content-type'));
  const bytes = await readCappedBody(request.body, request.headers.get('content-length'));
  const { status, body } = await executeUpload(principal, query, bytes, encoding);
  return jsonResponse(body, { status });
}, { auth: 'required', requires: ['run:execute'] });
