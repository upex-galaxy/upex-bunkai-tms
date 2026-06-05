'use client';

import type { Components } from 'react-markdown';
import { cn } from '@lib/utils';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

// Safe Markdown renderer (BK-16). The hard XSS wall:
//   * react-markdown is used WITHOUT rehype-raw, so raw HTML in the source is
//     escaped/inert — `<script>` never becomes an element.
//   * rehype-sanitize runs on the produced tree with a schema tightened to allow
//     only http/https/mailto link protocols (the GitHub default also permits
//     tel/relative — we drop everything but the three the spec lists).
// Links are forced to open in a new tab with `rel="noopener noreferrer"` at the
// React layer (after sanitization). Code keeps its `language-*` class so a Phase-2
// syntax highlighter can hook in without changing this component.

const schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
  },
};

const components: Components = {
  a({ node, ...props }) {
    void node;
    return <a {...props} target="_blank" rel="noopener noreferrer" />;
  },
  code({ node, className, children, ...props }) {
    void node;
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      data-testid="markdown-rendered"
      className={cn(
        'text-sm leading-relaxed text-fg-1',
        '[&_h1]:mb-1.5 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-fg-0',
        '[&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-fg-0',
        '[&_h3]:mb-1 [&_h3]:mt-2.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-fg-1',
        '[&_h4]:mb-1 [&_h4]:mt-2 [&_h4]:text-xs [&_h4]:font-semibold [&_h4]:uppercase [&_h4]:tracking-wide [&_h4]:text-fg-2',
        '[&_p]:my-1.5',
        '[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
        '[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2',
        '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-stroke-3 [&_blockquote]:pl-3 [&_blockquote]:text-fg-3',
        '[&_code]:rounded-1 [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
        '[&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-2 [&_pre]:border [&_pre]:border-stroke-2 [&_pre]:bg-surface-2 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs',
        '[&_th]:border [&_th]:border-stroke-2 [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
        '[&_td]:border [&_td]:border-stroke-2 [&_td]:px-2 [&_td]:py-1',
        '[&_hr]:my-3 [&_hr]:border-stroke-2',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
