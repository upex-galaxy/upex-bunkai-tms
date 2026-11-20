import { ApiError } from '@lib/api/error-envelope';
import { CI_PIPELINE_URL_MAX, isCiPipelineUrl } from '@lib/runs/ci-link';

export const CI_COMMIT_MIN = 7;
export const CI_COMMIT_MAX = 64;
export const CI_BRANCH_MAX = 255;
export const CI_PIPELINE_NAME_MAX = 100;
export { CI_PIPELINE_URL_MAX };

export const CI_CONTEXT_FIELDS = ['commit', 'branch', 'pipeline_name', 'pipeline_url'] as const;
export type CiContextField = (typeof CI_CONTEXT_FIELDS)[number];

export interface CiContext {
  commit: string | null
  branch: string | null
  pipeline_name: string | null
  pipeline_url: string | null
}

export const EMPTY_CI_CONTEXT: CiContext = { commit: null, branch: null, pipeline_name: null, pipeline_url: null };

const HEX = /^[0-9a-f]+$/i;

function refuse(field: CiContextField, message: string): never {
  throw new ApiError('validation_failed', message, { details: { reason: `${field}_invalid`, field } });
}

function hasControlOrLineBreak(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1F || (code >= 0x7F && code <= 0x9F) || code === 0x2028 || code === 0x2029) {
      return true;
    }
  }
  return false;
}

function codePoints(value: string): number {
  return Array.from(value).length;
}

function readText(payload: Record<string, unknown>, field: CiContextField, rule: string): string | null {
  const raw = payload[field];
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== 'string' || hasControlOrLineBreak(raw)) {
    return refuse(field, `${field} must be ${rule}.`);
  }
  return raw.trim();
}

function parseCommit(payload: Record<string, unknown>): string | null {
  const rule = `a hexadecimal commit reference of ${CI_COMMIT_MIN} to ${CI_COMMIT_MAX} characters`;
  const value = readText(payload, 'commit', rule);
  if (value === null) {
    return null;
  }
  if (value.length < CI_COMMIT_MIN || value.length > CI_COMMIT_MAX || !HEX.test(value)) {
    return refuse('commit', `commit must be ${rule}.`);
  }
  return value.toLowerCase();
}

function parseName(payload: Record<string, unknown>, field: 'branch' | 'pipeline_name', max: number): string | null {
  const rule = `text of 1 to ${max} characters without line breaks or control characters`;
  const value = readText(payload, field, rule);
  if (value === null) {
    return null;
  }
  const length = codePoints(value);
  if (length < 1 || length > max) {
    return refuse(field, `${field} must be ${rule}.`);
  }
  return value;
}

function parsePipelineUrl(payload: Record<string, unknown>): string | null {
  const rule = `an http or https URL of at most ${CI_PIPELINE_URL_MAX} characters, without spaces or credentials`;
  const value = readText(payload, 'pipeline_url', rule);
  if (value === null) {
    return null;
  }
  if (!isCiPipelineUrl(value)) {
    return refuse('pipeline_url', `pipeline_url must be ${rule}.`);
  }
  return value;
}

export function parseCiContext(payload: Record<string, unknown>): CiContext {
  return {
    commit: parseCommit(payload),
    branch: parseName(payload, 'branch', CI_BRANCH_MAX),
    pipeline_name: parseName(payload, 'pipeline_name', CI_PIPELINE_NAME_MAX),
    pipeline_url: parsePipelineUrl(payload),
  };
}

export function reportedCiFields(payload: Record<string, unknown>): CiContextField[] {
  return CI_CONTEXT_FIELDS.filter(field => payload[field] !== undefined && payload[field] !== null);
}

export function presentCiContext(ci: CiContext): Partial<CiContext> {
  return Object.fromEntries(Object.entries(ci).filter(([, value]) => value !== null)) as Partial<CiContext>;
}

export function parseRunStartCiContext(via: 'cookie' | 'bearer', payload: unknown): CiContext {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return EMPTY_CI_CONTEXT;
  }
  const record = payload as Record<string, unknown>;
  const reported = reportedCiFields(record);
  if (via === 'cookie') {
    if (reported.length > 0) {
      throw new ApiError(
        'validation_failed',
        `A run started in the app carries no CI details; ${reported.join(', ')} can only be reported with an access token.`,
        { details: { reason: 'ci_context_not_allowed', fields: reported } },
      );
    }
    return EMPTY_CI_CONTEXT;
  }
  return parseCiContext(record);
}
