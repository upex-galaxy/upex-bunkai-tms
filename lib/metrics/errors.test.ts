import { ApiError } from '@lib/api/error-envelope';
import { mapDefectHeatmapRpcError, mapRecoveryCycleRpcError } from '@lib/metrics/errors';
import { describe, expect, test } from 'bun:test';

// BK-47 — mirrors lib/coverage/errors.test.ts: the RPC only ever raises
// P0002 (non-disclosure); everything else maps to internal_error.

describe('mapRecoveryCycleRpcError', () => {
  test('maps P0002 to a non-disclosing 404', () => {
    expect(() => mapRecoveryCycleRpcError({ code: 'P0002', message: 'ignored' })).toThrow(ApiError);
    try {
      mapRecoveryCycleRpcError({ code: 'P0002', message: 'ignored' });
    }
    catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe('not_found');
      expect(apiError.message).toBe('Project not found.');
    }
  });

  test('maps an unrecognized code to internal_error, preserving the RPC message', () => {
    try {
      mapRecoveryCycleRpcError({ code: '42P01', message: 'relation does not exist' });
      throw new Error('expected mapRecoveryCycleRpcError to throw');
    }
    catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe('internal_error');
      expect(apiError.message).toBe('relation does not exist');
    }
  });

  test('maps a missing code to internal_error', () => {
    try {
      mapRecoveryCycleRpcError({ message: 'no code at all' });
      throw new Error('expected mapRecoveryCycleRpcError to throw');
    }
    catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe('internal_error');
    }
  });
});

// BK-42 — same non-disclosure P0002 contract as its report-family siblings,
// plus the RPC's own window backstop (45308 -> bad_request/400, AC-11's
// literal wording for THIS error only — its 403 is deliberately rejected).
describe('mapDefectHeatmapRpcError', () => {
  test('maps P0002 to a non-disclosing 404', () => {
    try {
      mapDefectHeatmapRpcError({ code: 'P0002', message: 'ignored' });
      throw new Error('expected mapDefectHeatmapRpcError to throw');
    }
    catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe('not_found');
      expect(apiError.message).toBe('Project not found.');
    }
  });

  test('maps 45308 to a 400 bad_request', () => {
    try {
      mapDefectHeatmapRpcError({ code: '45308', message: 'ignored' });
      throw new Error('expected mapDefectHeatmapRpcError to throw');
    }
    catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe('bad_request');
    }
  });

  test('maps an unrecognized code to internal_error, preserving the RPC message', () => {
    try {
      mapDefectHeatmapRpcError({ code: '42P01', message: 'relation does not exist' });
      throw new Error('expected mapDefectHeatmapRpcError to throw');
    }
    catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.code).toBe('internal_error');
      expect(apiError.message).toBe('relation does not exist');
    }
  });
});
