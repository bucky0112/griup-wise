import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { classes, quizzes, participants } from '@/lib/db/schema';
import { and, eq, count, isNull } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus, Users, BookOpen, Calendar } from 'lucide-react';
import { DeleteClassButton } from '@/components/admin/DeleteClassButton';

export default async function ClassesManagement() {
  const session = await getSession();

  if (!session || session.type !== 'admin') {
    redirect('/login');
  }

  // Get classes with statistics
  const classesWithStats = await db
    .select({
      id: classes.id,
      title: classes.title,
      expectedSize: classes.expectedSize,
      targetGroupSize: classes.targetGroupSize,
      createdAt: classes.createdAt,
      quizzesCount: count(quizzes.id),
    })
    .from(classes)
    .leftJoin(quizzes, and(eq(quizzes.classId, classes.id), isNull(quizzes.deletedAt)))
    .where(and(eq(classes.createdBy, session.id), isNull(classes.deletedAt)))
    .groupBy(classes.id, classes.title, classes.expectedSize, classes.targetGroupSize, classes.createdAt)
    .orderBy(classes.createdAt);

  // Get participants count for each class
  const classesWithParticipants = await Promise.all(
    classesWithStats.map(async (classItem) => {
      const participantsCountResult = await db
        .select({ count: count(participants.id) })
        .from(participants)
        .innerJoin(quizzes, eq(quizzes.id, participants.quizId))
        .where(and(eq(quizzes.classId, classItem.id), isNull(quizzes.deletedAt)));

      return {
        ...classItem,
        participantsCount: participantsCountResult[0]?.count || 0,
      };
    })
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">班級管理</h1>
              <p className="text-gray-600">建立和管理您的班級</p>
            </div>
            <div className="flex space-x-4">
              <Link href="/admin/classes/new">
                <Button className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  建立新班級
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
        <div className="mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                班級列表
              </CardTitle>
            </CardHeader>
            <CardContent>
              {classesWithParticipants.length === 0 ? (
                <div className="text-center py-8">
                  <BookOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">尚未建立任何班級</p>
                  <Link href="/admin/classes/new">
                    <Button>建立第一個班級</Button>
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4">
                  {classesWithParticipants.map((classItem) => (
                    <div key={classItem.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-lg font-medium text-gray-900 mb-2">{classItem.title}</h3>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                              <BookOpen className="h-4 w-4 text-gray-400" />
                              <span className="text-gray-600">測驗數量:</span>
                              <span className="font-medium">{classItem.quizzesCount}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-gray-400" />
                              <span className="text-gray-600">參與學生:</span>
                              <span className="font-medium">{classItem.participantsCount}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-gray-400" />
                              <span className="text-gray-600">預期人數:</span>
                              <span className="font-medium">{classItem.expectedSize || '未設定'}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4 text-gray-400" />
                              <span className="text-gray-600">目標組別大小:</span>
                              <span className="font-medium">{classItem.targetGroupSize || '未設定'}</span>
                            </div>
                          </div>

                          <p className="text-sm text-gray-500 mt-3 flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            建立時間：{new Date(classItem.createdAt).toLocaleDateString('zh-TW', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2 ml-4">
                          <Link href={`/admin/classes/${classItem.id}`}>
                            <Button variant="outline" size="sm">檢視詳情</Button>
                          </Link>
                          <Link href={`/admin/classes/${classItem.id}/edit`}>
                            <Button variant="outline" size="sm">編輯</Button>
                          </Link>
                          <DeleteClassButton
                            classId={classItem.id}
                            className={classItem.title}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Summary Statistics */}
        {classesWithParticipants.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>統計概覽</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-center">
                <div>
                  <p className="text-2xl font-bold text-blue-600">{classesWithParticipants.length}</p>
                  <p className="text-gray-600">總班級數</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    {classesWithParticipants.reduce((sum, c) => sum + c.quizzesCount, 0)}
                  </p>
                  <p className="text-gray-600">總測驗數</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-600">
                    {classesWithParticipants.reduce((sum, c) => sum + c.participantsCount, 0)}
                  </p>
                  <p className="text-gray-600">總參與學生</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-orange-600">
                    {Math.round(classesWithParticipants.reduce((sum, c) => sum + c.participantsCount, 0) / classesWithParticipants.length) || 0}
                  </p>
                  <p className="text-gray-600">平均每班學生數</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}