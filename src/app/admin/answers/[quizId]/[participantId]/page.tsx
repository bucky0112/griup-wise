import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CodeBlock } from '@/components/ui/code-block';
import Link from 'next/link';
import { CheckCircle, XCircle, ArrowLeft } from 'lucide-react';

interface PageProps {
  params: Promise<{ quizId: string; participantId: string }>;
}

interface DetailedAnswer {
  question_number: number;
  question: {
    id: string;
    type: string;
    prompt: string;
    code_snippet?: string | null;
    code_language?: string | null;
    options?: string[] | null;
    correct_answer: string[] | string | null;
    max_score: number;
  };
  student_answer: {
    response: string[] | string | number | null;
    earned_score: number;
  };
}

interface StudentAnswersData {
  quiz: {
    id: string;
    title: string;
  };
  participant: {
    id: string;
    display_name: string;
    student_no: string;
  };
  submission: {
    id: string;
    total_score: number;
    submitted_at: string;
  };
  detailed_answers: DetailedAnswer[];
}

async function fetchStudentAnswers(quizId: string, participantId: string): Promise<StudentAnswersData> {
  const { cookies } = await import('next/headers');

  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/admin/answers/${quizId}/${participantId}`,
    {
      cache: 'no-store',
      headers: {
        'Cookie': (await cookies()).toString(),
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch student answers');
  }

  return response.json();
}

function formatStudentResponse(response: string[] | string | number | null, questionType: string): string {
  if (response === null) return '未作答';

  if (questionType === 'multiple' && Array.isArray(response)) {
    return response.length > 0 ? response.join(', ') : '未選擇';
  }

  if (questionType === 'single' && Array.isArray(response)) {
    return response.length > 0 ? response[0] : '未選擇';
  }

  return String(response);
}

function formatCorrectAnswer(answerKey: string[] | string | null): string {
  if (answerKey === null) return '無正確答案';

  if (Array.isArray(answerKey)) {
    return answerKey.join(', ');
  }

  return String(answerKey);
}

function isAnswerCorrect(studentResponse: string[] | string | number | null, correctAnswer: string[] | string | null, questionType: string): boolean {
  if (studentResponse === null || correctAnswer === null) return false;

  if (questionType === 'multiple') {
    const studentArray = Array.isArray(studentResponse) ? studentResponse : [studentResponse];
    const correctArray = Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer];

    return studentArray.length === correctArray.length &&
           studentArray.every(answer => correctArray.includes(String(answer))) &&
           correctArray.every(answer => studentArray.includes(answer));
  }

  if (questionType === 'single') {
    const studentAnswer = Array.isArray(studentResponse) ? studentResponse[0] : studentResponse;
    const correctAnswerValue = Array.isArray(correctAnswer) ? correctAnswer[0] : correctAnswer;
    return String(studentAnswer) === String(correctAnswerValue);
  }

  return String(studentResponse) === String(correctAnswer);
}

function getQuestionTypeLabel(type: string): string {
  switch (type) {
    case 'single': return '單選題';
    case 'multiple': return '多選題';
    case 'boolean': return '是非題';
    case 'short_text': return '簡答題';
    case 'numeric': return '數值題';
    default: return type;
  }
}

export default async function StudentAnswerDetailsPage({ params }: PageProps) {
  const session = await getSession();

  if (!session || session.type !== 'admin') {
    redirect('/login');
  }

  const { quizId, participantId } = await params;

  let data: StudentAnswersData;
  let errorMessage: string | null = null;

  try {
    data = await fetchStudentAnswers(quizId, participantId);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('未提交')) {
      return (
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
            <Card>
              <CardContent className="text-center py-8">
                <p className="text-yellow-600 mb-4">此學生尚未提交作答</p>
                <Link href={`/admin/scores/${quizId}`}>
                  <Button variant="outline">返回分數管理</Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-red-600 mb-4">{errorMessage}</p>
              <Link href={`/admin/scores/${quizId}`}>
                <Button variant="outline">返回分數管理</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const totalQuestions = data.detailed_answers.length;
  const totalMaxScore = data.detailed_answers.reduce((sum, answer) => sum + answer.question.max_score, 0);
  const correctAnswers = data.detailed_answers.filter(answer =>
    isAnswerCorrect(answer.student_answer.response, answer.question.correct_answer, answer.question.type)
  ).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">學生作答詳情</h1>
              <p className="text-gray-600">{data.quiz.title}</p>
            </div>
            <div className="flex space-x-4">
              <Link href={`/admin/scores/${quizId}`}>
                <Button variant="outline">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  返回分數管理
                </Button>
              </Link>
              <Link href="/admin">
                <Button variant="outline">返回後台</Button>
              </Link>
              <form action="/api/auth/logout" method="POST">
                <Button variant="outline" type="submit">
                  登出
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Student Summary */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle>學生資訊</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">學號</p>
                  <p className="font-medium">{data.participant.student_no}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">姓名</p>
                  <p className="font-medium">{data.participant.display_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">總分</p>
                  <p className="font-medium text-lg">
                    {data.submission.total_score} / {totalMaxScore}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">正確率</p>
                  <p className="font-medium text-lg">
                    {totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0}%
                    <span className="text-sm text-gray-500 ml-1">
                      ({correctAnswers}/{totalQuestions})
                    </span>
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-gray-600">交卷時間</p>
                <p className="text-sm">
                  {new Date(data.submission.submitted_at).toLocaleString('zh-TW')}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detailed Answers */}
        <div className="space-y-6">
          {data.detailed_answers.map((answer) => {
            const isCorrect = isAnswerCorrect(
              answer.student_answer.response,
              answer.question.correct_answer,
              answer.question.type
            );

            return (
              <Card key={answer.question.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <CardTitle className="text-lg">
                          第 {answer.question_number} 題
                        </CardTitle>
                        <Badge variant="outline">
                          {getQuestionTypeLabel(answer.question.type)}
                        </Badge>
                        <Badge variant={isCorrect ? "default" : "destructive"}>
                          {isCorrect ? (
                            <CheckCircle className="w-3 h-3 mr-1" />
                          ) : (
                            <XCircle className="w-3 h-3 mr-1" />
                          )}
                          {isCorrect ? '正確' : '錯誤'}
                        </Badge>
                      </div>
                      <p className="text-gray-700">{answer.question.prompt}</p>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-lg font-medium">
                        {answer.student_answer.earned_score} / {answer.question.max_score}
                      </div>
                      <div className="text-sm text-gray-500">分數</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Code Snippet */}
                  {answer.question.code_snippet && (
                    <div className="mb-4">
                      <CodeBlock
                        code={answer.question.code_snippet}
                        language={answer.question.code_language || 'text'}
                        className="text-sm"
                      />
                    </div>
                  )}

                  {/* Options for choice questions */}
                  {answer.question.options && Array.isArray(answer.question.options) && (
                    <div className="mb-4">
                      <h4 className="font-medium text-gray-700 mb-2">選項：</h4>
                      <ul className="space-y-1">
                        {answer.question.options.map((option: string, index: number) => {
                          const isStudentChoice = Array.isArray(answer.student_answer.response)
                            ? answer.student_answer.response.includes(option)
                            : String(answer.student_answer.response) === option;
                          const isCorrectChoice = Array.isArray(answer.question.correct_answer)
                            ? answer.question.correct_answer.includes(option)
                            : String(answer.question.correct_answer) === option;

                          return (
                            <li
                              key={index}
                              className={`p-2 rounded border ${
                                isStudentChoice && isCorrectChoice
                                  ? 'bg-green-50 border-green-200'
                                  : isStudentChoice && !isCorrectChoice
                                  ? 'bg-red-50 border-red-200'
                                  : isCorrectChoice
                                  ? 'bg-blue-50 border-blue-200'
                                  : 'bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span>{option}</span>
                                <div className="flex space-x-1">
                                  {isStudentChoice && (
                                    <Badge variant="outline" className="text-xs">
                                      學生選擇
                                    </Badge>
                                  )}
                                  {isCorrectChoice && (
                                    <Badge variant="default" className="text-xs">
                                      正確答案
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Answer Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <h4 className="font-medium text-gray-700 mb-1">學生答案：</h4>
                      <p className={`text-sm p-2 rounded ${
                        isCorrect ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                      }`}>
                        {formatStudentResponse(answer.student_answer.response, answer.question.type)}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-700 mb-1">正確答案：</h4>
                      <p className="text-sm p-2 bg-blue-50 text-blue-800 rounded">
                        {formatCorrectAnswer(answer.question.correct_answer)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}