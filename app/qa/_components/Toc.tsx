'use client';

import { cn } from '@lib/utils';
import { Check, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface QaSection {
  id: string
  label: string
}

// Section anchors + TOC labels (es). Order is canonical §1–§7.
export const qaSections: QaSection[] = [
  { id: 'credenciales', label: 'Credenciales' },
  { id: 'arquitectura', label: 'Arquitectura' },
  { id: 'trifuerza', label: 'La Trifuerza + Env' },
  { id: 'db', label: 'DB testing' },
  { id: 'api', label: 'API testing' },
  { id: 'ui', label: 'UI testing' },
  { id: 'referencia', label: 'Referencia rápida' },
];

export function Toc({ className }: { className?: string }) {
  const [active, setActive] = useState<string>(qaSections[0].id);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );
    for (const s of qaSections) {
      const el = document.getElementById(s.id);
      if (el) { observer.observe(el); }
    }
    return () => observer.disconnect();
  }, []);

  const copyLink = (id: string) => {
    void navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#${id}`);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <nav data-testid="qa-toc" className={cn('text-sm', className)}>
      <p className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-fg-3">
        En esta guía
      </p>
      <ul className="flex flex-col gap-0.5 border-l border-stroke-1">
        {qaSections.map((s, i) => (
          <li key={s.id} className="group flex items-center">
            <a
              href={`#${s.id}`}
              data-testid={`qa-toc-link-${s.id}`}
              className={cn(
                '-ml-px flex-1 border-l-2 py-1 pl-3 transition-colors duration-token ease-token',
                active === s.id
                  ? 'border-accent font-medium text-fg-0'
                  : 'border-transparent text-fg-3 hover:text-fg-1',
              )}
            >
              <span className="mr-1.5 font-mono text-xs text-fg-4">
                §
                {i + 1}
              </span>
              {s.label}
            </a>
            <button
              type="button"
              onClick={() => copyLink(s.id)}
              aria-label={`Copy link to ${s.label}`}
              className="ml-1 shrink-0 p-1 text-fg-4 opacity-0 transition-opacity hover:text-fg-1 group-hover:opacity-100"
            >
              {copied === s.id
                ? <Check className="h-3.5 w-3.5 text-signal-pass" />
                : <Link2 className="h-3.5 w-3.5" />}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
