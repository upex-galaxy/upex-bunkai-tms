import { XMLParser } from 'fast-xml-parser';
import { SyntaxValidator } from 'fast-xml-validator';

export const JUNIT_MAX_BYTES = 10 * 1024 * 1024;
export const JUNIT_MAX_ENTRIES = 1000;
export const JUNIT_TEXT_MAX = 255;
export const JUNIT_MESSAGE_MAX = 2000;
export const JUNIT_MAX_DEPTH = 64;
export const JUNIT_DURATION_MAX_SECONDS = 86400;
export const JUNIT_MAX_ELEMENTS = 50000;
export const JUNIT_MAX_ATTRIBUTES = 100000;

export type JunitResult = 'pass' | 'fail' | 'block';
export type JunitOutcome = 'passed' | 'failed' | 'errored' | 'skipped';

export interface JunitEntry {
  index: number
  name: string
  classname: string
  result: JunitResult
  outcome: JunitOutcome
  message: string | null
  timeSeconds: number
}

export interface JunitReport {
  entries: JunitEntry[]
  durationSeconds: number
}

export type JunitRejectReason
  = | 'report_empty'
    | 'report_not_utf8'
    | 'report_dtd_forbidden'
    | 'report_not_xml'
    | 'report_not_junit'
    | 'report_no_entries'
    | 'report_too_many_entries'
    | 'report_too_complex';

const REJECT_MESSAGES: Record<JunitRejectReason, string> = {
  report_empty: 'The file is empty. Upload a JUnit XML report (.xml), 10 MB at most.',
  report_not_utf8: 'The file is not UTF-8 text, so it is not a JUnit XML report. Only JUnit XML (.xml) is accepted, 10 MB at most.',
  report_dtd_forbidden: 'The report declares a DTD or an entity, which is not accepted. Export the JUnit XML report without a DOCTYPE and retry.',
  report_not_xml: 'The file is not well-formed XML, so it is not a JUnit XML report. Only JUnit XML (.xml) is accepted, 10 MB at most.',
  report_not_junit: 'The file is XML but not a JUnit report: its root element must be <testsuites> or <testsuite>.',
  report_no_entries: 'The report contains no <testcase> entries, so there is nothing to map. Export the JUnit XML report from your CI job and retry.',
  report_too_many_entries: `The report has more than ${JUNIT_MAX_ENTRIES} <testcase> entries. Upload a report with at most ${JUNIT_MAX_ENTRIES} entries.`,
  report_too_complex: `The report has more than ${JUNIT_MAX_ELEMENTS} XML elements or ${JUNIT_MAX_ATTRIBUTES} attributes. Upload a JUnit XML report with at most ${JUNIT_MAX_ENTRIES} entries.`,
};

export class JunitReportError extends Error {
  readonly reason: JunitRejectReason;

  constructor(reason: JunitRejectReason) {
    super(REJECT_MESSAGES[reason]);
    this.name = 'JunitReportError';
    this.reason = reason;
  }
}

type XmlNode = Record<string, unknown>;

const ATTRS = ':@';
const TEXT = '#text';
// eslint-disable-next-line no-control-regex -- strips the control characters Postgres text and jsonb cannot hold
const CONTROL_CHARS = /[\u0000-\u0008\v\f\u000E-\u001F\u007F]/g;

const validator = new SyntaxValidator({ multipleRoots: false, docType: { maxEntityCount: 0, maxEntitySize: 0 } });

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: { enabled: true, maxEntityCount: 1, maxEntitySize: 1, maxExpandedLength: JUNIT_MAX_BYTES },
  htmlEntities: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  removeNSPrefix: true,
  maxNestedTags: JUNIT_MAX_DEPTH,
});

export function decodeReportBytes(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) {
    throw new JunitReportError('report_empty');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  }
  catch {
    throw new JunitReportError('report_not_utf8');
  }
}

const LONE_SURROGATES = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

const SPECIAL_REFS: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', '\'': '&apos;' };

function decodeNumericRefs(xml: string): string {
  return xml.replace(/&#(x[0-9a-f]{1,6}|\d{1,7});/gi, (_match, code: string) => {
    const point = code[0] === 'x' || code[0] === 'X' ? Number.parseInt(code.slice(1), 16) : Number.parseInt(code, 10);
    if (point === 0x9 || point === 0xA || point === 0xD) {
      return String.fromCodePoint(point);
    }
    if (point < 0x20 || point > 0x10FFFF || (point >= 0xD800 && point <= 0xDFFF)) {
      return '';
    }
    const char = String.fromCodePoint(point);
    return SPECIAL_REFS[char] ?? char;
  });
}

function countMatches(text: string, pattern: RegExp, limit: number): number {
  let count = 0;
  pattern.lastIndex = 0;
  while (pattern.exec(text) !== null) {
    count += 1;
    if (count > limit) {
      return count;
    }
  }
  return count;
}

function clean(value: string, max: number): string {
  const chars = Array.from(value.replace(CONTROL_CHARS, '').replace(LONE_SURROGATES, '').trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
}

function tagOf(node: XmlNode): string | null {
  for (const key of Object.keys(node)) {
    if (key !== ATTRS && key !== TEXT) {
      return key;
    }
  }
  return null;
}

function childrenOf(node: XmlNode, tag: string): XmlNode[] {
  const value = node[tag];
  return Array.isArray(value) ? (value as XmlNode[]) : [];
}

function attr(node: XmlNode, name: string): string {
  const attrs = node[ATTRS];
  if (typeof attrs !== 'object' || attrs === null) {
    return '';
  }
  const value = (attrs as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : '';
}

function textOf(nodes: XmlNode[]): string {
  return nodes
    .map(child => (typeof child[TEXT] === 'string' ? (child[TEXT]) : ''))
    .join('\n');
}

function readEntry(node: XmlNode, index: number): JunitEntry {
  const children = childrenOf(node, 'testcase');
  let outcome: JunitOutcome = 'passed';
  let detail: XmlNode | null = null;
  let detailTag = '';
  for (const kind of ['failure', 'error', 'skipped'] as const) {
    const found = children.find(child => tagOf(child) === kind);
    if (found) {
      outcome = kind === 'failure' ? 'failed' : kind === 'error' ? 'errored' : 'skipped';
      detail = found;
      detailTag = kind;
      break;
    }
  }
  let message: string | null = null;
  if (detail) {
    const parts = [attr(detail, 'message'), textOf(childrenOf(detail, detailTag))]
      .map(part => part.trim())
      .filter(part => part !== '');
    const label = outcome === 'failed' ? 'Failure' : outcome === 'errored' ? 'Error' : 'Skipped';
    message = clean(parts.length > 0 ? `${label}: ${[...new Set(parts)].join('\n')}` : label, JUNIT_MESSAGE_MAX);
  }
  const time = Number.parseFloat(attr(node, 'time'));
  return {
    index,
    name: clean(attr(node, 'name'), JUNIT_TEXT_MAX) || '(unnamed)',
    classname: clean(attr(node, 'classname'), JUNIT_TEXT_MAX),
    result: outcome === 'passed' ? 'pass' : outcome === 'skipped' ? 'block' : 'fail',
    outcome,
    message,
    timeSeconds: Number.isFinite(time) && time > 0 ? time : 0,
  };
}

export function readJunitReport(raw: string): JunitReport {
  const text = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
  if (text.trim() === '') {
    throw new JunitReportError('report_empty');
  }
  if (/^\s*<!DOCTYPE\s+html\b/i.test(text)) {
    throw new JunitReportError('report_not_junit');
  }
  if (/<!DOCTYPE/i.test(text) || /<!ENTITY/i.test(text)) {
    throw new JunitReportError('report_dtd_forbidden');
  }
  const decoded = decodeNumericRefs(text);
  if (countMatches(text, /<[^!?/]/g, JUNIT_MAX_ELEMENTS) > JUNIT_MAX_ELEMENTS
    || countMatches(text, /\s[\w:.-]+\s*=\s*["']/g, JUNIT_MAX_ATTRIBUTES) > JUNIT_MAX_ATTRIBUTES) {
    throw new JunitReportError('report_too_complex');
  }
  if (countMatches(text, /<(?:[\w.-]+:)?testcase[\s/>]/g, JUNIT_MAX_ENTRIES) > JUNIT_MAX_ENTRIES) {
    throw new JunitReportError('report_too_many_entries');
  }

  let document: XmlNode[];
  try {
    validator.validate(decoded);
    document = parser.parse(decoded) as XmlNode[];
  }
  catch {
    throw new JunitReportError('report_not_xml');
  }

  const roots = document.filter(node => tagOf(node) !== null);
  const root = roots[0];
  const rootTag = root ? tagOf(root) : null;
  if (!root || roots.length !== 1 || (rootTag !== 'testsuites' && rootTag !== 'testsuite')) {
    throw new JunitReportError('report_not_junit');
  }

  const entries: JunitEntry[] = [];
  const stack: XmlNode[][] = [childrenOf(root, rootTag)];
  const cursor: number[] = [0];
  while (stack.length > 0) {
    const level = stack.length - 1;
    const nodes = stack[level];
    const at = cursor[level];
    if (at >= nodes.length) {
      stack.pop();
      cursor.pop();
      continue;
    }
    cursor[level] = at + 1;
    const node = nodes[at];
    const tag = tagOf(node);
    if (tag === 'testcase') {
      if (entries.length >= JUNIT_MAX_ENTRIES) {
        throw new JunitReportError('report_too_many_entries');
      }
      entries.push(readEntry(node, entries.length + 1));
    }
    else if (tag === 'testsuite') {
      stack.push(childrenOf(node, 'testsuite'));
      cursor.push(0);
    }
  }

  if (entries.length === 0) {
    throw new JunitReportError('report_no_entries');
  }

  const total = entries.reduce((sum, entry) => sum + entry.timeSeconds, 0);
  return {
    entries,
    durationSeconds: Math.min(JUNIT_DURATION_MAX_SECONDS, Math.round(total)),
  };
}
