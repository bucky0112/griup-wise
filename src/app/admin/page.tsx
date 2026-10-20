import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { classes, quizzes, participants } from '@/lib/db/schema';
import { and, eq, count, isNull } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function AdminDashboard() {
  const session = await getSession();

  if (!session || session.type !== 'admin') {
    redirect('/login');
  }

  // Get statistics for dashboard
  const [classesCount, quizzesCount, participantsCountResult] = await Promise.all([
    db
      .select({ count: count(classes.id) })
      .from(classes)
      .where(and(eq(classes.createdBy, session.id), isNull(classes.deletedAt))),
    db
      .select({ count: count(quizzes.id) })
      .from(quizzes)
      .where(and(eq(quizzes.createdBy, session.id), isNull(quizzes.deletedAt))),
    db
      .select({ count: count(participants.id) })
      .from(participants)
      .innerJoin(quizzes, eq(quizzes.id, participants.quizId))
      .where(and(eq(quizzes.createdBy, session.id), isNull(quizzes.deletedAt)))
  ]);

  const totalClasses = classesCount[0]?.count || 0;
  const totalQuizzes = quizzesCount[0]?.count || 0;
  const totalParticipants = participantsCountResult[0]?.count || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">管理者後台</h1>
              <p className="text-gray-600">歡迎，{session.name}</p>
            </div>
            <form action="/api/auth/logout" method="POST">
              <Button variant="outline" type="submit">
                登出
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>班級管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">建立和管理班級</p>
              <p className="text-sm text-blue-600 mb-3">目前有 {totalClasses} 個班級</p>
              <Link href="/admin/classes">
                <Button className="w-full">管理班級</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>測驗管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">建立測驗和題目</p>
              <p className="text-sm text-green-600 mb-3">目前有 {totalQuizzes} 個測驗</p>
              <Link href="/admin/quizzes">
                <Button className="w-full">管理測驗</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>分組管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">檢視分數和分組</p>
              <p className="text-sm text-purple-600 mb-3">目前有 {totalParticipants} 名學生</p>
              <Link href="/admin/groups">
                <Button className="w-full">檢視分組</Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>系統資訊</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">登入身分</p>
                  <p className="font-medium">管理者</p>
                </div>
                <div>
                  <p className="text-gray-600">電子郵件</p>
                  <p className="font-medium">{session.email}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
