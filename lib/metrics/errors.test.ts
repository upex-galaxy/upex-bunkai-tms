import { ApiError } from '@lib/api/error-envelope';
import { mapRecoveryCycleRpcError } from '@lib/metrics/errors';
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
