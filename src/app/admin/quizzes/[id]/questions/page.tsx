'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { AddQuestionForm } from '@/components/admin/AddQuestionForm';
import { EditQuestionForm } from '@/components/admin/EditQuestionForm';
import { CodeBlock } from '@/components/ui/code-block';
import { ShareQuizLink } from '@/components/admin/ShareQuizLink';
import { QuizActivationToggle } from '@/components/admin/QuizActivationToggle';
import { toast } from 'sonner';
import { Trash2, Edit } from 'lucide-react';

interface Question {
  id: string;
  prompt: string;
  type: 'single' | 'multiple';
  score: string;
  options: string[] | unknown;
  answerKey: string[] | unknown;
  orderIndex: number;
  codeSnippet?: string | null;
  codeLanguage?: string | null;
}

interface Quiz {
  id: string;
  title: string;
  isActive: boolean;
  className: string;
}

interface Props {
  params: Promise<{ id: string }>;
}

export default function QuestionsManagement({ params }: Props) {
  const [quizId, setQuizId] = useState<string>('');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadData() {
      const { id } = await params;
      setQuizId(id);

      try {
        // Load session check
        const sessionResponse = await fetch('/api/auth/admin/check');
        if (!sessionResponse.ok) {
          router.push('/login');
          return;
        }

        // Load quiz and questions
        const [quizResponse, questionsResponse] = await Promise.all([
          fetch(`/api/quizzes/${id}/quiz-info`),
          fetch(`/api/quizzes/${id}/questions`)
        ]);

        if (!quizResponse.ok || !questionsResponse.ok) {
          if (quizResponse.status === 404) {
            router.push('/admin/quizzes');
          } else {
            toast.error('載入資料失敗');
          }
          return;
        }

        const quizData = await quizResponse.json();
        const questionsData = await questionsResponse.json();

        setQuiz(quizData.quiz);
        setQuestions(questionsData.questions || []);
      } catch (error) {
        console.error('Error loading data:', error);
        toast.error('載入資料失敗');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [params, router]);

  const handleEditQuestion = (question: Question) => {
    // Ensure options and answerKey are arrays
    const processedQuestion = {
      ...question,
      options: Array.isArray(question.options) ? question.options : [],
      answerKey: Array.isArray(question.answerKey) ? question.answerKey : [],
    };
    setEditingQuestion(processedQuestion);
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('確定要刪除這個題目嗎？')) {
      return;
    }

    try {
      const response = await fetch(`/api/quizzes/${quizId}/questions/${questionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast.success('題目刪除成功');
        // Refresh questions list
        const questionsResponse = await fetch(`/api/quizzes/${quizId}/questions`);
        if (questionsResponse.ok) {
          const questionsData = await questionsResponse.json();
          setQuestions(questionsData.questions || []);
        }
      } else {
        const errorData = await response.json();
        toast.error(errorData.message || '刪除題目失敗');
      }
    } catch (error) {
      console.error('Error deleting question:', error);
      toast.error('刪除題目失敗，請稍後再試');
    }
  };

  const handleQuestionSaved = async () => {
    setEditingQuestion(null);
    // Refresh questions list
    try {
      const questionsResponse = await fetch(`/api/quizzes/${quizId}/questions`);
      if (questionsResponse.ok) {
        const questionsData = await questionsResponse.json();
        setQuestions(questionsData.questions || []);
      }
    } catch (error) {
      console.error('Error refreshing questions:', error);
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) {
        router.push('/login');
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">載入中...</p>
        </div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">測驗不存在或您沒有權限訪問</p>
          <Link href="/admin/quizzes">
            <Button className="mt-4">返回測驗列表</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">題目管理</h1>
              <p className="text-gray-600">
                測驗：{quiz.title} (班級：{quiz.className})
              </p>
            </div>
            <div className="flex space-x-4">
              {quiz && (
                <>
                  <ShareQuizLink
                    quizId={quizId}
                    quizTitle={quiz.title}
                    variant="default"
                    isActive={quiz.isActive}
                  />
                  <QuizActivationToggle
                    quizId={quizId}
                    isActive={quiz.isActive}
                    size="default"
                    onChange={(isActive) => setQuiz({ ...quiz, isActive })}
                  />
                </>
              )}
              <Link href="/admin/quizzes">
                <Button variant="outline">返回測驗列表</Button>
              </Link>
              <Button variant="outline" onClick={handleLogout}>
                登出
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <Card>
              <CardHeader>
                <CardTitle>
                  {editingQuestion ? '編輯題目' : '新增題目'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {editingQuestion ? (
                  <EditQuestionForm
                    quizId={quizId}
                    question={editingQuestion}
                    onSave={handleQuestionSaved}
                    onCancel={() => setEditingQuestion(null)}
                  />
                ) : (
                  <AddQuestionForm
                    quizId={quizId}
                    nextOrderIndex={questions.length + 1}
                    onQuestionAdded={handleQuestionSaved}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle>現有題目 ({questions.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {questions.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">尚未建立任何題目</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {questions.map((question, index) => (
                      <div key={question.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium text-gray-900">
                            第 {index + 1} 題
                          </h4>
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditQuestion(question)}
                            >
                              <Edit className="w-4 h-4 mr-1" />
                              編輯
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteQuestion(question.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              刪除
                            </Button>
                          </div>
                        </div>
                        <p className="text-gray-700 mb-2 whitespace-pre-wrap">{question.prompt}</p>
                        {question.codeSnippet && (
                          <div className="mb-3">
                            <CodeBlock
                              code={question.codeSnippet}
                              language={question.codeLanguage || 'text'}
                              className="text-sm"
                            />
                          </div>
                        )}
                        <div className="text-sm text-gray-500">
                          <span className="inline-flex px-2 py-1 bg-blue-100 text-blue-800 rounded-full mr-2">
                            {question.type === 'single' ? '單選題' :
                             question.type === 'multiple' ? '多選題' :
                             question.type === 'short_text' ? '簡答題' :
                             question.type}
                          </span>
                          <span>配分：{question.score}</span>
                        </div>
                        {question.options && Array.isArray(question.options) ? (
                          <div className="mt-2">
                            <div className="text-sm text-gray-600">選項：</div>
                            <ul className="text-sm text-gray-700 ml-4">
                              {question.options.map((option: string, optIndex: number) => {
                                const answerArray = Array.isArray(question.answerKey) ? question.answerKey : [];
                                const isCorrect = answerArray.includes(option);
                                return (
                                  <li key={optIndex} className={`list-disc ${isCorrect ? 'font-medium text-green-700' : ''}`}>
                                    {option} {isCorrect && '✓'}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
