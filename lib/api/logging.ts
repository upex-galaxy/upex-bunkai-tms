// Single-line JSON logger for API routes. Vercel captures stdout and indexes
// the structured fields. Keep this dependency-free so it stays cheap to call
// from every handler.

type LogLevel = 'info' | 'warn' | 'error';

interface RequestLogFields {
  request_id: string
  method: string
  path: string
  status?: number
  duration_ms?: number
  user_id?: string
  error_code?: string
  message?: string
}

export function logRequest(level: LogLevel, fields: RequestLogFields): void {
  const line = JSON.stringify({
    level,
    ts: new Date().toISOString(),
    component: 'api',
    ...fields,
  });
  if (level === 'error') {
    console.error(line);
  }
  else if (level === 'warn') {
    console.warn(line);
  }
  else {
    console.log(line);
  }
}
