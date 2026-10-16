'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CodeBlock } from '@/components/ui/code-block';
import { toast } from 'sonner';
import { Clock, User, FileText, Code, CheckCircle } from 'lucide-react';

interface PendingQuestion {
  questionId: string;
  prompt: string;
  responseFormat?: string;
  expectedLanguage?: string;
  maxScore: number;
  answer: {
    id: string;
    // Plain text, or a structured short-text response saved by the student quiz page
    response: string | { type?: string; content: string; language?: string } | null;
  };
}

interface PendingSubmission {
  id: string;
  quizId: string;
  quizTitle: string;
  participant: {
    id: string;
    displayName: string;
    studentNo: string;
  };
  submittedAt: string;
  pendingQuestions: PendingQuestion[];
}

interface ReviewFormData {
  [answerId: string]: {
    score: string;
    feedback: string;
  };
}

export function ReviewSubmissions() {
  const [submissions, setSubmissions] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<ReviewFormData>({});
  const [expandedSubmissions, setExpandedSubmissions] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchPendingReviews();
  }, []);

  const fetchPendingReviews = async () => {
    try {
      const response = await fetch('/api/admin/reviews/pending');
      if (response.ok) {
        const data = await response.json();
        setSubmissions(data.submissions);
      } else {
        toast.error('載入待審核項目失敗');
      }
    } catch (error) {
      console.error('Error fetching pending reviews:', error);
      toast.error('載入失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleReviewChange = (answerId: string, field: 'score' | 'feedback', value: string) => {
    setReviewData(prev => ({
      ...prev,
      [answerId]: {
        ...prev[answerId],
        [field]: value,
      },
    }));
  };

  const initializeReviewData = (question: PendingQuestion) => {
    const answerId = question.answer.id;
    if (!reviewData[answerId]) {
      setReviewData(prev => ({
        ...prev,
        [answerId]: {
          score: '',
          feedback: '',
        },
      }));
    }
  };

  const submitReview = async (answerId: string, question: PendingQuestion) => {
    const review = reviewData[answerId];
    if (!review || !review.score.trim()) {
      toast.error('請輸入分數');
      return;
    }

    const score = parseFloat(review.score);
    if (isNaN(score) || score < 0 || score > question.maxScore) {
      toast.error(`分數必須在 0 到 ${question.maxScore} 之間`);
      return;
    }

    setReviewing(answerId);
    try {
      const response = await fetch(`/api/admin/reviews/answer/${answerId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          score,
          feedback: review.feedback.trim() || undefined,
        }),
      });

      if (response.ok) {
        toast.success('審核完成');
        // Remove the reviewed question from the list
        setSubmissions(prev =>
          prev.map(submission => ({
            ...submission,
            pendingQuestions: submission.pendingQuestions.filter(q => q.answer.id !== answerId)
          })).filter(submission => submission.pendingQuestions.length > 0)
        );
        // Clear review data for this answer
        setReviewData(prev => {
          const newData = { ...prev };
          delete newData[answerId];
          return newData;
        });
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || '審核失敗');
      }
    } catch (error) {
      console.error('Error submitting review:', error);
      toast.error('審核失敗，請稍後再試');
    } finally {
      setReviewing(null);
    }
  };

  const submitBatchReview = async (submissionId: string) => {
    const submission = submissions.find(s => s.id === submissionId);
    if (!submission) return;

    const reviews = [];
    for (const question of submission.pendingQuestions) {
      const review = reviewData[question.answer.id];
      if (!review || !review.score.trim()) {
        toast.error(`請為所有題目輸入分數`);
        return;
      }

      const score = parseFloat(review.score);
      if (isNaN(score) || score < 0 || score > question.maxScore) {
        toast.error(`所有分數必須在有效範圍內`);
        return;
      }

      reviews.push({
        answerId: question.answer.id,
        score,
        feedback: review.feedback.trim() || undefined,
      });
    }

    setReviewing(submissionId);
    try {
      const response = await fetch('/api/admin/reviews/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reviews }),
      });

      if (response.ok) {
        toast.success('批次審核完成');
        // Remove the reviewed submission
        setSubmissions(prev => prev.filter(s => s.id !== submissionId));
        // Clear review data for this submission
        setReviewData(prev => {
          const newData = { ...prev };
          for (const question of submission.pendingQuestions) {
            delete newData[question.answer.id];
          }
          return newData;
        });
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || '批次審核失敗');
      }
    } catch (error) {
      console.error('Error submitting batch review:', error);
      toast.error('批次審核失敗，請稍後再試');
    } finally {
      setReviewing(null);
    }
  };

  const toggleSubmissionExpanded = (submissionId: string) => {
    setExpandedSubmissions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(submissionId)) {
        newSet.delete(submissionId);
      } else {
        newSet.add(submissionId);
      }
      return newSet;
    });
  };

  const renderStudentResponse = (question: PendingQuestion) => {
    const response = question.answer.response;

    // Handle structured responses
    if (response && typeof response === 'object') {
      if (response.type === 'code_response') {
        return (
          <div>
            <Label className="text-sm text-gray-600 mb-2 block">學生程式碼回答</Label>
            <CodeBlock
              code={response.content}
              language={response.language || question.expectedLanguage || 'text'}
            />
          </div>
        );
      } else if (response.type === 'text_response') {
        return (
          <div>
            <Label className="text-sm text-gray-600 mb-2 block">學生文字回答</Label>
            <div className="bg-gray-50 p-3 rounded border">
              <p className="whitespace-pre-wrap">{response.content}</p>
            </div>
          </div>
        );
      }
    }

    // Handle simple string responses (legacy)
    if (typeof response === 'string') {
      if (question.responseFormat === 'code') {
        return (
          <div>
            <Label className="text-sm text-gray-600 mb-2 block">學生程式碼回答</Label>
            <CodeBlock
              code={response}
              language={question.expectedLanguage || 'text'}
            />
          </div>
        );
      } else {
        return (
          <div>
            <Label className="text-sm text-gray-600 mb-2 block">學生文字回答</Label>
            <div className="bg-gray-50 p-3 rounded border">
              <p className="whitespace-pre-wrap">{response}</p>
            </div>
          </div>
        );
      }
    }

    return (
      <div className="text-gray-500 italic">
        無法顯示回答內容
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <Clock className="w-8 h-8 animate-spin mx-auto mb-2" />
          <p>載入待審核項目中...</p>
        </div>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="text-center p-8">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium mb-2">沒有待審核的項目</h3>
        <p className="text-gray-600">所有提交的問答題都已完成審核</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">待審核提交</h2>
        <Badge variant="secondary">
          {submissions.length} 個提交，
          {submissions.reduce((total, s) => total + s.pendingQuestions.length, 0)} 個題目
        </Badge>
      </div>

      {submissions.map((submission) => {
        const isExpanded = expandedSubmissions.has(submission.id);
        const isReviewing = reviewing === submission.id;

        return (
          <Card key={submission.id} className="overflow-hidden">
            <CardHeader className="bg-blue-50">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">
                    {submission.quizTitle}
                  </CardTitle>
                  <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {submission.participant.displayName} ({submission.participant.studentNo})
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {new Date(submission.submittedAt).toLocaleString('zh-TW')}
                    </div>
                    <Badge variant="outline">
                      {submission.pendingQuestions.length} 個待審核題目
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleSubmissionExpanded(submission.id)}
                  >
                    {isExpanded ? '收起' : '展開審核'}
                  </Button>
                </div>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="space-y-6 pt-6">
                {submission.pendingQuestions.map((question, index) => {
                  initializeReviewData(question);
                  const answerId = question.answer.id;
                  const review = reviewData[answerId] || { score: '', feedback: '' };
                  const isReviewingThis = reviewing === answerId;

                  return (
                    <div key={question.questionId} className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">題目 {index + 1}</h4>
                        <div className="flex items-center gap-2">
                          <Badge variant={question.responseFormat === 'code' ? 'default' : 'secondary'}>
                            {question.responseFormat === 'code' ? (
                              <>
                                <Code className="w-3 h-3 mr-1" />
                                程式碼題
                              </>
                            ) : (
                              <>
                                <FileText className="w-3 h-3 mr-1" />
                                問答題
                              </>
                            )}
                          </Badge>
                          <span className="text-sm text-gray-600">
                            配分：{question.maxScore} 分
                          </span>
                        </div>
                      </div>

                      {/* Question prompt */}
                      <div>
                        <Label className="text-sm text-gray-600 mb-1 block">題目內容</Label>
                        <div className="bg-gray-50 p-3 rounded border">
                          <p className="whitespace-pre-wrap">{question.prompt}</p>
                        </div>
                      </div>

                      {/* Student response */}
                      {renderStudentResponse(question)}



                      {/* Review form */}
                      <div className="bg-blue-50 p-4 rounded border-l-4 border-blue-400">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor={`score-${answerId}`}>分數 (0-{question.maxScore})</Label>
                            <Input
                              id={`score-${answerId}`}
                              type="number"
                              min="0"
                              max={question.maxScore}
                              step="0.5"
                              value={review.score}
                              onChange={(e) => handleReviewChange(answerId, 'score', e.target.value)}
                              placeholder="輸入分數"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`feedback-${answerId}`}>回饋 (選填)</Label>
                            <Textarea
                              id={`feedback-${answerId}`}
                              value={review.feedback}
                              onChange={(e) => handleReviewChange(answerId, 'feedback', e.target.value)}
                              placeholder="給學生的回饋..."
                              rows={2}
                            />
                          </div>
                        </div>
                        <div className="mt-4">
                          <Button
                            onClick={() => submitReview(answerId, question)}
                            disabled={isReviewingThis || !review.score.trim()}
                            size="sm"
                          >
                            {isReviewingThis ? '審核中...' : '提交審核'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex justify-end pt-4 border-t">
                  <Button
                    onClick={() => submitBatchReview(submission.id)}
                    disabled={isReviewing || submission.pendingQuestions.some(q => !reviewData[q.answer.id]?.score.trim())}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isReviewing ? '批次審核中...' : '批次審核所有題目'}
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}