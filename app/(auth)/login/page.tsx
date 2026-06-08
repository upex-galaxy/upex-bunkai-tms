import { Button } from '@components/ui/button';
import { createClient } from '@lib/supabase/server';
import { ArrowRight, Terminal } from 'lucide-react';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { MagicLinkForm } from './magic-link-form';

const FEATURE_TICKS: Array<[string, string]> = [
  ['IQL', 'Integrated Quality Lifecycle — methodology that spans story → case → run → bug.'],
  ['ATC', 'Acceptance Test Case — one observable behaviour, executable by humans or agents.'],
  ['KATA', 'Komponent Action Test Architecture — how ATCs assemble into a real automated test.'],
  ['×3', 'Manual · Agentic · CI execution. Same schema, same reports.'],
  ['OSS', 'Apache-2.0. Self-host with one docker compose, or use Cloud.'],
];

export default async function LoginPage() {
  // Signed-in users should never see the login form. Bounce them into the app
  // (/projects redirects on to /onboarding when they have no workspace).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    redirect('/projects');
  }

  return (
    <div className="grid h-screen grid-cols-1 bg-surface-0 lg:grid-cols-[1fr_460px]">
      {/* LEFT — brand / etymology panel */}
      <section
        className="relative hidden flex-col justify-between overflow-hidden border-r border-stroke-1 px-12 py-8 lg:flex"
        style={{ background: 'linear-gradient(180deg, #0c0e12 0%, #0a0b0d 100%)' }}
      >
        {/* drifting light glows */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="aurora aurora-1"
            style={{ top: '-12%', left: '-8%', width: 520, height: 520, background: 'radial-gradient(circle, rgba(217,84,63,0.28), transparent 70%)' }}
          />
          <div
            className="aurora aurora-2"
            style={{ bottom: '-18%', right: '-6%', width: 560, height: 560, background: 'radial-gradient(circle, rgba(79,140,247,0.20), transparent 70%)' }}
          />
          <div
            className="aurora aurora-3"
            style={{ top: '38%', left: '30%', width: 420, height: 420, background: 'radial-gradient(circle, rgba(139,109,240,0.16), transparent 70%)' }}
          />
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage: 'radial-gradient(ellipse at 30% 50%, black, transparent 70%)',
          }}
        />

        <header className="relative flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-widest text-fg-3">
            BUNKAI · TMS
          </span>
          <span className="font-mono text-xs text-fg-3">
            v0.1.0 · self-hosted-ready
          </span>
        </header>

        <div className="relative max-w-[580px]">
          <div className="fade-up mb-7 flex flex-wrap-reverse items-end gap-x-9 gap-y-4">
            <div className="font-jp inline-flex flex-shrink-0 items-end whitespace-nowrap font-bold leading-none text-fg-0" style={{ fontSize: 'clamp(110px, 17vw, 196px)', letterSpacing: '0.04em' }}>
              <span className="relative inline-block">
                <span
                  aria-hidden
                  className="glow-halo pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2"
                  style={{ width: '1.2em', height: '1.2em', background: 'radial-gradient(circle, var(--accent-glow), transparent 70%)', filter: 'blur(24px)' }}
                />
                分
                <span
                  aria-hidden
                  className="absolute bg-accent"
                  style={{ right: '-0.04em', bottom: '0.12em', width: '0.085em', height: '0.085em', borderRadius: 1 }}
                />
              </span>
              <span className="inline-block text-fg-3">解</span>
            </div>
            <div className="min-w-[200px] max-w-[280px] flex-1 pb-3">
              <div className="mb-1.5 font-mono text-xs uppercase tracking-widest text-fg-3">
                BUN · KAI
              </div>
              <div className="text-sm leading-relaxed text-fg-2">
                The martial-arts practice of decomposing a kata into its real combat applications.
              </div>
              <div className="mt-2 text-xs italic text-fg-4">
                Bunkai is the real Japanese martial-arts term — not the anime word.
              </div>
            </div>
          </div>

          <h1 className="fade-up m-0 max-w-[540px] text-[30px] font-bold leading-[1.15] tracking-tight text-fg-0" style={{ animationDelay: '0.08s' }}>
            A test management system that
            <br />
            <span className="text-fg-2">decomposes user stories into</span>
            <br />
            executable Acceptance Test Cases.
          </h1>

          <p className="fade-up mt-4 max-w-[480px] text-md leading-relaxed text-fg-2" style={{ animationDelay: '0.16s' }}>
            Built around the
            {' '}
            <strong className="font-semibold text-fg-0">IQL</strong>
            {' '}
            methodology and the
            {' '}
            <strong className="font-semibold text-fg-0">KATA</strong>
            {' '}
            architecture — for QA engineers who think in reusable test cases, not freeform steps. Manual, agentic, and CI execution converge on the same source of truth.
          </p>

          <ul className="fade-up mt-6 grid max-w-[520px] grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 p-0" style={{ animationDelay: '0.24s' }}>
            {FEATURE_TICKS.map(([k, v]) => (
              <li key={k} className="contents">
                <span className="self-center font-mono text-xs font-semibold text-accent">{k}</span>
                <span className="text-sm text-fg-2">{v}</span>
              </li>
            ))}
          </ul>
        </div>

        <footer className="relative flex items-center justify-between text-xs text-fg-3">
          <div className="flex items-center gap-4">
            <span className="font-mono">$ docker compose up</span>
            <span>·</span>
            <span>github.com/bunkai-tms</span>
            <span>·</span>
            <span>docs</span>
          </div>
          <span>Apache-2.0 · © Bunkai contributors</span>
        </footer>
      </section>

      {/* RIGHT — auth panel */}
      <section className="relative flex flex-col justify-center overflow-hidden bg-surface-1 px-6 py-12 sm:px-11">
        {/* ambient glow — carries the brand life onto mobile, where the left panel is hidden */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="aurora aurora-2"
            style={{ top: '-20%', right: '-25%', width: 480, height: 480, background: 'radial-gradient(circle, rgba(217,84,63,0.16), transparent 70%)' }}
          />
          <div
            className="aurora aurora-3 lg:hidden"
            style={{ bottom: '-25%', left: '-20%', width: 420, height: 420, background: 'radial-gradient(circle, rgba(79,140,247,0.14), transparent 70%)' }}
          />
        </div>

        <div className="fade-up relative mx-auto w-full max-w-[360px]">
          {/* mobile-only brand mark (left panel is hidden < lg) */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="font-jp text-3xl font-bold leading-none text-fg-0">分解</span>
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight text-fg-0">Bunkai</div>
              <div className="font-mono text-2xs uppercase tracking-widest text-fg-3">Test Management</div>
            </div>
          </div>

          <div className="mb-6">
            <div className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
              Sign in
            </div>
            <h2 className="m-0 text-2xl font-bold tracking-tight text-fg-0">
              Continue to your workspace
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-3">
              Magic link to your work email. OAuth and SSO ship next sprint.
            </p>
          </div>

          <Suspense fallback={<div className="h-[120px]" aria-hidden />}>
            <MagicLinkForm />
          </Suspense>

          <div className="my-4 flex items-center gap-2.5 text-xs text-fg-4">
            <div className="h-px flex-1 bg-stroke-1" />
            OR
            <div className="h-px flex-1 bg-stroke-1" />
          </div>

          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              disabled
              className="w-full cursor-not-allowed justify-center opacity-60"
              title="OAuth ships next sprint"
            >
              <span className="font-mono text-xs">GH</span>
              Continue with GitHub
              <span className="ml-auto font-mono text-xs text-fg-4">soon</span>
            </Button>
            <Button
              size="lg"
              disabled
              className="w-full cursor-not-allowed justify-center opacity-60"
              title="OAuth ships next sprint"
            >
              <span className="font-mono text-xs">G</span>
              Continue with Google
              <span className="ml-auto font-mono text-xs text-fg-4">soon</span>
            </Button>
          </div>

          <div className="mt-6 rounded-3 border border-stroke-2 bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Terminal size={14} className="text-fg-2" />
                <div>
                  <div className="text-sm font-semibold text-fg-1">
                    Self-hosted instance
                  </div>
                  <div className="mt-0.5 text-xs text-fg-3">
                    Connect to your own Bunkai server (Community edition)
                  </div>
                </div>
              </div>
              <ArrowRight size={14} className="text-fg-3" />
            </div>
          </div>

          <div className="mt-6 border-t border-stroke-1 pt-4 text-xs leading-relaxed text-fg-3">
            Open-source, self-hostable, Apache-2.0. Your test specifications stay on your servers — Bunkai never reaches for the cloud unless you tell it to.
          </div>
        </div>
      </section>
    </div>
  );
}
