import { describe, expect, it } from 'vitest';
import { questionSchema } from '../question-form-schema';

const base = { prompt: '1+1=?', score: '10' };

function issuesOf(input: Record<string, unknown>) {
  const result = questionSchema.safeParse({ ...base, ...input });
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
}

describe('questionSchema', () => {
  it.each([
    ['fewer than two options', { type: 'single', options: ['2'], correctAnswers: ['2'] }, 'options: 至少需要 2 個選項'],
    ['an empty option', { type: 'single', options: ['2', ''], correctAnswers: ['2'] }, 'options: 選項不可空白'],
    ['no correct answer', { type: 'single', options: ['2', '3'], correctAnswers: [] }, 'correctAnswers: 請選擇正確答案'],
    [
      'code answers without an expected language',
      { type: 'short_text', responseFormat: 'code', expectedLanguage: '' },
      'expectedLanguage: 請輸入預期程式語言',
    ],
  ])('reports %s on the matching field', (_label, input, expected) => {
    expect(issuesOf(input)).toContain(expected);
  });

  it('accepts a complete single-choice question', () => {
    expect(issuesOf({ type: 'single', options: ['2', '3'], correctAnswers: ['2'] })).toEqual([]);
  });
});
