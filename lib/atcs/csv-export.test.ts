import type { AtcExportRow } from './csv-export';
import { describe, expect, it } from 'bun:test';
import { atcsExportFilename, renderAtcsCsv } from './csv-export';

function row(overrides: Partial<AtcExportRow> = {}): AtcExportRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'login-happy-path',
    title: 'Login succeeds with valid credentials',
    module_path: 'Auth',
    layer: 'UI',
    tags: [],
    status: 'unrun',
    ...overrides,
  };
}

describe('renderAtcsCsv', () => {
  it('emits the fixed header in the exact contracted order (AC1.3)', () => {
    const csv = renderAtcsCsv([]);
    expect(csv).toBe('ATC ID,Slug,Title,Module,Layer,Tags,Status\r\n');
  });

  it('emits one data row per ATC, all 7 columns populated (AC1.1)', () => {
    const csv = renderAtcsCsv([row()]);
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('11111111-1111-4111-8111-111111111111,login-happy-path,Login succeeds with valid credentials,Auth,UI,,unrun');
  });

  it('exports exactly 1 header + 1 data row for a single-ATC library (AC1.2)', () => {
    const csv = renderAtcsCsv([row()]);
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(2);
  });

  it('exports header-only for zero ATCs, never an error (AC2.1)', () => {
    const csv = renderAtcsCsv([]);
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1);
  });

  it('exports exactly 501 rows for a 500-ATC library, none dropped (AC5.1)', () => {
    const rows = Array.from({ length: 500 }, (_, i) => row({ id: `atc-${i}`, slug: `atc-${i}` }));
    const csv = renderAtcsCsv(rows);
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(501);
  });

  it('joins multiple tags with "; " into a single cell (AC1.4, PO Q1)', () => {
    const csv = renderAtcsCsv([row({ tags: ['smoke', 'regression', 'critical-path'] })]);
    expect(csv).toContain('smoke; regression; critical-path');
  });

  it('passes each valid status value through verbatim (AC1.5)', () => {
    const statuses = ['pass', 'fail', 'blocked', 'skipped', 'running', 'unrun'];
    const rows = statuses.map(status => row({ id: status, slug: status, status }));
    const csv = renderAtcsCsv(rows);
    for (const status of statuses) {
      expect(csv).toContain(`,${status}\r\n`);
    }
  });

  it('quotes a Title containing only a comma (AC4.1)', () => {
    const csv = renderAtcsCsv([row({ title: 'Login, then verify session' })]);
    expect(csv).toContain('"Login, then verify session"');
  });

  it('quotes and doubles an embedded quote (AC4.2)', () => {
    const csv = renderAtcsCsv([row({ title: 'Click "Submit" button' })]);
    expect(csv).toContain('"Click ""Submit"" button"');
  });

  it('quotes and preserves an embedded line break (AC4.3)', () => {
    const csv = renderAtcsCsv([row({ title: 'Login fails\nwhen offline' })]);
    expect(csv).toContain('"Login fails\nwhen offline"');
  });

  it('quotes, doubles, and preserves comma + quote + line break combined (AC4.0)', () => {
    const csv = renderAtcsCsv([row({ title: 'Login "fails", when\npassword is empty' })]);
    expect(csv).toContain('"Login ""fails"", when\npassword is empty"');
  });

  it('escapes Title and Tags independently in the same row when both need it (AC4.4)', () => {
    const csv = renderAtcsCsv([row({
      title: 'Order "fails", edge-case',
      tags: ['blocker, urgent', 'p1'],
    })]);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toContain('"Order ""fails"", edge-case"');
    expect(dataLine).toContain('"blocker, urgent; p1"');
  });

  it('leaves both cells unquoted when neither has special characters (AC4.4 row 1)', () => {
    const csv = renderAtcsCsv([row({ title: 'Plain title', tags: ['smoke'] })]);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).not.toContain('"');
  });

  it('quotes only the Tags cell when a tag\'s own text has a comma (AC4.5)', () => {
    const csv = renderAtcsCsv([row({ title: 'Plain title', tags: ['urgent, blocker'] })]);
    const dataLine = csv.split('\r\n')[1];
    expect(dataLine).toBe('11111111-1111-4111-8111-111111111111,login-happy-path,Plain title,Auth,UI,"urgent, blocker",unrun');
  });

  it('orders rows by module path then slug, deterministically', () => {
    const csv = renderAtcsCsv([
      row({ id: '2', slug: 'b-atc', module_path: 'Zeta' }),
      row({ id: '1', slug: 'a-atc', module_path: 'Alpha' }),
      row({ id: '3', slug: 'a-atc-2', module_path: 'Alpha' }),
    ]);
    const dataLines = csv.split('\r\n').filter(Boolean).slice(1);
    expect(dataLines.map(l => l.split(',')[0])).toEqual(['1', '3', '2']);
  });
});

describe('atcsExportFilename', () => {
  it('builds a stable, slug-based filename', () => {
    expect(atcsExportFilename('checkout-revamp')).toBe('checkout-revamp-atcs.csv');
  });
});
