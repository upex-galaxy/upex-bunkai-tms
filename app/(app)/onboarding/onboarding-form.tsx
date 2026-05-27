'use client';

import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

interface ApiErrorBody {
  error?: { code?: string, message?: string }
}

export function OnboardingForm({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);
  const isValid = SLUG_REGEX.test(effectiveSlug) && name.trim().length > 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) { return; }
    setSubmitting(true);
    try {
      const response = await fetch('/api/v1/workspaces', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: effectiveSlug, name: name.trim() }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        const code = body.error?.code;
        const friendly = code === 'conflict'
          ? `Slug "${effectiveSlug}" is taken — try another.`
          : body.error?.message ?? 'Could not create workspace.';
        toast.error(friendly);
        setSubmitting(false);
        return;
      }
      toast.success('Workspace created');
      router.replace('/projects');
      router.refresh();
    }
    catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error.');
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => { void onSubmit(e); }}
      className="w-full max-w-[440px] rounded-3 border border-stroke-2 bg-surface-1 p-6"
    >
      <div className="mb-5">
        <div className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          Create workspace
        </div>
        <h1 className="m-0 text-2xl font-bold tracking-tight text-fg-0">
          One last step,
          {' '}
          {userEmail || 'friend'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-3">
          A workspace is the tenant boundary for your projects, modules, and ATCs.
          You'll be its owner — invite teammates once it exists.
        </p>
      </div>

      <label className="mb-3 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          Workspace name
        </span>
        <Input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Acme QA"
          className="h-10 text-md"
        />
      </label>

      <label className="mb-5 block">
        <span className="mb-1.5 block text-xs font-medium text-fg-2">
          URL slug
          <span className="ml-2 font-normal text-fg-4">
            lowercase, digits, hyphens
          </span>
        </span>
        <Input
          value={effectiveSlug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          placeholder="acme-qa"
          className="h-10 font-mono text-md"
        />
        {!isValid && effectiveSlug.length > 0 && (
          <span className="mt-1 block text-xs text-accent">
            Slug must start and end with a letter or digit, 3–40 chars.
          </span>
        )}
      </label>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={!isValid || submitting}
        className="w-full justify-center"
      >
        {submitting ? 'Creating…' : 'Create workspace'}
        <ArrowRight size={14} />
      </Button>
    </form>
  );
}
