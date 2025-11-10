'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Share2, Copy, Check } from 'lucide-react';

interface ShareQuizLinkProps {
  quizId: string;
  quizTitle: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}

export function ShareQuizLink({
  quizId,
  quizTitle,
  variant = 'outline',
  size = 'sm'
}: ShareQuizLinkProps) {
  const [copied, setCopied] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const getQuizLink = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/quiz/${quizId}/login`;
    }
    return '';
  };

  const handleCopyLink = async () => {
    const link = getQuizLink();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('測驗連結已複製到剪貼簿');

      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
      toast.error('複製連結失敗，請手動複製');
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Reset copied state when dialog closes
      setCopied(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>
          <Share2 className="w-4 h-4 mr-1" />
          分享連結
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>分享測驗連結</DialogTitle>
          <DialogDescription>
            將此連結分享給學生，他們可以直接進入測驗「{quizTitle}」
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <div className="grid flex-1 gap-2">
              <label htmlFor="quiz-link" className="text-sm font-medium">
                測驗連結
              </label>
              <Input
                id="quiz-link"
                value={getQuizLink()}
                readOnly
                className="text-sm"
              />
            </div>
            <Button
              onClick={handleCopyLink}
              size="sm"
              className="px-3 shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span className="sr-only">
                {copied ? '已複製' : '複製連結'}
              </span>
            </Button>
          </div>

          <div className="bg-blue-50 p-3 rounded-lg">
            <h4 className="text-sm font-medium text-blue-900 mb-1">
              使用說明：
            </h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• 學生點擊連結後只需填寫姓名和學號</li>
              <li>• 無需手動輸入測驗代碼</li>
              <li>• 可透過 Email、即時通訊軟體等方式分享</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}