import { describe, expect, it } from 'bun:test';
import {
  decodeReportBytes,
  JUNIT_MAX_ENTRIES,
  JUNIT_MESSAGE_MAX,
  JUNIT_TEXT_MAX,
  JunitReportError,
  readJunitReport,
} from './junit-report';

function rejection(run: () => unknown): string {
  try {
    run();
  }
  catch (error) {
    if (error instanceof JunitReportError) {
      return error.reason;
    }
    throw error;
  }
  throw new Error('expected a rejection');
}

const suite = (cases: string) => `<?xml version="1.0" encoding="UTF-8"?><testsuites><testsuite name="s">${cases}</testsuite></testsuites>`;

describe('readJunitReport', () => {
  it('reads every testcase in document order, flattening nested suites', () => {
    const report = readJunitReport(`<testsuites>
      <testsuite name="a">
        <testcase name="one" classname="c.A" time="1.25"/>
        <testsuite name="inner"><testsuite name="deeper"><testcase name="two" time="2"/></testsuite></testsuite>
        <testcase name="three"/>
      </testsuite>
      <testsuite name="b"><testcase name="four"/></testsuite>
    </testsuites>`);
    expect(report.entries.map(e => e.name)).toEqual(['one', 'two', 'three', 'four']);
    expect(report.entries.map(e => e.index)).toEqual([1, 2, 3, 4]);
    expect(report.entries[0]).toMatchObject({ classname: 'c.A', timeSeconds: 1.25, result: 'pass', outcome: 'passed', message: null });
    expect(report.durationSeconds).toBe(3);
  });

  it('accepts a single testsuite root, a BOM and namespace prefixes', () => {
    expect(readJunitReport('\uFEFF<testsuite><testcase name="bom"/></testsuite>').entries[0].name).toBe('bom');
    expect(readJunitReport('<j:testsuite xmlns:j="urn:x"><j:testcase name="ns"/></j:testsuite>').entries[0].name).toBe('ns');
  });

  it('maps failure and error to fail, skipped to block, and keeps the message', () => {
    const { entries } = readJunitReport(suite(
      '<testcase name="f"><failure message="expected 200">at line 3</failure></testcase>'
      + '<testcase name="e"><error message="timeout"/></testcase>'
      + '<testcase name="s"><skipped message="flaky"/></testcase>'
      + '<testcase name="p"><system-out>log</system-out></testcase>',
    ));
    expect(entries.map(e => [e.result, e.outcome])).toEqual([['fail', 'failed'], ['fail', 'errored'], ['block', 'skipped'], ['pass', 'passed']]);
    expect(entries[0].message).toBe('Failure: expected 200\nat line 3');
    expect(entries[1].message).toBe('Error: timeout');
    expect(entries[2].message).toBe('Skipped: flaky');
    expect(entries[3].message).toBeNull();
  });

  it('decodes predefined entities and character references, and drops control characters', () => {
    const { entries } = readJunitReport(suite('<testcase name="a &amp; b &lt;c&gt; &#65;&#x42;"><failure message="l1&#10;l2">x</failure></testcase>'));
    expect(entries[0].name).toBe('a & b <c> AB');
    expect(entries[0].message).toBe('Failure: l1\nl2\nx');
  });

  it('keeps hostile-looking names as plain text', () => {
    const { entries } = readJunitReport(suite('<testcase name="&lt;img src=x onerror=alert(1)&gt;" classname="__proto__"/>'));
    expect(entries[0].name).toBe('<img src=x onerror=alert(1)>');
    expect(entries[0].classname).toBe('__proto__');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('names an unnamed entry and caps names and messages', () => {
    const long = 'x'.repeat(5000);
    const { entries } = readJunitReport(suite(`<testcase/><testcase name="${long}" classname="${long}"><failure message="${long}"/></testcase>`));
    expect(entries[0].name).toBe('(unnamed)');
    expect(entries[1].name).toHaveLength(JUNIT_TEXT_MAX);
    expect(entries[1].name.endsWith('…')).toBe(true);
    expect(entries[1].classname).toHaveLength(JUNIT_TEXT_MAX);
    expect(entries[1].message).toHaveLength(JUNIT_MESSAGE_MAX);
  });

  it('ignores negative or invalid times and caps the duration at 24 hours', () => {
    expect(readJunitReport(suite('<testcase name="a" time="-4"/><testcase name="b" time="NaN"/>')).durationSeconds).toBe(0);
    expect(readJunitReport(suite('<testcase name="a" time="90000"/>')).durationSeconds).toBe(86400);
  });

  it('refuses a DTD or an entity declaration before parsing', () => {
    expect(rejection(() => readJunitReport('<!DOCTYPE testsuite [<!ENTITY lol "lol">]><testsuite><testcase name="&lol;"/></testsuite>'))).toBe('report_dtd_forbidden');
    expect(rejection(() => readJunitReport('<?xml version="1.0"?><!DOCTYPE foo SYSTEM "file:///etc/passwd"><testsuite/>'))).toBe('report_dtd_forbidden');
    expect(rejection(() => readJunitReport('<testsuite><!ENTITY x "y"><testcase name="a"/></testsuite>'))).toBe('report_dtd_forbidden');
  });

  it('refuses a billion-laughs document', () => {
    const bomb = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;">]><testsuite><testcase name="&lol2;"/></testsuite>';
    expect(rejection(() => readJunitReport(bomb))).toBe('report_dtd_forbidden');
  });

  it('refuses text that is not well-formed XML', () => {
    for (const text of ['%PDF-1.7 binary', '<testsuite><testcase name="a"></testsuite>', '<testsuite>', '<a b="1" b="2"/>', '<testsuite/><testsuite/>']) {
      expect(rejection(() => readJunitReport(text))).toBe('report_not_xml');
    }
  });

  it('refuses well-formed XML that is not a JUnit report', () => {
    expect(rejection(() => readJunitReport('<html><body><testcase name="a"/></body></html>'))).toBe('report_not_junit');
    expect(rejection(() => readJunitReport('<?xml version="1.0"?><rss><channel/></rss>'))).toBe('report_not_junit');
  });

  it('refuses an empty file and a report with no testcase', () => {
    expect(rejection(() => readJunitReport('   '))).toBe('report_empty');
    expect(rejection(() => readJunitReport('<testsuites><testsuite name="empty"/></testsuites>'))).toBe('report_no_entries');
  });

  it('accepts exactly the entry limit and refuses one more', () => {
    const cases = (n: number) => Array.from({ length: n }, (_, i) => `<testcase name="t${i}"/>`).join('');
    expect(readJunitReport(suite(cases(JUNIT_MAX_ENTRIES))).entries).toHaveLength(JUNIT_MAX_ENTRIES);
    expect(rejection(() => readJunitReport(suite(cases(JUNIT_MAX_ENTRIES + 1))))).toBe('report_too_many_entries');
  });

  it('refuses nesting deeper than the parser allows', () => {
    const deep = `${'<testsuite>'.repeat(80)}<testcase name="a"/>${'</testsuite>'.repeat(80)}`;
    expect(rejection(() => readJunitReport(deep))).toBe('report_not_xml');
  });

  it('names the supported format and the limit in its messages', () => {
    expect(new JunitReportError('report_not_xml').message).toContain('JUnit XML (.xml)');
    expect(new JunitReportError('report_not_xml').message).toContain('10 MB');
  });
});

describe('decodeReportBytes', () => {
  it('decodes UTF-8 and refuses empty or non UTF-8 bytes', () => {
    expect(decodeReportBytes(new TextEncoder().encode('<testsuite/>'))).toBe('<testsuite/>');
    expect(rejection(() => decodeReportBytes(new Uint8Array(0)))).toBe('report_empty');
    expect(rejection(() => decodeReportBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xFF, 0xFE, 0xC3])))).toBe('report_not_utf8');
  });
});
