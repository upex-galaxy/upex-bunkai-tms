// Screen 5 — Manual Test Run
const { useState: useStateR } = React;

function RunScreen() {
  const { Icon, useRouter, BunkaiData } = window;
  const { nav } = useRouter();
  const run = BunkaiData.manualRun;

  const [results, setResults] = useStateR(run.steps.map(s => s.result));
  const [active, setActive] = useStateR(run.currentStep);
  const [notes, setNotes] = useStateR('');
  const [bugOpen, setBugOpen] = useStateR(true);

  const mark = (verdict) => {
    setResults(prev => { const next = [...prev]; next[active] = verdict; return next; });
    if (active < run.steps.length - 1) {
      setActive(active + 1);
      setNotes('');
    }
  };

  const done = results.filter(r => r === 'pass' || r === 'fail' || r === 'blocked').length;
  const passed = results.filter(r => r === 'pass').length;
  const failed = results.filter(r => r === 'fail').length;
  const blocked = results.filter(r => r === 'blocked').length;
  const progress = Math.round((done / run.steps.length) * 100);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)', overflow: 'hidden' }}>
      {/* Top bar */}
      <header style={{
        minHeight: 52, flexShrink: 0,
        borderBottom: '1px solid var(--stroke-1)',
        padding: '8px 14px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        rowGap: 8, columnGap: 16,
        background: 'var(--bg-1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <button className="btn" data-variant="ghost" data-size="sm"
            onClick={() => nav('home')}>
            <Icon.ChevronLeft size={12} /> Exit
          </button>
          <span className="v-divider" style={{ height: 22 }} />
          <window.Logo size={16} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 320px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{run.id} · {run.test.code}</span>
            <span style={{ fontWeight: 600, color: 'var(--fg-0)', fontSize: 13, whiteSpace: 'nowrap' }}>{run.test.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-2)', whiteSpace: 'nowrap' }}>
              Step <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{active + 1}</span> of {run.steps.length}
            </span>
            <div style={{ width: 'min(320px, 50vw)', minWidth: 120 }}>
              <SegProgress steps={results} active={active} />
            </div>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
              <span style={{ color: 'var(--pass)' }}>{passed} pass</span> · <span style={{ color: 'var(--fail)' }}>{failed} fail</span> · <span style={{ color: 'var(--blocked)' }}>{blocked} blk</span>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button className="btn" data-size="sm" data-variant="ghost">Pause</button>
          <button className="btn" data-size="sm" data-variant="danger"><Icon.Stop size={11} /> Abort</button>
        </div>
      </header>

      {/* Body: left rail (test outline) + center (active step + notes) + right (bug drawer) */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'grid',
        gridTemplateColumns: bugOpen ? '260px 1fr 380px' : '260px 1fr 0px',
        overflow: 'hidden',
        transition: 'grid-template-columns 200ms ease',
      }}>

        {/* LEFT: outline */}
        <aside style={{
          borderRight: '1px solid var(--stroke-1)',
          background: 'var(--bg-1)',
          overflow: 'auto',
          padding: '14px 10px 24px',
        }}>
          <div style={{
            fontSize: 10.5, fontWeight: 600, color: 'var(--fg-3)',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '4px 8px 10px',
          }}>Test outline</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {run.steps.map((s, i) => {
              const r = results[i];
              const isActive = i === active;
              return (
                <button key={s.id} onClick={() => setActive(i)}
                  style={{
                    appearance: 'none', cursor: 'pointer', textAlign: 'left',
                    border: 0,
                    display: 'grid',
                    gridTemplateColumns: '22px auto 1fr',
                    gap: 8, alignItems: 'flex-start',
                    padding: '7px 8px',
                    borderRadius: 4,
                    background: isActive ? 'var(--accent-soft)' : 'transparent',
                    color: isActive ? 'var(--fg-0)' : 'var(--fg-1)',
                    borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-2)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <StepGlyph index={i + 1} result={r} active={isActive} />
                  <span className="chip" data-layer={s.layer} style={{ height: 14, padding: '0 4px', fontSize: 9.5 }}>{s.layer}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>{s.atc}</div>
                    <div style={{ fontSize: 12, color: isActive ? 'var(--fg-0)' : 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.title}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 16, padding: '8px 10px', borderTop: '1px solid var(--stroke-1)' }}>
            <div style={{ fontSize: 10.5, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>
              Executor
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 20, height: 20, borderRadius: 3,
                background: 'linear-gradient(135deg, #d9543f, #b73a28)', color: '#fff',
                fontSize: 10, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>MT</div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--fg-0)', fontWeight: 600 }}>mariko.t</div>
                <div className="hint" style={{ fontSize: 10.5 }}>manual · keyboard</div>
              </div>
            </div>
          </div>
        </aside>

        {/* CENTER: active step card + notes */}
        <main style={{ overflow: 'auto', padding: '24px 32px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100%', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* eyebrow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.06em' }}>
                STEP {String(active + 1).padStart(2, '0')} / {String(run.steps.length).padStart(2, '0')}
              </span>
              <span className="chip" data-layer={run.steps[active].layer}>{run.steps[active].layer}</span>
              <span className="mono hint" style={{ fontSize: 11 }}>{run.steps[active].atc}</span>
            </div>

            <h1 style={{
              margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em',
              color: 'var(--fg-0)', lineHeight: 1.2,
            }}>
              {run.steps[active].title}
            </h1>

            {/* The actual step card */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                padding: '10px 14px', borderBottom: '1px solid var(--stroke-1)',
                background: 'var(--bg-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-2)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Follow these steps
                </span>
                <span className="hint mono" style={{ fontSize: 11 }}>do not skip</span>
              </div>
              <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {run.steps[active].steps.map((line, i) => {
                  const isActiveLine = i === 0; // first sub-step is "now"
                  return (
                    <li key={i} style={{
                      display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 0,
                      borderTop: i === 0 ? 'none' : '1px solid var(--stroke-1)',
                      background: isActiveLine ? 'rgba(217,84,63,0.05)' : 'transparent',
                    }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        borderRight: '1px solid var(--stroke-1)',
                        background: 'rgba(255,255,255,0.02)',
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        color: isActiveLine ? 'var(--accent)' : 'var(--fg-3)',
                        fontWeight: 600,
                      }}>{String(i + 1).padStart(2, '0')}</span>
                      <span style={{ padding: '11px 14px', fontSize: 13.5, color: 'var(--fg-1)', lineHeight: 1.5 }}>
                        {line}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', padding: '11px 14px', minWidth: isActiveLine ? 56 : 0 }}>
                        {isActiveLine && <span className="hint mono" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>← now</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Verdict buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <VerdictBtn kind="pass"    label="Pass"    kbd="P" onClick={() => mark('pass')} />
              <VerdictBtn kind="fail"    label="Fail"    kbd="F" onClick={() => mark('fail')} />
              <VerdictBtn kind="blocked" label="Block"   kbd="B" onClick={() => mark('blocked')} />
            </div>

            {/* Notes + bug */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{
                padding: '8px 12px', borderBottom: '1px solid var(--stroke-1)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-2)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Notes & evidence <span className="hint" style={{ marginLeft: 6, textTransform: 'none' }}>optional · attached to step result</span>
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn" data-variant="ghost" data-size="sm">📎 Attach</button>
                  <button className="btn" data-variant="ghost" data-size="sm">URL</button>
                  <span className="v-divider" style={{ height: 14 }} />
                  <button className="btn" data-size="sm" data-variant="danger" onClick={() => setBugOpen(true)}>
                    <Icon.Bug size={11} /> Report bug
                  </button>
                </div>
              </div>
              <textarea
                className="textarea"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={`What did you observe?  paste screenshot URL, console error, expected vs actual…`}
                style={{
                  border: 0, borderRadius: 0, background: 'transparent',
                  minHeight: 80, padding: '10px 14px', fontSize: 12.5,
                  resize: 'vertical', width: '100%',
                }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--fg-3)' }}>
              <span><span className="kbd">P</span> pass · <span className="kbd">F</span> fail · <span className="kbd">B</span> block · <span className="kbd">⌘</span><span className="kbd">↵</span> next step · <span className="kbd">⌘</span><span className="kbd">B</span> bug</span>
              <span className="mono">{progress}% complete</span>
            </div>
          </div>
        </main>

        {/* RIGHT: bug drawer */}
        {bugOpen && (
          <BugDrawer onClose={() => setBugOpen(false)} run={run} step={run.steps[active]} />
        )}
      </div>
    </div>
  );
}

function SegProgress({ steps, active }) {
  return (
    <div style={{ display: 'flex', gap: 2, height: 6 }}>
      {steps.map((r, i) => {
        const bg = r === 'pass' ? 'var(--pass)' :
                   r === 'fail' ? 'var(--fail)' :
                   r === 'blocked' ? 'var(--blocked)' :
                   i === active ? 'var(--accent)' :
                   'rgba(255,255,255,0.08)';
        return <span key={i} style={{
          flex: 1, background: bg, borderRadius: 1,
          boxShadow: i === active && !r ? '0 0 0 2px rgba(217,84,63,0.25)' : 'none',
        }} />;
      })}
    </div>
  );
}

function StepGlyph({ index, result, active }) {
  const { Icon } = window;
  if (result === 'pass')    return <span style={badge('var(--pass-bg)', 'var(--pass)')}><Icon.Check size={11} color="var(--pass)" /></span>;
  if (result === 'fail')    return <span style={badge('var(--fail-bg)', 'var(--fail)')}><Icon.X size={11} color="var(--fail)" /></span>;
  if (result === 'blocked') return <span style={badge('var(--blocked-bg)', 'var(--blocked)')}><span className="mono" style={{ fontSize: 11, color: 'var(--blocked)' }}>!</span></span>;
  if (active) return <span style={badge('var(--accent-soft)', 'var(--accent)')}>
    <span className="mono" style={{ fontSize: 10.5, color: 'var(--accent)', fontWeight: 700 }}>{String(index).padStart(2, '0')}</span>
  </span>;
  return <span style={badge('transparent', 'var(--stroke-3)')}>
    <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>{String(index).padStart(2, '0')}</span>
  </span>;
}

function badge(bg, border) {
  return {
    width: 22, height: 22, borderRadius: 4,
    background: bg, border: `1px solid ${border}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  };
}

function VerdictBtn({ kind, label, kbd, onClick }) {
  const { Icon } = window;
  const map = {
    pass:    { c: 'var(--pass)',    bg: 'var(--pass-bg)',    bd: 'rgba(47,182,115,0.30)',  I: Icon.Check },
    fail:    { c: 'var(--fail)',    bg: 'var(--fail-bg)',    bd: 'rgba(229,72,77,0.30)',   I: Icon.X },
    blocked: { c: 'var(--blocked)', bg: 'var(--blocked-bg)', bd: 'rgba(232,168,56,0.30)',  I: null },
  };
  const v = map[kind];
  return (
    <button onClick={onClick} style={{
      appearance: 'none', cursor: 'pointer',
      padding: '14px 16px',
      borderRadius: 'var(--r-3)',
      background: v.bg,
      border: '1px solid ' + v.bd,
      color: v.c,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      transition: 'background 120ms ease, border-color 120ms ease, transform 120ms ease',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = v.bg; }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 22, height: 22, borderRadius: 4,
          background: 'rgba(255,255,255,0.04)', border: '1px solid currentColor',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {v.I ? <v.I size={12} color={v.c} /> : <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>!</span>}
        </span>
        <span style={{ font: '600 14px/1 var(--font-sans)' }}>{label}</span>
      </span>
      <span className="kbd" style={{ borderColor: 'currentColor', color: v.c }}>{kbd}</span>
    </button>
  );
}

function BugDrawer({ onClose, run, step }) {
  const { Icon } = window;
  const [severity, setSeverity] = useStateR('P2');
  return (
    <aside style={{
      borderLeft: '1px solid var(--stroke-1)',
      background: 'var(--bg-1)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <header style={{
        height: 40, flexShrink: 0,
        padding: '0 14px',
        borderBottom: '1px solid var(--stroke-1)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon.Bug size={13} color="var(--fail)" />
          <span style={{ fontWeight: 600, fontSize: 12.5 }}>Report bug</span>
          <span className="hint">· draft</span>
        </div>
        <button className="btn" data-variant="ghost" data-icon-only data-size="sm" onClick={onClose}>
          <Icon.Close size={12} />
        </button>
      </header>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px 14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label className="field">
          <span className="field-label">Title <span className="hint">one sentence</span></span>
          <input className="input" placeholder="Stepper reverts when navigating back after MFA"
            defaultValue="MFA prompt skipped when 'Remember device' is unchecked" />
        </label>

        <div>
          <span className="field-label" style={{
            font: '600 10.5px/1 var(--font-sans)', letterSpacing: '0.04em',
            textTransform: 'uppercase', color: 'var(--fg-3)', display: 'flex', justifyContent: 'space-between', marginBottom: 6,
          }}>
            <span>Severity</span><span className="hint">P1 highest · P4 lowest</span>
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
            {['P1','P2','P3','P4'].map(p => (
              <button key={p} onClick={() => setSeverity(p)}
                style={{
                  appearance: 'none', cursor: 'pointer',
                  padding: '7px 8px', borderRadius: 4,
                  background: severity === p ? 'var(--accent-soft)' : 'var(--bg-2)',
                  border: '1px solid ' + (severity === p ? 'var(--accent)' : 'var(--stroke-2)'),
                  color: severity === p ? 'var(--fg-0)' : 'var(--fg-2)',
                  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                }}>{p}</button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">Module <span className="hint">auto from current test context</span></span>
          <input className="input" defaultValue="Auth Service › Sign-in › MFA"
            style={{ background: 'var(--bg-3)', color: 'var(--fg-1)' }} readOnly />
        </label>

        <label className="field">
          <span className="field-label">Description</span>
          <textarea className="textarea" placeholder="What happens? What should happen?"
            defaultValue="When 'Remember this device for 30 days' is not selected, the next sign-in still skips the MFA challenge. Audit log shows two consecutive `signin` events without an `mfa_verified` row." />
        </label>

        <label className="field">
          <span className="field-label">Steps to reproduce <span className="hint">copied from active step</span></span>
          <div style={{
            padding: 10, background: 'var(--bg-2)', border: '1px solid var(--stroke-2)',
            borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-1)',
            lineHeight: 1.6,
          }}>
            <div style={{ color: 'var(--fg-3)' }}># from {run.id} · {step.atc}</div>
            {step.steps.map((l, i) => (
              <div key={i}><span style={{ color: 'var(--fg-3)' }}>{String(i + 1).padStart(2, '0')}.</span> {l}</div>
            ))}
          </div>
        </label>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {['auth', 'mfa', 'regression', `linked:${run.id}`].map(t => <span key={t} className="tag">{t}</span>)}
        </div>
      </div>

      <footer style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--stroke-1)',
        background: 'var(--bg-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span className="hint" style={{ fontSize: 11 }}>
          Linked to <span className="mono" style={{ color: 'var(--fg-2)' }}>{run.id}</span> · <span className="mono" style={{ color: 'var(--fg-2)' }}>{step.atc}</span>
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn" data-size="sm" data-variant="ghost" onClick={onClose}>Discard</button>
          <button className="btn" data-size="sm" data-variant="primary">
            <Icon.Bug size={11} /> Save bug
          </button>
        </div>
      </footer>
    </aside>
  );
}

Object.assign(window, { RunScreen });
