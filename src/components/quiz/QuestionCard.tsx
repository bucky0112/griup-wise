'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CodeBlock } from '@/components/ui/code-block';
import { CodeEditor } from '@/components/ui/code-editor';
import { Question } from './QuizInterface';

interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  value: unknown;
  onChange: (value: unknown) => void;
}

export default function QuestionCard({
  question,
  questionNumber,
  value,
  onChange
}: QuestionCardProps) {
  const handleSingleChoice = (selectedValue: string) => {
    onChange(selectedValue);
  };

  const handleMultipleChoice = (optionValue: string, checked: boolean) => {
    const currentAnswers = Array.isArray(value) ? value : [];
    if (checked) {
      onChange([...currentAnswers, optionValue]);
    } else {
      onChange(currentAnswers.filter(answer => answer !== optionValue));
    }
  };

  const handleBooleanChoice = (selectedValue: string) => {
    onChange(selectedValue === 'true');
  };

  const handleTextInput = (inputValue: string) => {
    onChange(inputValue);
  };

  const handleShortTextInput = (inputValue: string) => {
    // Create structured response for short_text questions
    const response = {
      type: question.responseFormat === 'code' ? 'code_response' : 'text_response',
      content: inputValue,
      ...(question.responseFormat === 'code' && question.expectedLanguage && {
        language: question.expectedLanguage
      })
    };
    onChange(response);
  };

  const handleNumericInput = (inputValue: string) => {
    // Allow empty string or valid numbers (including decimals)
    if (inputValue === '' || /^-?\d*\.?\d*$/.test(inputValue)) {
      onChange(inputValue);
    }
  };

  const renderQuestionInput = () => {
    switch (question.type) {
      case 'single':
        return (
          <RadioGroup
            value={typeof value === 'string' ? value : ''}
            onValueChange={handleSingleChoice}
            className="space-y-3"
          >
            {question.options?.map((option, index) => (
              <div key={index} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`${question.id}-${index}`} />
                <Label
                  htmlFor={`${question.id}-${index}`}
                  className="flex-1 cursor-pointer"
                >
                  {option}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );

      case 'multiple':
        const selectedAnswers = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-3">
            {question.options?.map((option, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Checkbox
                  id={`${question.id}-${index}`}
                  checked={selectedAnswers.includes(option)}
                  onCheckedChange={(checked) =>
                    handleMultipleChoice(option, checked === true)
                  }
                />
                <Label
                  htmlFor={`${question.id}-${index}`}
                  className="flex-1 cursor-pointer"
                >
                  {option}
                </Label>
              </div>
            ))}
          </div>
        );

      case 'boolean':
        return (
          <RadioGroup
            value={typeof value === 'boolean' ? value.toString() : ''}
            onValueChange={handleBooleanChoice}
            className="space-y-3"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="true" id={`${question.id}-true`} />
              <Label htmlFor={`${question.id}-true`} className="cursor-pointer">
                是 / True
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="false" id={`${question.id}-false`} />
              <Label htmlFor={`${question.id}-false`} className="cursor-pointer">
                否 / False
              </Label>
            </div>
          </RadioGroup>
        );

      case 'short_text':
        // Extract current content from structured response
        const currentContent = (value && typeof value === 'object' && (value as any).content)
          ? (value as any).content
          : (typeof value === 'string' ? value : '');

        if (question.responseFormat === 'code') {
          return (
            <CodeEditor
              value={currentContent}
              onChange={handleShortTextInput}
              placeholder="請輸入您的程式碼..."
              language={question.expectedLanguage}
              rows={8}
              className="w-full"
            />
          );
        } else {
          return (
            <Textarea
              value={currentContent}
              onChange={(e) => handleShortTextInput(e.target.value)}
              placeholder="請輸入您的答案..."
              rows={4}
              className="w-full"
            />
          );
        }

      case 'numeric':
        return (
          <Input
            type="text"
            value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
            onChange={(e) => handleNumericInput(e.target.value)}
            placeholder="請輸入數字..."
            className="w-full max-w-xs"
          />
        );

      default:
        return (
          <div className="text-red-500 text-sm">
            不支援的題型：{question.type}
          </div>
        );
    }
  };

  const getQuestionTypeLabel = () => {
    switch (question.type) {
      case 'single': return '單選題';
      case 'multiple': return '多選題';
      case 'boolean': return '是非題';
      case 'short_text':
        return question.responseFormat === 'code' ? '程式碼題' : '問答題';
      case 'numeric': return '數值題';
      default: return '未知題型';
    }
  };

  const isAnswered = () => {
    if (question.type === 'boolean') {
      return value !== undefined && value !== null && value !== '';
    }
    if (question.type === 'multiple') {
      return Array.isArray(value) && value.length > 0;
    }
    if (question.type === 'short_text') {
      // Handle structured responses
      if (value && typeof value === 'object' && (value as any).content) {
        return (value as any).content.trim() !== '';
      }
      return typeof value === 'string' && value.trim() !== '';
    }
    return value !== undefined && value !== null && value !== '';
  };

  return (
    <Card
      id={`question-${question.id}`}
      className={`transition-colors ${isAnswered() ? 'border-green-200 bg-green-50/30' : ''}`}
    >
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between text-base">
          <span>
            第 {questionNumber} 題
            <span className="ml-2 text-sm font-normal text-gray-600">
              ({getQuestionTypeLabel()}, {question.score} 分)
            </span>
          </span>
          {isAnswered() && (
            <span className="text-green-600 text-sm font-normal">✓ 已作答</span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Question prompt */}
        <div className="prose prose-sm max-w-none">
          <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
            {question.prompt}
          </p>
        </div>

        {/* Code snippet if present */}
        {question.codeSnippet && (
          <div className="border rounded-lg overflow-hidden">
            <CodeBlock
              code={question.codeSnippet}
              language={question.codeLanguage || 'text'}
            />
          </div>
        )}

        {/* Question input */}
        <div className="pt-2">
          {renderQuestionInput()}
        </div>
      </CardContent>
    </Card>
  );
}