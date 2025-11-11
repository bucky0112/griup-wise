'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRouter } from 'next/navigation';

interface AnswerScoringFormProps {
  answerId: string;
  questionId: string;
  maxScore: number;
  currentScore: number;
  currentFeedback?: string;
  reviewStatus: string;
}

export function AnswerScoringForm({
  answerId,
  questionId,
  maxScore,
  currentScore,
  currentFeedback,
  reviewStatus,
}: AnswerScoringFormProps) {
  const [score, setScore] = useState(currentScore.toString());
  const [feedback, setFeedback] = useState(currentFeedback || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/admin/reviews/answer/${answerId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          score: parseFloat(score),
          feedback: feedback.trim() || undefined,
        }),
      });

      if (response.ok) {
        // Refresh the page to show updated data
        router.refresh();
      } else {
        const error = await response.json();
        alert(error.message || '評分失敗，請稍後再試');
      }
    } catch (error) {
      console.error('Scoring error:', error);
      alert('評分失敗，請稍後再試');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <h5 className="font-medium text-gray-700 mb-3">評分</h5>
      <div className="space-y-3">
        <div className="text-sm text-gray-600">
          目前分數：{currentScore} / {maxScore}
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor={`score-${questionId}`} className="block text-sm font-medium text-gray-700 mb-1">
                分數 (滿分 {maxScore})
              </label>
              <Input
                id={`score-${questionId}`}
                type="number"
                min="0"
                max={maxScore}
                step="0.1"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="w-full"
                required
              />
            </div>
            <div>
              <label htmlFor={`feedback-${questionId}`} className="block text-sm font-medium text-gray-700 mb-1">
                評語 (可選)
              </label>
              <Textarea
                id={`feedback-${questionId}`}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="請提供評分說明或建議..."
                className="w-full"
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting
                ? '評分中...'
                : reviewStatus === 'reviewed'
                ? '更新評分'
                : '評分'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}