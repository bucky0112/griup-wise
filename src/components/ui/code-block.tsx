'use client';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export function CodeBlock({ code, language = 'text', className = '' }: CodeBlockProps) {
  // Sanitize the language input to prevent injection
  const sanitizedLanguage = language.toLowerCase().replace(/[^a-z0-9+]/g, '');

  // Supported languages list for security
  const supportedLanguages = [
    'javascript','html', 'css', 'json', 'bash', 'text'
  ];

  const validLanguage = supportedLanguages.includes(sanitizedLanguage) ? sanitizedLanguage : 'text';

  return (
    <div className={`rounded-lg overflow-hidden border ${className}`}>
      <div className="bg-gray-100 px-4 py-2 text-sm text-gray-600 border-b">
        {language && language !== 'text' ? language.toUpperCase() : '程式碼'}
      </div>
      <SyntaxHighlighter
        language={validLanguage}
        style={tomorrow}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '14px',
          lineHeight: '1.5',
        }}
        showLineNumbers={true}
        wrapLines={true}
        wrapLongLines={true}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
