'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface DeleteQuizButtonProps {
  quizId: string;
  quizTitle: string;
}

// Network errors and non-JSON responses carry English browser messages, so only server messages reach the toast
const ACTION_FAILED_MESSAGE = '操作失敗，請稍後再試';

export function DeleteQuizButton({ quizId, quizTitle }: DeleteQuizButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/quizzes/${quizId}`, { method: 'DELETE' });
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.message || ACTION_FAILED_MESSAGE);
        return;
      }

      toast.success('已刪除測驗');
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Delete quiz error:', error);
      toast.error(ACTION_FAILED_MESSAGE);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="text-red-600" onClick={() => setIsOpen(true)}>
        刪除
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>刪除測驗？</DialogTitle>
            <DialogDescription>
              將刪除「{quizTitle}」，學生將無法再進入作答。刪除後測驗會從列表中移除，若需復原請聯絡系統管理者。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isDeleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? '刪除中...' : '確定刪除'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
