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

interface QuizActivationToggleProps {
  quizId: string;
  isActive: boolean;
  // Without it the server-rendered page is refreshed to re-read the stored state
  onChange?: (isActive: boolean) => void;
  size?: 'default' | 'sm' | 'lg';
}

// Network errors and non-JSON responses carry English browser messages, so only server messages reach the toast
const ACTION_FAILED_MESSAGE = '操作失敗，請稍後再試';

export function QuizActivationToggle({ quizId, isActive, onChange, size = 'sm' }: QuizActivationToggleProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);

  const setActive = async (next: boolean) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/admin/quizzes/${quizId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: next }),
      });
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.message || ACTION_FAILED_MESSAGE);
        return;
      }

      // Show only what the server stored
      const stored: boolean = result.quiz.is_active;
      toast.success(stored ? '測驗已啟用，學生可以用分享連結進入' : '測驗已停用');
      setConfirmingDeactivate(false);
      if (onChange) {
        onChange(stored);
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error('Toggle quiz activation error:', error);
      toast.error(ACTION_FAILED_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size={size}
        disabled={isSaving}
        onClick={() => (isActive ? setConfirmingDeactivate(true) : setActive(true))}
      >
        {isActive ? '停用測驗' : '啟用測驗'}
      </Button>

      <Dialog open={confirmingDeactivate} onOpenChange={setConfirmingDeactivate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>停用測驗？</DialogTitle>
            <DialogDescription>
              停用後學生無法再用分享連結進入，尚未交卷的學生也無法提交答案。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setConfirmingDeactivate(false)} disabled={isSaving}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => setActive(false)} disabled={isSaving}>
              {isSaving ? '停用中...' : '確定停用'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
