import { extractAcceptanceCriteria } from '@lib/jira/extract-acceptance-criteria';
import { describe, expect, test } from 'bun:test';

describe('extractAcceptanceCriteria', () => {
  test('## Acceptance Criteria heading + bullet list', () => {
    const md = [
      '## Acceptance Criteria',
      '',
      '- User can log in',
      '- User sees an error on bad credentials',
    ].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual([
      'User can log in',
      'User sees an error on bad credentials',
    ]);
  });

  test('AC: label + bullets', () => {
    const md = ['AC:', '- First criterion', '- Second criterion'].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual([
      'First criterion',
      'Second criterion',
    ]);
  });

  test('numbered list 1. 2.', () => {
    const md = [
      '### Criteria',
      '1. Given a logged-in user',
      '2. When they open the dashboard',
    ].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual([
      'Given a logged-in user',
      'When they open the dashboard',
    ]);
  });

  test('numbered list with ) marker', () => {
    const md = ['AC', '1) Alpha', '2) Beta'].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual(['Alpha', 'Beta']);
  });

  test('blank line between items is skipped, collecting continues', () => {
    const md = [
      '## Acceptance Criteria',
      '- One',
      '',
      '- Two',
      '',
      '- Three',
    ].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual(['One', 'Two', 'Three']);
  });

  test('stops at the next ## heading', () => {
    const md = [
      '## Acceptance Criteria',
      '- Keep me',
      '## Notes',
      '- Drop me',
    ].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual(['Keep me']);
  });

  test('no AC section returns []', () => {
    const md = ['## Description', '- Just a regular bullet'].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual([]);
  });

  test('anchor followed by prose (not a list) returns []', () => {
    const md = [
      '## Acceptance Criteria',
      'The user should be able to do things.',
      '- This bullet comes after prose so it is not collected',
    ].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual([]);
  });

  test('-, * and + bullet markers all work', () => {
    const md = [
      'Criteria',
      '- Dash item',
      '* Star item',
      '+ Plus item',
    ].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual([
      'Dash item',
      'Star item',
      'Plus item',
    ]);
  });

  test('**AC:** emphasis-style anchor is recognized', () => {
    const md = ['**AC:**', '- Emphasized anchor item'].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual(['Emphasized anchor item']);
  });

  test('case-insensitive anchor matching', () => {
    const md = ['## acceptance criteria', '- lower case anchor'].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual(['lower case anchor']);
  });

  test('uses the FIRST anchor when several appear', () => {
    const md = [
      'AC:',
      '- From first anchor',
      '## Acceptance Criteria',
      '- From second anchor',
    ].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual(['From first anchor']);
  });

  test('anchor with no following items returns []', () => {
    const md = ['## Acceptance Criteria', '', '## Other'].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual([]);
  });

  test('empty markdown returns []', () => {
    expect(extractAcceptanceCriteria('')).toEqual([]);
  });

  test('drops blank captured titles (whitespace-only item text)', () => {
    const md = ['Criteria', '-    ', '- Real item'].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual(['Real item']);
  });

  test('skips a horizontal rule or blockquote inside the AC block (does not truncate)', () => {
    const md = ['## Acceptance Criteria', '- One', '---', '> a note', '- Two', '## Next'].join('\n');
    expect(extractAcceptanceCriteria(md)).toEqual(['One', 'Two']);
  });
});
