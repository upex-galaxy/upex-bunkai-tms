'use client';

import Editor from '@monaco-editor/react';
import { useMemo } from 'react';

interface StepEditorProps {
  language: 'markdown' | 'yaml'
  value: string
  onChange: (next: string) => void
  height?: number | string
}

export function StepEditor({ language, value, onChange, height = 280 }: StepEditorProps) {
  const options = useMemo(() => ({
    minimap: { enabled: false },
    fontSize: 12,
    lineNumbers: 'on' as const,
    folding: false,
    wordWrap: 'on' as const,
    scrollBeyondLastLine: false,
    renderLineHighlight: 'none' as const,
    padding: { top: 8, bottom: 8 },
    fontFamily: 'var(--font-mono), ui-monospace, monospace',
    automaticLayout: true,
  }), []);

  return (
    <div className="overflow-hidden rounded-3 border border-stroke-2 bg-surface-2">
      <Editor
        height={height}
        language={language}
        theme="vs-dark"
        value={value}
        onChange={v => onChange(v ?? '')}
        options={options}
      />
    </div>
  );
}
