'use client';

import { Textarea } from '@/components/ui/textarea';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  language?: string;
  className?: string;
  rows?: number;
}

export function CodeEditor({
  value,
  onChange,
  placeholder = "請輸入您的程式碼...",
  language = '',
  className = '',
  rows = 10
}: CodeEditorProps) {
  return (
    <div className={`border rounded-lg ${className}`}>
      {language && (
        <div className="bg-gray-100 px-3 py-2 text-sm text-gray-600 border-b rounded-t-lg">
          {language.toUpperCase()}
        </div>
      )}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="font-mono text-sm border-0 rounded-t-none resize-none focus:ring-0"
        style={{
          fontSize: '14px',
          lineHeight: '1.5',
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
        }}
      />
    </div>
  );
}