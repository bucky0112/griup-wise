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

interface DeleteParticipantButtonProps {
  quizId: string;
  participantId: string;
  studentNo: string;
  displayName: string;
}

// Network errors and non-JSON responses carry English browser messages, so only server messages reach the toast
const ACTION_FAILED_MESSAGE = '操作失敗，請稍後再試';

export function DeleteParticipantButton({ quizId, participantId, studentNo, displayName }: DeleteParticipantButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/quizzes/${quizId}/participants/${participantId}`, { method: 'DELETE' });
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.message || ACTION_FAILED_MESSAGE);
        return;
      }

      toast.success('已刪除參與者');
      setIsOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Delete participant error:', error);
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
            <DialogTitle>刪除參與者？</DialogTitle>
            <DialogDescription>
              將刪除 {studentNo} {displayName} 的作答與分數，且無法復原。刪除後這個學號可以重新登入。
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
