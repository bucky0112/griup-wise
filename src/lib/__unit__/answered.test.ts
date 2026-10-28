import { describe, expect, it } from 'vitest';
import { isAnswered } from '@/lib/answered';

describe('isAnswered', () => {
  it.each([
    ['single', 'A', true],
    ['single', '', false],
    ['single', null, false],
    ['single', undefined, false],
    ['boolean', false, true],
    ['boolean', true, true],
    ['boolean', '', false],
    ['boolean', undefined, false],
    ['boolean', null, false],
    ['numeric', 0, true],
    ['numeric', '', false],
    ['numeric', null, false],
    ['numeric', undefined, false],
    ['multiple', ['A'], true],
    ['multiple', [], false],
    ['multiple', 'A', false],
    ['multiple', undefined, false],
    ['multiple', null, false],
    ['short_text', 'Ruby', true],
    ['short_text', '   \n', false],
    ['short_text', { type: 'text_response', content: 'Ruby' }, true],
    ['short_text', { type: 'text_response', content: '  ' }, false],
    ['short_text', { type: 'text_response' }, false],
    ['short_text', null, false],
    ['short_text', undefined, false],
  ])('%s with %j is answered: %s', (type, response, expected) => {
    expect(isAnswered(type, response)).toBe(expected);
  });
});
