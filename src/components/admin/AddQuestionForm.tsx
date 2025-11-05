'use client';

import { useState } from 'react';
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
  type: z.enum(['single', 'multiple'], {
    message: '請選擇題目類型',
  }),
  score: z.string().min(1, '請輸入分數').refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  }, '分數必須大於 0'),
  options: z.array(z.string().min(1, '選項不可為空')).min(2, '至少需要 2 個選項'),
  correctAnswers: z.array(z.string()).min(1, '至少需要選擇一個正確答案'),
  codeSnippet: z.string().optional(),
  codeLanguage: z.string().optional(),
});

type QuestionFormData = z.infer<typeof questionSchema>;

interface AddQuestionFormProps {
  quizId: string;
  nextOrderIndex: number;
  onQuestionAdded?: () => void;
}

export function AddQuestionForm({ quizId, nextOrderIndex, onQuestionAdded }: AddQuestionFormProps) {
  const [options, setOptions] = useState<string[]>(['', '']);
  const [correctAnswers, setCorrectAnswers] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      type: 'single',
      options: ['', ''],
      correctAnswers: [],
    },
  });

  const questionType = watch('type');

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
      const response = await fetch(`/api/quizzes/${quizId}/questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          score: parseFloat(data.score),
          orderIndex: nextOrderIndex,
        }),
      });

      if (response.ok) {
        toast.success('題目新增成功');
        // Reset form
        reset();
        setOptions(['', '']);
        setCorrectAnswers([]);
        // Call callback to refresh question list
        if (onQuestionAdded) {
          onQuestionAdded();
        }
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || '新增題目失敗');
      }
    } catch (error) {
      console.error('Error creating question:', error);
      toast.error('新增題目失敗，請稍後再試');
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
          onValueChange={(value: 'single' | 'multiple') => {
            setValue('type', value);
            // Reset correct answers when changing type
            setCorrectAnswers([]);
            setValue('correctAnswers', []);
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
          <option value="python">Python</option>
          <option value="java">Java</option>
          <option value="cpp">C++</option>
          <option value="html">HTML</option>
          <option value="css">CSS</option>
          <option value="sql">SQL</option>
          <option value="typescript">TypeScript</option>
          <option value="php">PHP</option>
          <option value="ruby">Ruby</option>
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

      {/* Options */}
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

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? '新增中...' : '新增題目'}
      </Button>
    </form>
  );
}