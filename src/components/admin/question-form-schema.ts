import { z } from 'zod';

// Each cross-field rule reports on the field the add-question form renders an error for,
// so a broken rule shows a message instead of silently blocking submission.
export const questionSchema = z.object({
  prompt: z.string().min(1, '請輸入題目內容'),
  type: z.enum(['single', 'multiple', 'short_text'], {
    message: '請選擇題目類型',
  }),
  score: z.string().min(1, '請輸入分數').refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, '分數必須大於 0'),
  options: z.array(z.string()).optional(),
  correctAnswers: z.array(z.string()).optional(),
  codeSnippet: z.string().optional(),
  codeLanguage: z.string().optional(),
  responseFormat: z.enum(['text', 'code']).optional(),
  expectedLanguage: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.type === 'single' || data.type === 'multiple') {
    const options = data.options ?? [];
    if (options.length < 2) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: '至少需要 2 個選項' });
    } else if (options.some((option) => option.trim() === '')) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: '選項不可空白' });
    }
    if (!data.correctAnswers || data.correctAnswers.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['correctAnswers'], message: '請選擇正確答案' });
    }
  }

  if (data.type === 'short_text' && data.responseFormat === 'code' && !data.expectedLanguage?.trim()) {
    ctx.addIssue({ code: 'custom', path: ['expectedLanguage'], message: '請輸入預期程式語言' });
  }
});

export type QuestionFormData = z.infer<typeof questionSchema>;
