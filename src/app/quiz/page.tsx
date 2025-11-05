import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function QuizPage() {
  const session = await getSession();

  if (!session || session.type !== 'student') {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">答題系統</h1>
              <p className="text-gray-600">歡迎，{session.displayName} ({session.studentNo})</p>
            </div>
            <form action="/api/auth/logout" method="POST">
              <Button variant="outline" type="submit">
                登出
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>測驗資訊</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">學生姓名</p>
                  <p className="font-medium">{session.displayName}</p>
                </div>
                <div>
                  <p className="text-gray-600">學號</p>
                  <p className="font-medium">{session.studentNo}</p>
                </div>
                <div>
                  <p className="text-gray-600">測驗 ID</p>
                  <p className="font-medium text-xs">{session.quizId}</p>
                </div>
                <div>
                  <p className="text-gray-600">參與者 ID</p>
                  <p className="font-medium text-xs">{session.participantId}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>開始測驗</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">
                您已成功登入測驗系統。請注意，測驗完成後將會自動計算分數用於分組，但不會向您顯示具體分數。
              </p>
              <div className="flex gap-4">
                <Button className="flex-1">
                  開始答題
                </Button>
                <Button variant="outline" className="flex-1">
                  檢視分組
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>測驗說明</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside space-y-2 text-sm text-gray-600">
                <li>請確實完成所有題目後再提交</li>
                <li>測驗只能提交一次，請謹慎作答</li>
                <li>系統會根據您的表現進行自動分組</li>
                <li>分組結果將在老師公布後顯示</li>
                <li>如有技術問題，請聯繫管理者</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}