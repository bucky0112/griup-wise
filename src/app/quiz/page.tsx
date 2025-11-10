'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, BookOpen, CheckCircle2, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import QuizInterface, { Quiz, Question, Participant } from '@/components/quiz/QuizInterface';

type QuizStatus = 'loading' | 'ready_to_answer' | 'completed' | 'no_assignment' | 'error';

// Group display component
function GroupDisplay() {
  const [groupData, setGroupData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGroupData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/student/groups');

        if (response.ok) {
          const data = await response.json();
          setGroupData(data);
        } else {
          setGroupData(null);
        }
      } catch (error) {
        console.error('Error fetching group data:', error);
        setGroupData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchGroupData();
  }, []);

  if (loading) {
    return (
      <Card className="mt-6">
        <CardContent className="pt-6">
          <div className="text-center">
            <Skeleton className="h-4 w-32 mx-auto mb-2" />
            <Skeleton className="h-4 w-24 mx-auto" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!groupData?.my_group) {
    return (
      <Card className="mt-6">
        <CardContent className="pt-6">
          <div className="text-center text-gray-600">
            <p className="text-sm">
              {groupData?.message || '系統將根據您的答題表現進行分組，分組結果將在老師公布後顯示。'}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { my_group } = groupData;

  return (
    <Card className="mt-6">
      <CardHeader>
        <h3 className="text-lg font-semibold text-center">您的分組</h3>
      </CardHeader>
      <CardContent>
        <div className="text-center space-y-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="text-xl font-bold text-blue-800 mb-2">
              {my_group.name}
            </h4>
            <p className="text-sm text-blue-600">
              您在組內的排序：第 {my_group.my_rank_in_group} 位
            </p>
          </div>

          <div>
            <h5 className="text-md font-medium mb-3 text-gray-800">組員名單</h5>
            <div className="space-y-2">
              {my_group.members.map((member: any, index: number) => (
                <div
                  key={`${member.student_no}-${index}`}
                  className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded"
                >
                  <span className="font-medium">{member.display_name}</span>
                  <span className="text-sm text-gray-600">{member.student_no}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-500 pt-2 border-t">
            分組由系統根據答題表現自動生成
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface AssignmentData {
  status: QuizStatus;
  message?: string;
  quiz?: Quiz;
  questions?: Question[];
  participant?: Participant;
  submittedAt?: string;
}

export default function QuizPage() {
  const router = useRouter();
  const [assignmentData, setAssignmentData] = useState<AssignmentData>({ status: 'loading' });

  const fetchAssignment = useCallback(async () => {
    try {
      setAssignmentData({ status: 'loading' });

      const response = await fetch('/api/assignments/next');
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/login');
          return;
        }
        throw new Error(data.message || '無法載入測驗資料');
      }

      setAssignmentData(data);
    } catch (error) {
      console.error('Error fetching assignment:', error);
      setAssignmentData({
        status: 'error',
        message: error instanceof Error ? error.message : '載入失敗，請稍後再試'
      });
    }
  }, [router]);

  const handleSubmitSuccess = (submissionData: { submittedAt: string; submissionId: string; totalQuestions: number }) => {
    setAssignmentData({
      status: 'completed',
      message: '答案提交成功！感謝您的參與。',
      submittedAt: submissionData.submittedAt
    });
    toast.success('測驗完成！');
  };

  const handleRetry = useCallback(() => {
    fetchAssignment();
  }, [fetchAssignment]);

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });

      if (response.redirected) {
        // If the server sent a redirect, follow it
        window.location.href = response.url;
      } else {
        // Fallback: redirect to completion page
        router.push('/quiz/complete');
      }
    } catch (error) {
      console.error('Logout error:', error);
      // Fallback on error: redirect to completion page
      router.push('/quiz/complete');
    }
  };

  useEffect(() => {
    fetchAssignment();
  }, [fetchAssignment]);

  const renderContent = () => {
    switch (assignmentData.status) {
      case 'loading':
        return (
          <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                </CardContent>
              </Card>
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-24" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        );

      case 'ready_to_answer':
        if (assignmentData.quiz && assignmentData.questions && assignmentData.participant) {
          return (
            <div className="py-6 sm:px-6 lg:px-8">
              <QuizInterface
                quiz={assignmentData.quiz}
                questions={assignmentData.questions}
                participant={assignmentData.participant}
                onSubmitSuccess={handleSubmitSuccess}
              />
            </div>
          );
        }
        break;

      case 'completed':
        return (
          <div className="max-w-2xl mx-auto py-12 px-6">
            <Card>
              <CardContent className="pt-8">
                <div className="text-center space-y-6">
                  <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                      測驗完成！
                    </h1>
                    <p className="text-gray-600">
                      {assignmentData.message || '您已成功完成測驗，感謝您的參與。'}
                    </p>
                  </div>
                  {assignmentData.submittedAt && (
                    <p className="text-sm text-gray-500">
                      提交時間：{new Date(assignmentData.submittedAt).toLocaleString('zh-TW')}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Group Information */}
            <GroupDisplay />
          </div>
        );

      case 'no_assignment':
        return (
          <div className="max-w-2xl mx-auto py-12 px-6">
            <Card>
              <CardContent className="pt-8">
                <div className="text-center space-y-6">
                  <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-gray-600" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                      暫無可答題測驗
                    </h1>
                    <p className="text-gray-600">
                      {assignmentData.message || '目前沒有可作答的測驗，請聯絡任課老師確認測驗狀態。'}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Button onClick={handleRetry} variant="outline">
                      <RefreshCcw className="w-4 h-4 mr-2" />
                      重新檢查
                    </Button>
                    <p className="text-sm text-gray-500">
                      如有疑問，請聯絡任課老師或管理員。
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case 'error':
        return (
          <div className="max-w-2xl mx-auto py-12 px-6">
            <Card>
              <CardContent className="pt-8">
                <div className="text-center space-y-6">
                  <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-600" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                      載入失敗
                    </h1>
                    <p className="text-gray-600">
                      {assignmentData.message || '系統發生錯誤，請稍後再試。'}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <Button onClick={handleRetry}>
                      <RefreshCcw className="w-4 h-4 mr-2" />
                      重試
                    </Button>
                    <p className="text-sm text-gray-500">
                      如問題持續發生，請聯絡技術支援。
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">答題系統</h1>
              {assignmentData.participant && (
                <p className="text-gray-600">
                  歡迎，{assignmentData.participant.displayName} ({assignmentData.participant.studentNo})
                </p>
              )}
            </div>
            <Button variant="outline" onClick={handleLogout}>
              登出
            </Button>
          </div>
        </div>
      </div>

      {renderContent()}
    </div>
  );
}
