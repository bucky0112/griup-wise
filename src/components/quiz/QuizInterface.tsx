'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import QuestionCard from './QuestionCard';

export interface Question {
  id: string;
  type: 'single' | 'multiple' | 'boolean' | 'short_text' | 'numeric';
  prompt: string;
  codeSnippet?: string;
  codeLanguage?: string;
  options?: string[];
  score: string;
  orderIndex: number;
}

export interface Quiz {
  id: string;
  title: string;
  totalQuestions: number;
  totalScore: number;
}

export interface Participant {
  id: string;
  displayName: string;
  studentNo: string;
}

interface QuizInterfaceProps {
  quiz: Quiz;
  questions: Question[];
  participant: Participant;
  onSubmitSuccess: (submissionData: { submittedAt: string; submissionId: string; totalQuestions: number }) => void;
}

export default function QuizInterface({
  quiz,
  questions,
  participant,
  onSubmitSuccess
}: QuizInterfaceProps) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Calculate progress (considering question types)
  const answeredQuestions = questions.filter(question => {
    const answer = answers[question.id];

    // For boolean questions, false is a valid answer
    if (question.type === 'boolean') {
      return answer !== undefined && answer !== null;
    }

    // For numeric questions, 0 is a valid answer
    if (question.type === 'numeric') {
      return answer !== undefined && answer !== null && answer !== '';
    }

    // For multiple choice, non-empty array means answered
    if (question.type === 'multiple') {
      return Array.isArray(answer) && answer.length > 0;
    }

    // For single choice and text, non-empty string means answered
    return answer !== undefined && answer !== null && answer !== '';
  });
  const progressPercentage = (answeredQuestions.length / questions.length) * 100;

  // Generate secure localStorage key based on quiz and participant
  const getBackupKey = useCallback(() => {
    return `quiz-answers-${quiz.id}-${participant.id}`;
  }, [quiz.id, participant.id]);

  // Handle answer changes
  const handleAnswerChange = useCallback((questionId: string, answer: unknown) => {
    const newAnswers = {
      ...answers,
      [questionId]: answer
    };

    setAnswers(newAnswers);
    setHasChanges(true);

    // Save to localStorage as backup with namespaced key
    try {
      localStorage.setItem(getBackupKey(), JSON.stringify({
        quizId: quiz.id,
        participantId: participant.id,
        timestamp: Date.now(),
        answers: newAnswers
      }));
    } catch (error) {
      console.warn('Failed to save backup to localStorage:', error);
    }
  }, [answers, quiz.id, participant.id, getBackupKey]);

  // Load answers from localStorage on mount (recovery mechanism)
  useEffect(() => {
    try {
      const backupKey = getBackupKey();
      const savedData = localStorage.getItem(backupKey);

      if (savedData) {
        const parsedData = JSON.parse(savedData);

        // Validate that the backup belongs to current quiz/participant
        if (parsedData.quizId === quiz.id && parsedData.participantId === participant.id) {
          // Check if backup is not too old (e.g., 24 hours)
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
          const isRecent = Date.now() - parsedData.timestamp < maxAge;

          if (isRecent && parsedData.answers) {
            setAnswers(parsedData.answers);
            setHasChanges(Object.keys(parsedData.answers).length > 0);
            console.log('Recovered answers from backup');
          } else {
            // Remove old backup
            localStorage.removeItem(backupKey);
          }
        } else {
          // Remove invalid backup (different quiz/participant)
          localStorage.removeItem(backupKey);
        }
      }
    } catch (error) {
      console.error('Failed to load saved answers:', error);
      // Clean up corrupted data
      try {
        localStorage.removeItem(getBackupKey());
      } catch (cleanupError) {
        console.error('Failed to clean up corrupted localStorage data:', cleanupError);
      }
    }
  }, [quiz.id, participant.id, getBackupKey]);

  // Warn user before leaving if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges && !isSubmitting) {
        e.preventDefault();
        e.returnValue = '您有未提交的答案，確定要離開嗎？';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges, isSubmitting]);

  // Validate all questions are answered
  const validateAnswers = (): boolean => {
    const missingAnswers = questions.filter(question => {
      const answer = answers[question.id];

      // For boolean questions, false is a valid answer
      if (question.type === 'boolean') {
        return answer === undefined || answer === null;
      }

      // For numeric questions, 0 is a valid answer
      if (question.type === 'numeric') {
        return answer === undefined || answer === null || answer === '';
      }

      // For multiple choice, empty array means no selection
      if (question.type === 'multiple') {
        return !Array.isArray(answer) || answer.length === 0;
      }

      // For single choice and text, empty string/null/undefined means no answer
      return answer === undefined || answer === null || answer === '';
    });

    if (missingAnswers.length > 0) {
      toast.error(`請完成所有題目後再提交，還有 ${missingAnswers.length} 題未作答`);

      // Scroll to first unanswered question
      const firstMissingId = missingAnswers[0].id;
      const element = document.getElementById(`question-${firstMissingId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      return false;
    }

    return true;
  };

  // Handle submission
  const handleSubmit = async () => {
    if (!validateAnswers()) return;

    const confirmed = window.confirm(
      `確定要提交測驗答案嗎？\n\n` +
      `已完成題目：${answeredQuestions.length}/${questions.length}\n` +
      `注意：提交後將無法修改答案。`
    );

    if (!confirmed) return;

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/assignments/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ answers }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '提交失敗');
      }

      // Clear backup data after successful submission
      try {
        localStorage.removeItem(getBackupKey());
      } catch (error) {
        console.warn('Failed to clear backup data:', error);
      }
      setHasChanges(false);

      toast.success('答案提交成功！');
      onSubmitSuccess(data);

    } catch (error) {
      console.error('Submission error:', error);
      toast.error(error instanceof Error ? error.message : '提交失敗，請稍後再試');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Quiz Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{quiz.title}</span>
            <span className="text-sm font-normal text-gray-600">
              {participant.displayName} ({participant.studentNo})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between text-sm text-gray-600">
              <span>答題進度：{answeredQuestions.length}/{questions.length}</span>
              <span>總配分：{quiz.totalScore} 分</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            questionNumber={index + 1}
            value={answers[question.id]}
            onChange={(answer) => handleAnswerChange(question.id, answer)}
          />
        ))}
      </div>

      {/* Submit Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="text-center">
              <p className="text-lg font-medium mb-2">
                已完成 {answeredQuestions.length}/{questions.length} 題
              </p>
              <p className="text-sm text-gray-600">
                請檢查您的答案，確認後點擊提交按鈕
              </p>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || answeredQuestions.length === 0}
              className="w-full max-w-md"
              size="lg"
            >
              {isSubmitting ? '提交中...' : '提交答案'}
            </Button>

            <p className="text-xs text-gray-500 text-center max-w-md">
              注意：答案提交後將無法修改，請確認所有題目都已正確作答
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}