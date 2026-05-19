// Screen 1 — Login / Entry point
const { useState: useState1 } = React;

function LoginScreen() {
  const { nav } = window.useRouter();
  const [hoverHost, setHoverHost] = useState1(false);

  return (
    <div style={{
      height: '100vh', display: 'grid',
      gridTemplateColumns: '1fr 460px',
      background: 'var(--bg-0)',
    }}>
      {/* LEFT — brand / etymology panel */}
      <section style={{
        position: 'relative',
        background: 'linear-gradient(180deg, #0c0e12 0%, #0a0b0d 100%)',
        borderRight: '1px solid var(--stroke-1)',
        padding: '32px 48px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        overflow: 'hidden',
      }}>
        {/* faint grid */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          backgroundImage:
            `linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
             linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
          maskImage: 'radial-gradient(ellipse at 30% 50%, black, transparent 70%)',
        }} />

        <header style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <window.Logo size={22} />
          <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>v0.4.2 · self-hosted</span>
        </header>

        <div style={{ position: 'relative', maxWidth: 580 }}>
          {/* the kanji as a large editorial element.
              flex-wrap: wrap-reverse → caption sits to the right when there is room,
              and rises ABOVE the kanji when the column gets narrow. */}
          <div style={{
            position: 'relative', marginBottom: 28,
            display: 'flex', flexWrap: 'wrap-reverse',
            alignItems: 'flex-end',
            columnGap: 'clamp(20px, 3vw, 36px)', rowGap: 16,
          }}>
            <div className="jp" style={{
              fontSize: 'clamp(110px, 17vw, 196px)',
              lineHeight: 1,
              fontWeight: 700,
              color: 'var(--fg-0)',
              letterSpacing: '0.04em',
              display: 'inline-flex',
              alignItems: 'flex-end',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}>
              <span style={{ position: 'relative', display: 'inline-block' }}>
                分
                <span style={{
                  position: 'absolute', right: '-0.04em', bottom: '0.12em',
                  width: '0.085em', height: '0.085em',
                  background: 'var(--accent)',
                  borderRadius: 1,
                }} aria-hidden />
              </span>
              <span style={{ color: 'var(--fg-3)', display: 'inline-block' }}>解</span>
            </div>
            <div style={{
              flex: '1 1 200px',
              minWidth: 200, maxWidth: 280,
              paddingBottom: 'clamp(8px, 1.5vw, 22px)',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', marginBottom: 6, letterSpacing: '0.04em' }}>
                BUN · KAI
              </div>
              <div style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.55 }}>
                The martial-arts practice of decomposing a kata into its real combat applications.
              </div>
            </div>
          </div>

          <h1 style={{
            margin: 0, fontSize: 30, lineHeight: 1.15, letterSpacing: '-0.02em',
            fontWeight: 700, color: 'var(--fg-0)', maxWidth: 540,
          }}>
            A test management system that
            <br />
            <span style={{ color: 'var(--fg-2)' }}>decomposes user stories into</span>
            <br />
            executable Acceptance Test Cases.
          </h1>

          <p style={{
            marginTop: 18, color: 'var(--fg-2)', maxWidth: 480, fontSize: 14, lineHeight: 1.6,
          }}>
            Built around the <strong style={{ color: 'var(--fg-0)', fontWeight: 600 }}>IQL</strong> methodology and the
            <strong style={{ color: 'var(--fg-0)', fontWeight: 600 }}> KATA</strong> architecture — for QA engineers who think in
            reusable test cases, not freeform steps. Manual, agentic, and CI execution converge on the same source of truth.
          </p>

          {/* feature ticks */}
          <ul style={{ marginTop: 22, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', maxWidth: 520 }}>
            {[
              ['IQL',  'Integrated Quality Lifecycle — the methodology that spans story → case → run → bug.'],
              ['ATC',  'Acceptance Test Case — one observable behaviour, executable by humans or agents.'],
              ['KATA', 'Komponent Action Test Architecture — how ATCs assemble into a real automated test.'],
              ['×3',   'Manual · Agentic · CI execution. Same schema, same reports.'],
              ['OSS',  'Apache-2.0. Self-host with one docker compose, or use cloud.'],
            ].map(([k, v]) => (
              <React.Fragment key={k}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', alignSelf: 'center' }}>{k}</span>
                <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>{v}</span>
              </React.Fragment>
            ))}
          </ul>
        </div>

        <footer style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--fg-3)', fontSize: 11.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span className="mono">$ docker compose up</span>
            <span>·</span>
            <a href="#" style={{ color: 'var(--fg-3)', textDecoration: 'none' }}>github.com/bunkai-tms</a>
            <span>·</span>
            <a href="#" style={{ color: 'var(--fg-3)', textDecoration: 'none' }}>docs</a>
          </div>
          <span>Apache-2.0 · © Bunkai contributors</span>
        </footer>
      </section>

      {/* RIGHT — auth panel */}
      <section style={{
        background: 'var(--bg-1)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '48px 44px',
      }}>
        <div style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}>
          <div style={{ marginBottom: 24 }}>
            <div className="mono" style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: 8 }}>
              SIGN IN
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--fg-0)' }}>
              Continue to your workspace
            </h2>
            <p style={{ marginTop: 8, color: 'var(--fg-3)', fontSize: 13, lineHeight: 1.55 }}>
              Authenticate with your code-forge identity. SSO and SAML available on self-hosted instances.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn" data-size="lg" onClick={() => window.__bunkaiLogin && window.__bunkaiLogin()}
              style={{ width: '100%', justifyContent: 'center', background: '#0d1117', borderColor: 'var(--stroke-3)' }}>
              <window.Icon.Github size={16} />
              Continue with GitHub
            </button>
            <button className="btn" data-size="lg"
              style={{ width: '100%', justifyContent: 'center' }}>
              <window.Icon.Google size={15} />
              Continue with Google
            </button>
          </div>

          <div style={{ margin: '18px 0 14px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-4)', fontSize: 11 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--stroke-1)' }} />
            OR
            <div style={{ flex: 1, height: 1, background: 'var(--stroke-1)' }} />
          </div>

          <div
            onMouseEnter={() => setHoverHost(true)} onMouseLeave={() => setHoverHost(false)}
            style={{
              padding: 12, borderRadius: 'var(--r-3)',
              background: 'var(--bg-2)',
              border: '1px solid var(--stroke-2)',
              transition: 'border-color 120ms ease',
              borderColor: hoverHost ? 'var(--stroke-3)' : 'var(--stroke-2)',
              cursor: 'pointer',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <window.Icon.Terminal size={14} color="var(--fg-2)" />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-1)' }}>Self-hosted instance</div>
                  <div style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>Connect to your own Bunkai server</div>
                </div>
              </div>
              <window.Icon.ArrowRight size={14} color="var(--fg-3)" />
            </div>
            {hoverHost && (
              <div className="mono" style={{
                marginTop: 10, padding: '6px 8px', borderRadius: 3,
                background: 'var(--bg-0)', border: '1px solid var(--stroke-1)',
                fontSize: 11, color: 'var(--fg-2)', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ color: 'var(--fg-3)' }}>https://</span>
                <span>qa.your-org.dev</span>
                <span className="caret" />
              </div>
            )}
          </div>

          <div style={{ marginTop: 28, padding: '12px 0', borderTop: '1px solid var(--stroke-1)', fontSize: 11.5, color: 'var(--fg-3)', lineHeight: 1.6 }}>
            Open-source, self-hostable, Apache-2.0. Your test specifications stay on your servers — Bunkai never reaches for the cloud unless you tell it to.
          </div>

          <button
            onClick={() => nav('home')}
            className="btn" data-variant="primary" data-size="lg"
            style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}>
            Demo · Skip to workspace
            <window.Icon.ArrowRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}

window.LoginScreen = LoginScreen;
