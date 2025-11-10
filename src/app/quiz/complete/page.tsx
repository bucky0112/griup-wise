import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';

export default function QuizCompletePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        <Card>
          <CardContent className="pt-8">
            <div className="text-center space-y-6">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                  測驗已結束
                </h1>
                <p className="text-gray-600 mb-4">
                  感謝您的參與！您已成功登出系統。
                </p>
                <div className="text-sm text-gray-500 space-y-2">
                  <p>如需重新參與測驗，請使用老師提供的測驗連結。</p>
                  <p>如有任何問題，請聯絡任課老師。</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}