import { describe, expect, it } from 'bun:test';
import { AttachmentInitBodySchema, extractAttachmentIds, isUuid } from './attachment-validation';

const R = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const A = '33333333-3333-4333-8333-333333333333';

describe('AttachmentInitBodySchema', () => {
  it('accepts the three fields and rejects missing or wrongly typed ones', () => {
    expect(AttachmentInitBodySchema.safeParse({ filename: 'a.png', content_type: 'image/png', byte_size: 10 }).success).toBe(true);
    expect(AttachmentInitBodySchema.safeParse({ filename: 'a.png', content_type: 'image/png' }).success).toBe(false);
    expect(AttachmentInitBodySchema.safeParse({ filename: 'a.png', content_type: 'image/png', byte_size: '10' }).success).toBe(false);
    expect(AttachmentInitBodySchema.safeParse({ filename: 1, content_type: 'image/png', byte_size: 10 }).success).toBe(false);
  });
});

describe('extractAttachmentIds', () => {
  it('reads every id by segment name for each route shape', () => {
    expect(extractAttachmentIds(`/api/v1/runs/${R}/steps/${S}/attachments`)).toEqual({ runId: R, stepId: S, attachmentId: '' });
    expect(extractAttachmentIds(`/api/v1/runs/${R}/steps/${S}/attachments/${A}`)).toEqual({ runId: R, stepId: S, attachmentId: A });
    expect(extractAttachmentIds(`/api/v1/runs/${R}/steps/${S}/attachments/${A}/commit`)).toEqual({ runId: R, stepId: S, attachmentId: A });
    expect(extractAttachmentIds(`/api/v1/runs/${R}/steps/${S}/attachments/${A}/content/`)).toEqual({ runId: R, stepId: S, attachmentId: A });
    expect(extractAttachmentIds(`/api/v1/runs/${R}/attachments`)).toEqual({ runId: R, stepId: '', attachmentId: '' });
  });

  it('answers empty strings (and so a 400) when a segment is absent', () => {
    expect(extractAttachmentIds('/api/v1/runs')).toEqual({ runId: '', stepId: '', attachmentId: '' });
  });

  it('isUuid accepts a UUID and nothing else', () => {
    expect(isUuid(R)).toBe(true);
    expect(isUuid(`${R}x`)).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});
