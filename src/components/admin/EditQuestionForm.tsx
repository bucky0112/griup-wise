'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';

const questionSchema = z.object({
  prompt: z.string().min(1, '請輸入題目內容'),
  type: z.enum(['single', 'multiple', 'short_text'], {
    message: '請選擇題目類型',
  }),
  score: z.string().min(1, '請輸入分數').refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, '分數必須大於 0'),
  options: z.array(z.string().min(1, '選項不可為空')).min(2, '至少需要 2 個選項').optional(),
  correctAnswers: z.array(z.string()).min(1, '至少需要選擇一個正確答案').optional(),
  codeSnippet: z.string().optional(),
  codeLanguage: z.string().optional(),
  responseFormat: z.enum(['text', 'code']).optional(),
  expectedLanguage: z.string().optional(),
});

type QuestionFormData = z.infer<typeof questionSchema>;

interface Question {
  id: string;
  prompt: string;
  type: 'single' | 'multiple' | 'short_text';
  score: string;
  options: string[] | unknown;
  answerKey: string[] | unknown;
  codeSnippet?: string | null;
  codeLanguage?: string | null;
  responseFormat?: string | null;
  expectedLanguage?: string | null;
}

interface EditQuestionFormProps {
  quizId: string;
  question: Question;
  onSave: () => void;
  onCancel: () => void;
}

export function EditQuestionForm({ quizId, question, onSave, onCancel }: EditQuestionFormProps) {
  // Handle manual review questions where answerKey is an object
  const isManualReview = question.answerKey && typeof question.answerKey === 'object' && !Array.isArray(question.answerKey) && (question.answerKey as any).type === 'manual_review';
  const manualReviewData = isManualReview ? question.answerKey as any : null;

  const [options, setOptions] = useState<string[]>(Array.isArray(question.options) ? question.options : ['', '']);
  const [correctAnswers, setCorrectAnswers] = useState<string[]>(Array.isArray(question.answerKey) ? question.answerKey : []);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      prompt: question.prompt,
      type: question.type,
      score: question.score,
      options: Array.isArray(question.options) ? question.options : ['', ''],
      correctAnswers: Array.isArray(question.answerKey) ? question.answerKey : [],
      codeSnippet: question.codeSnippet || '',
      codeLanguage: question.codeLanguage || '',
      responseFormat: question.responseFormat as 'text' | 'code' || undefined,
      expectedLanguage: question.expectedLanguage || '',
    },
  });

  const questionType = watch('type');

  useEffect(() => {
    const optionsArray = Array.isArray(question.options) ? question.options : ['', ''];
    const answerArray = Array.isArray(question.answerKey) ? question.answerKey : [];
    setOptions(optionsArray);
    setCorrectAnswers(answerArray);
    setValue('options', optionsArray);
    setValue('correctAnswers', answerArray);
    setValue('codeSnippet', question.codeSnippet || '');
    setValue('codeLanguage', question.codeLanguage || '');
    setValue('responseFormat', question.responseFormat as 'text' | 'code' || undefined);
    setValue('expectedLanguage', question.expectedLanguage || '');
  }, [question, setValue, manualReviewData]);

  const addOption = () => {
    const newOptions = [...options, ''];
    setOptions(newOptions);
    setValue('options', newOptions);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;

    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
    setValue('options', newOptions);

    // Remove from correct answers if it was selected
    const removedOption = options[index];
    if (correctAnswers.includes(removedOption)) {
      const newCorrectAnswers = correctAnswers.filter(answer => answer !== removedOption);
      setCorrectAnswers(newCorrectAnswers);
      setValue('correctAnswers', newCorrectAnswers);
    }
  };

  const updateOption = (index: number, value: string) => {
    const oldValue = options[index];
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
    setValue('options', newOptions);

    // Update correct answers if this option was selected
    if (correctAnswers.includes(oldValue)) {
      const newCorrectAnswers = correctAnswers.map(answer =>
        answer === oldValue ? value : answer
      );
      setCorrectAnswers(newCorrectAnswers);
      setValue('correctAnswers', newCorrectAnswers);
    }
  };

  const handleCorrectAnswerChange = (optionValue: string, checked: boolean) => {
    if (questionType === 'single') {
      // For single choice, only allow one selection
      const newCorrectAnswers = checked ? [optionValue] : [];
      setCorrectAnswers(newCorrectAnswers);
      setValue('correctAnswers', newCorrectAnswers);
    } else {
      // For multiple choice, allow multiple selections
      const newCorrectAnswers = checked
        ? [...correctAnswers, optionValue]
        : correctAnswers.filter(answer => answer !== optionValue);
      setCorrectAnswers(newCorrectAnswers);
      setValue('correctAnswers', newCorrectAnswers);
    }
  };

  const onSubmit = async (data: QuestionFormData) => {
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/quizzes/${quizId}/questions/${question.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          score: parseFloat(data.score),
        }),
      });

      if (response.ok) {
        toast.success('題目更新成功');
        onSave();
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || '更新題目失敗');
      }
    } catch (error) {
      console.error('Error updating question:', error);
      toast.error('更新題目失敗，請稍後再試');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Question Prompt */}
      <div>
        <Label htmlFor="prompt">題目內容</Label>
        <Input
          id="prompt"
          placeholder="請輸入題目內容"
          {...register('prompt')}
        />
        {errors.prompt && (
          <p className="text-sm text-red-500 mt-1">{errors.prompt.message}</p>
        )}
      </div>

      {/* Question Type */}
      <div>
        <Label>題目類型</Label>
        <RadioGroup
          value={questionType}
          onValueChange={(value: 'single' | 'multiple' | 'short_text') => {
            setValue('type', value);
            // Reset form fields when changing type
            setCorrectAnswers([]);
            setValue('correctAnswers', []);
            if (value === 'short_text') {
              // Set default response format for short_text
              setValue('responseFormat', 'text');
            }
          }}
          className="mt-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="single" id="single" />
            <Label htmlFor="single">單選題</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="multiple" id="multiple" />
            <Label htmlFor="multiple">多選題</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="short_text" id="short_text" />
            <Label htmlFor="short_text">問答題</Label>
          </div>
        </RadioGroup>
        {errors.type && (
          <p className="text-sm text-red-500 mt-1">{errors.type.message}</p>
        )}
      </div>

      {/* Score */}
      <div>
        <Label htmlFor="score">配分</Label>
        <Input
          id="score"
          type="number"
          step="0.5"
          min="0.5"
          placeholder="請輸入分數"
          {...register('score')}
        />
        {errors.score && (
          <p className="text-sm text-red-500 mt-1">{errors.score.message}</p>
        )}
      </div>

      {/* Code Section */}
      <div>
        <Label htmlFor="codeLanguage">程式語言（選填）</Label>
        <select
          id="codeLanguage"
          {...register('codeLanguage')}
          className="w-full p-2 border border-gray-300 rounded-md mt-1"
        >
          <option value="">請選擇程式語言</option>
          <option value="javascript">JavaScript</option>
          <option value="html">HTML</option>
          <option value="css">CSS</option>
        </select>
        {errors.codeLanguage && (
          <p className="text-sm text-red-500 mt-1">{errors.codeLanguage.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="codeSnippet">程式碼（選填）</Label>
        <Textarea
          id="codeSnippet"
          placeholder="請輸入程式碼..."
          rows={6}
          className="font-mono text-sm"
          {...register('codeSnippet')}
        />
        {errors.codeSnippet && (
          <p className="text-sm text-red-500 mt-1">{errors.codeSnippet.message}</p>
        )}
      </div>

      {/* Short Text Question Fields */}
      {questionType === 'short_text' && (
        <>
          {/* Response Format */}
          <div>
            <Label>回答格式</Label>
            <RadioGroup
              value={watch('responseFormat') || 'text'}
              onValueChange={(value: 'text' | 'code') => {
                setValue('responseFormat', value);
                if (value === 'text') {
                  setValue('expectedLanguage', '');
                }
              }}
              className="mt-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="text" id="format-text" />
                <Label htmlFor="format-text">文字回答</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="code" id="format-code" />
                <Label htmlFor="format-code">程式碼回答</Label>
              </div>
            </RadioGroup>
            {errors.responseFormat && (
              <p className="text-sm text-red-500 mt-1">{errors.responseFormat.message}</p>
            )}
          </div>

          {/* Expected Language (for code responses) */}
          {watch('responseFormat') === 'code' && (
            <div>
              <Label htmlFor="expectedLanguage">預期程式語言</Label>
              <select
                id="expectedLanguage"
                {...register('expectedLanguage')}
                className="w-full p-2 border border-gray-300 rounded-md mt-1"
              >
                <option value="">請選擇預期程式語言</option>
                <option value="javascript">JavaScript</option>
                <option value="python">Python</option>
                <option value="java">Java</option>
                <option value="cpp">C++</option>
                <option value="html">HTML</option>
                <option value="css">CSS</option>
              </select>
              {errors.expectedLanguage && (
                <p className="text-sm text-red-500 mt-1">{errors.expectedLanguage.message}</p>
              )}
            </div>
          )}

        </>
      )}

      {/* Options (only for choice-based questions) */}
      {(questionType === 'single' || questionType === 'multiple') && (
      <div>
        <div className="flex justify-between items-center mb-2">
          <Label>選項</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addOption}
          >
            <Plus className="w-4 h-4 mr-1" />
            新增選項
          </Button>
        </div>

        <div className="space-y-3">
          {options.map((option, index) => (
            <Card key={index}>
              <CardContent className="p-3">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center">
                    {questionType === 'single' ? (
                      <input
                        type="radio"
                        name="correctAnswer"
                        checked={correctAnswers.includes(option)}
                        onChange={(e) => handleCorrectAnswerChange(option, e.target.checked)}
                        className="mr-2"
                      />
                    ) : (
                      <Checkbox
                        checked={correctAnswers.includes(option)}
                        onCheckedChange={(checked) =>
                          handleCorrectAnswerChange(option, checked as boolean)
                        }
                        className="mr-2"
                      />
                    )}
                    <Label className="text-sm text-gray-600">
                      {questionType === 'single' ? '正確答案' : '正確選項'}
                    </Label>
                  </div>

                  <Input
                    placeholder={`選項 ${index + 1}`}
                    value={option}
                    onChange={(e) => updateOption(index, e.target.value)}
                    className="flex-1"
                  />

                  {options.length > 2 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeOption(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {errors.options && (
          <p className="text-sm text-red-500 mt-1">{errors.options.message}</p>
        )}
        {errors.correctAnswers && (
          <p className="text-sm text-red-500 mt-1">{errors.correctAnswers.message}</p>
        )}
      </div>
      )}

      <div className="flex space-x-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '更新中...' : '更新題目'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
      </div>
    </form>
  );
}
