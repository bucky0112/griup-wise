import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { classes, quizzes, participants } from '@/lib/db/schema';
import { eq, and, count } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Calendar, Settings, Plus } from 'lucide-react';
import { notFound } from 'next/navigation';

export default async function ClassDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();

  if (!session || session.type !== 'admin') {
    redirect('/login');
  }

  const classId = params.id;

  // Get class details
  const classData = await db
    .select()
    .from(classes)
    .where(and(eq(classes.id, classId), eq(classes.createdBy, session.id)))
    .limit(1);

  if (classData.length === 0) {
    notFound();
  }

  const classInfo = classData[0];

  // Get related quizzes
  const relatedQuizzes = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      isActive: quizzes.isActive,
      createdAt: quizzes.createdAt,
    })
    .from(quizzes)
    .where(eq(quizzes.classId, classId))
    .orderBy(quizzes.createdAt);

  // Get participants count
  const participantsCountResult = await db
    .select({ count: count(participants.id) })
    .from(participants)
    .innerJoin(quizzes, eq(quizzes.id, participants.quizId))
    .where(eq(quizzes.classId, classId));

  const participantsCount = participantsCountResult[0]?.count || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{classInfo.title}</h1>
              <p className="text-gray-600">班級詳細資訊和管理</p>
            </div>
            <div className="flex space-x-4">
              <Link href={`/admin/classes/${classId}/edit`}>
                <Button variant="outline" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  編輯班級
                </Button>
              </Link>
              <Link href="/admin/classes">
                <Button variant="outline" className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  返回列表
                </Button>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Class Info */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  班級資訊
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">班級名稱</p>
                  <p className="font-medium">{classInfo.title}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-600">預期總人數</p>
                  <p className="font-medium">{classInfo.expectedSize || '未設定'}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-600">理想每組人數</p>
                  <p className="font-medium">{classInfo.targetGroupSize || '未設定'}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-600">實際參與學生</p>
                  <p className="font-medium text-blue-600">{participantsCount} 人</p>
                </div>

                <div>
                  <p className="text-sm text-gray-600">測驗數量</p>
                  <p className="font-medium text-green-600">{relatedQuizzes.length} 個</p>
                </div>

                <div>
                  <p className="text-sm text-gray-600 flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    建立時間
                  </p>
                  <p className="font-medium">
                    {new Date(classInfo.createdAt).toLocaleDateString('zh-TW', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quizzes List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  關聯測驗
                </CardTitle>
                <Link href="/admin/quizzes">
                  <Button size="sm" className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    新增測驗
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {relatedQuizzes.length === 0 ? (
                  <div className="text-center py-8">
                    <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 mb-4">此班級尚未有測驗</p>
                    <Link href="/admin/quizzes">
                      <Button>建立第一個測驗</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {relatedQuizzes.map((quiz) => (
                      <div key={quiz.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 mb-2">{quiz.title}</h4>
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                {new Date(quiz.createdAt).toLocaleDateString('zh-TW')}
                              </div>
                              <Badge variant={quiz.isActive ? 'default' : 'secondary'}>
                                {quiz.isActive ? '進行中' : '未啟用'}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Link href={`/admin/quizzes/${quiz.id}/questions`}>
                              <Button variant="outline" size="sm">管理題目</Button>
                            </Link>
                            <Link href={`/admin/scores/${quiz.id}`}>
                              <Button variant="outline" size="sm">查看分數</Button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Statistics */}
        {relatedQuizzes.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>統計資訊</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
                <div>
                  <p className="text-2xl font-bold text-blue-600">{relatedQuizzes.length}</p>
                  <p className="text-gray-600">總測驗數</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    {relatedQuizzes.filter(q => q.isActive).length}
                  </p>
                  <p className="text-gray-600">進行中測驗</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-600">{participantsCount}</p>
                  <p className="text-gray-600">參與學生總數</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-600">
                    {participantsCount > 0 && classInfo.targetGroupSize
                      ? Math.ceil(participantsCount / classInfo.targetGroupSize)
                      : '未設定'}
                  </p>
                  <p className="text-gray-600">建議組數</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}