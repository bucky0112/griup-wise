import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { quizzes, classes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ShareQuizLink } from '@/components/admin/ShareQuizLink';

export default async function QuizzesManagement() {
  const session = await getSession();

  if (!session || session.type !== 'admin') {
    redirect('/login');
  }

  const allQuizzes = await db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      isActive: quizzes.isActive,
      createdAt: quizzes.createdAt,
      className: classes.title,
    })
    .from(quizzes)
    .innerJoin(classes, eq(quizzes.classId, classes.id))
    .where(eq(quizzes.createdBy, session.id))
    .orderBy(quizzes.createdAt);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">測驗管理</h1>
              <p className="text-gray-600">管理您的測驗和題目</p>
            </div>
            <div className="flex space-x-4">
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
              <CardTitle>測驗列表</CardTitle>
            </CardHeader>
            <CardContent>
              {allQuizzes.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">尚未建立任何測驗</p>
                  <Button>建立新測驗</Button>
                </div>
              ) : (
                <div className="grid gap-4">
                  {allQuizzes.map((quiz) => (
                    <div key={quiz.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-lg font-medium text-gray-900">{quiz.title}</h3>
                          <p className="text-sm text-gray-600">班級：{quiz.className}</p>
                          <p className="text-sm text-gray-500">
                            建立時間：{new Date(quiz.createdAt).toLocaleDateString('zh-TW')}
                          </p>
                          <div className="mt-2">
                            <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                              quiz.isActive
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {quiz.isActive ? '進行中' : '未啟用'}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <ShareQuizLink
                            quizId={quiz.id}
                            quizTitle={quiz.title}
                          />
                          <Link href={`/admin/quizzes/${quiz.id}/questions`}>
                            <Button variant="outline" size="sm">管理題目</Button>
                          </Link>
                          <Link href={`/admin/scores/${quiz.id}`}>
                            <Button variant="outline" size="sm">查看分數</Button>
                          </Link>
                          <Link href={`/admin/groups/${quiz.id}`}>
                            <Button variant="outline" size="sm">管理分組</Button>
                          </Link>
                          <Button variant="outline" size="sm">編輯</Button>
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
    </div>
  );
}