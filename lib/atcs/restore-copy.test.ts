import { describe, expect, it } from 'bun:test';
import { parentLabel, restoreToastMessage } from './restore-copy';

describe('restoreToastMessage', () => {
  it('names the restored ATC', () => {
    expect(restoreToastMessage('Login', null)).toBe('Restored "Login".');
  });

  it('says it waits for its Module', () => {
    expect(restoreToastMessage('Login', 'module')).toBe('Restored "Login". It stays out of the library until its Module is restored.');
  });

  it('says it waits for its User Story', () => {
    expect(restoreToastMessage('Login', 'user_story')).toBe('Restored "Login". It stays out of the library until its User Story is restored.');
  });
});

describe('parentLabel', () => {
  it('maps the two parents', () => {
    expect(parentLabel('module')).toBe('Module');
    expect(parentLabel('user_story')).toBe('User Story');
  });
});
