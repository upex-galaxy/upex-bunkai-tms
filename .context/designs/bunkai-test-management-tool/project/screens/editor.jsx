// Screen 4 — ATC Editor (create / edit)
const { useState: useStateE } = React;

function EditorScreen() {
  const { Icon, useRouter, Shell, Topbar, BunkaiData } = window;
  const { nav, route } = useRouter();
  const initial = BunkaiData.focusATC;
  const isNew = route.params?.id === 'new';

  const [form, setForm] = useStateE({
    title: isNew ? '' : initial.title,
    module: isNew ? '' : initial.module,
    storyQuery: isNew ? '' : initial.story.id + ' — ' + initial.story.title.slice(0, 64),
    storySelected: isNew ? null : { id: initial.story.id, title: initial.story.title },
    acIds: isNew ? [] : initial.acceptanceCriteria.filter(a => a.selected).map(a => a.id),
    layer: isNew ? 'UI' : initial.layer,
    steps: isNew ? [{ id: 1, text: '' }] : initial.steps.map(s => ({ ...s })),
    assertions: isNew ? [] : [...initial.assertions],
    tags: isNew ? [] : [...initial.tags],
    assertionInput: '',
    tagInput: '',
    storyOpen: false,
  });

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addStep = () => setForm(f => ({ ...f, steps: [...f.steps, { id: f.steps.length + 1, text: '' }] }));
  const updateStep = (i, text) => setForm(f => { const next = [...f.steps]; next[i] = { ...next[i], text }; return { ...f, steps: next }; });
  const removeStep = (i) => setForm(f => ({ ...f, steps: f.steps.filter((_, j) => j !== i).map((s, j) => ({ ...s, id: j + 1 })) }));

  const addAssertion = () => {
    if (!form.assertionInput.trim()) return;
    setForm(f => ({ ...f, assertions: [...f.assertions, f.assertionInput.trim()], assertionInput: '' }));
  };
  const removeAssertion = (i) => setForm(f => ({ ...f, assertions: f.assertions.filter((_, j) => j !== i) }));

  const addTag = () => {
    if (!form.tagInput.trim()) return;
    setForm(f => ({ ...f, tags: [...f.tags, f.tagInput.trim().toLowerCase()], tagInput: '' }));
  };
  const removeTag = (i) => setForm(f => ({ ...f, tags: f.tags.filter((_, j) => j !== i) }));

  const toggleAC = (id) => setForm(f => ({
    ...f,
    acIds: f.acIds.includes(id) ? f.acIds.filter(x => x !== id) : [...f.acIds, id],
  }));

  // mock story suggestions
  const storySuggestions = [
    { id: 'US-742', title: 'Returning customer · clear promo-code feedback' },
    { id: 'US-748', title: 'Cart preserves selection across cross-device sign-in' },
    { id: 'US-751', title: 'Apply combined promo + loyalty discount within cap' },
    { id: 'US-755', title: 'Surface inline tax breakdown at checkout' },
  ];

  return (
    <Shell
      topbar={
        <Topbar
          left={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn" data-variant="ghost" data-icon-only data-size="sm"
                onClick={() => nav('project', { id: 'checkout-revamp' })}>
                <Icon.ChevronLeft size={13} />
              </button>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
                {isNew ? 'NEW ATC' : initial.id}
              </span>
              <span className="dot" data-status="fail" />
              <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>
                {isNew ? 'unsaved draft' : 'editing'}
              </span>
              <span className="hint" style={{ marginLeft: 8 }}>· Auto-saved 12s ago</span>
            </div>
          }
          right={
            <>
              <button className="btn" data-size="sm" data-variant="ghost"><Icon.Eye size={11} /> Preview only</button>
              <span className="v-divider" style={{ height: 16 }} />
              <button className="btn" data-size="sm"><Icon.Play size={11} /> Run draft</button>
              <button className="btn" data-size="sm" data-variant="ghost"
                onClick={() => nav('project', { id: 'checkout-revamp' })}>Cancel</button>
              <button className="btn" data-variant="primary" data-size="sm">
                Save ATC <span className="kbd">⌘</span><span className="kbd">S</span>
              </button>
            </>
          }
        />
      }
    >
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0, overflow: 'hidden' }}>
        {/* ====== LEFT: FORM ====== */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--stroke-1)', overflow: 'hidden' }}>
          <PanelHeader title="Compose" hint="Form · ATC source of truth" />
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 80px', display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 720 }}>

            <label className="field">
              <span className="field-label">Title <span className="hint">required</span></span>
              <input className="input" value={form.title} onChange={e => setField('title', e.target.value)}
                placeholder="A single observable behaviour — start with a verb"
                style={{ fontSize: 14, fontWeight: 600, padding: '9px 11px' }} />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
              <label className="field">
                <span className="field-label">Module</span>
                <button className="input" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <span style={{ color: form.module ? 'var(--fg-0)' : 'var(--fg-4)' }}>
                    {form.module || 'Select module…'}
                  </span>
                  <Icon.ChevronDown size={11} color="var(--fg-3)" />
                </button>
              </label>
              <label className="field">
                <span className="field-label">Layer</span>
                <div className="seg" style={{ padding: 2, width: '100%' }}>
                  {['UI', 'API', 'Unit'].map(l => (
                    <button key={l} aria-pressed={form.layer === l}
                      onClick={() => setField('layer', l)}
                      style={{ flex: 1, justifyContent: 'center' }}>
                      <span className="dot" style={{
                        background: l === 'UI' ? 'var(--layer-ui)' : l === 'API' ? 'var(--layer-api)' : 'var(--layer-unit)',
                      }} />
                      {l}
                    </button>
                  ))}
                </div>
              </label>
            </div>

            {/* User story — autocomplete */}
            <div style={{ position: 'relative' }}>
              <label className="field">
                <span className="field-label">
                  User story <span className="hint">required · search</span>
                </span>
                <div style={{ position: 'relative' }}>
                  <input className="input"
                    value={form.storyQuery}
                    onChange={e => setField('storyQuery', e.target.value)}
                    onFocus={() => setField('storyOpen', true)}
                    onBlur={() => setTimeout(() => setField('storyOpen', false), 150)}
                    placeholder="US-… or paste a Jira/Linear ID, or type to search"
                    style={{ paddingLeft: 28 }} />
                  <Icon.Search size={12} color="var(--fg-3)" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)' }} />
                </div>
              </label>
              {form.storyOpen && (
                <div style={{
                  position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)',
                  background: 'var(--bg-3)', border: '1px solid var(--stroke-3)',
                  borderRadius: 'var(--r-3)', boxShadow: 'var(--shadow-pop)', zIndex: 10,
                  padding: 4,
                }}>
                  <div style={{ padding: '6px 10px', fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
                    Matching stories
                  </div>
                  {storySuggestions.map((s, i) => (
                    <button key={s.id}
                      onMouseDown={() => {
                        setForm(f => ({ ...f, storySelected: s, storyQuery: s.id + ' — ' + s.title, storyOpen: false }));
                      }}
                      style={{
                        appearance: 'none', border: 0, cursor: 'pointer', width: '100%',
                        textAlign: 'left', padding: '7px 10px', borderRadius: 3,
                        background: i === 0 ? 'var(--bg-4)' : 'transparent',
                        display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-4)'}
                      onMouseLeave={e => e.currentTarget.style.background = i === 0 ? 'var(--bg-4)' : 'transparent'}
                    >
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--accent)', fontWeight: 600 }}>{s.id}</span>
                      <span style={{ color: 'var(--fg-1)', fontSize: 12.5 }}>{s.title}</span>
                      <Icon.ArrowUpRight size={11} color="var(--fg-3)" />
                    </button>
                  ))}
                  <div style={{ padding: '6px 10px', borderTop: '1px solid var(--stroke-1)', marginTop: 4,
                    fontSize: 11, color: 'var(--fg-3)', display: 'flex', justifyContent: 'space-between' }}>
                    <span><span className="kbd">↑↓</span> navigate · <span className="kbd">⏎</span> select</span>
                    <span><span className="kbd">⌘</span><span className="kbd">N</span> new story</span>
                  </div>
                </div>
              )}
            </div>

            {/* Acceptance criteria */}
            <div className="field">
              <span className="field-label">
                Acceptance criteria <span className="hint">{form.acIds.length} selected from {initial.acceptanceCriteria.length}</span>
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {initial.acceptanceCriteria.map(ac => {
                  const sel = form.acIds.includes(ac.id);
                  return (
                    <button key={ac.id} onClick={() => toggleAC(ac.id)}
                      style={{
                        appearance: 'none', cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'flex-start', gap: 8,
                        padding: '7px 10px',
                        background: sel ? 'var(--accent-soft)' : 'var(--bg-2)',
                        border: '1px solid ' + (sel ? 'rgba(217,84,63,0.35)' : 'var(--stroke-2)'),
                        borderRadius: 'var(--r-2)',
                        color: sel ? 'var(--fg-0)' : 'var(--fg-2)',
                        textAlign: 'left',
                        fontSize: 12,
                        maxWidth: '100%',
                      }}>
                      <span className="mono" style={{ fontSize: 10.5, color: sel ? 'var(--accent)' : 'var(--fg-3)', fontWeight: 600, paddingTop: 1 }}>{ac.id}</span>
                      <span>{ac.text}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Steps */}
            <div className="field">
              <span className="field-label">
                Steps <span className="hint">{form.steps.length} · drag to reorder</span>
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {form.steps.map((s, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '18px 26px 1fr 20px',
                    gap: 6, alignItems: 'center',
                  }}>
                    <span style={{ cursor: 'grab', color: 'var(--fg-4)', display: 'inline-flex', justifyContent: 'center' }}>
                      <Icon.GripV size={12} />
                    </span>
                    <span className="mono" style={{
                      textAlign: 'center', fontSize: 11, color: 'var(--fg-3)',
                      background: 'var(--bg-2)', borderRadius: 3, padding: '5px 0',
                      border: '1px solid var(--stroke-2)',
                    }}>{String(i + 1).padStart(2, '0')}</span>
                    <input className="input" value={s.text} onChange={e => updateStep(i, e.target.value)}
                      placeholder={i === 0 ? 'Open checkout with a cart of 2+ items…' : 'next step…'} />
                    <button className="btn" data-variant="ghost" data-icon-only data-size="sm" onClick={() => removeStep(i)}>
                      <Icon.X size={11} color="var(--fg-3)" />
                    </button>
                  </div>
                ))}
                <button onClick={addStep} className="btn" data-variant="ghost" data-size="sm"
                  style={{ alignSelf: 'flex-start', marginTop: 4, color: 'var(--fg-2)' }}>
                  <Icon.Plus size={11} /> Add step
                </button>
              </div>
            </div>

            {/* Assertions */}
            <div className="field">
              <span className="field-label">
                Assertions <span className="hint">type and press Enter · checked by every executor</span>
              </span>
              <div style={{
                padding: 10, background: 'var(--bg-2)', border: '1px solid var(--stroke-2)',
                borderRadius: 'var(--r-3)',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                {form.assertions.map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 8px',
                    background: 'var(--bg-0)', border: '1px solid var(--stroke-1)',
                    borderRadius: 3, fontFamily: 'var(--font-mono)', fontSize: 11.5,
                  }}>
                    <span style={{ color: 'var(--accent)' }}>›</span>
                    <span style={{ flex: 1, color: 'var(--fg-1)' }}>{a}</span>
                    <span onClick={() => removeAssertion(i)} style={{ cursor: 'pointer', color: 'var(--fg-3)', display: 'inline-flex' }}>
                      <Icon.X size={11} />
                    </span>
                  </div>
                ))}
                <input
                  className="input mono"
                  placeholder="assertion.expression == expected"
                  value={form.assertionInput}
                  onChange={e => setField('assertionInput', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAssertion(); } }}
                  style={{ background: 'var(--bg-0)', fontSize: 11.5 }} />
              </div>
            </div>

            {/* Tags */}
            <div className="field">
              <span className="field-label">Tags</span>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center',
                padding: 6, background: 'var(--bg-2)', border: '1px solid var(--stroke-2)',
                borderRadius: 'var(--r-2)',
              }}>
                {form.tags.map((t, i) => (
                  <span key={i} className="tag">
                    {t}
                    <span className="x" onClick={() => removeTag(i)}><Icon.X size={9} /></span>
                  </span>
                ))}
                <input
                  value={form.tagInput}
                  onChange={e => setField('tagInput', e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                  placeholder={form.tags.length ? '' : 'regression, smoke, P1…'}
                  style={{
                    flex: 1, minWidth: 100, padding: '2px 4px',
                    background: 'transparent', border: 0, outline: 'none',
                    color: 'var(--fg-0)', fontFamily: 'var(--font-mono)', fontSize: 11.5,
                  }} />
              </div>
            </div>
          </div>
        </div>

        {/* ====== RIGHT: PREVIEW ====== */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-1)' }}>
          <PanelHeader title="Live preview" hint="This is what test runners and AI agents will see" right={
            <span className="chip" style={{ background: 'var(--running-bg)', color: 'var(--running)', borderColor: 'rgba(79,140,247,0.25)' }}>
              <span className="dot" data-status="running" /> read-only
            </span>
          } />
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 60px' }}>
            <PreviewCard form={form} initial={initial} />
          </div>
        </div>
      </div>
    </Shell>
  );
}

function PanelHeader({ title, hint, right }) {
  return (
    <div style={{
      height: 32, flexShrink: 0,
      padding: '0 16px',
      borderBottom: '1px solid var(--stroke-1)',
      background: 'var(--bg-1)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-0)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title}</span>
        <span className="hint">{hint}</span>
      </div>
      {right}
    </div>
  );
}

function PreviewCard({ form, initial }) {
  const { Icon } = window;
  const story = form.storySelected || initial.story;
  const selectedAC = initial.acceptanceCriteria.filter(ac => form.acIds.includes(ac.id));
  return (
    <div className="card" style={{ padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{initial.id}</span>
        <span className="chip" data-layer={form.layer}>{form.layer}</span>
        <span className="chip" data-status="skipped">draft</span>
        <span className="hint mono" style={{ fontSize: 11 }}>· {form.module || '—'}</span>
      </div>
      <h2 style={{
        margin: 0, fontSize: 17, fontWeight: 700,
        color: form.title ? 'var(--fg-0)' : 'var(--fg-4)',
        letterSpacing: '-0.01em',
      }}>
        {form.title || 'Untitled ATC — start typing on the left'}
      </h2>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--stroke-1)' }}>
        <SectionLabel>Linked user story</SectionLabel>
        {story ? (
          <div style={{ marginTop: 6, padding: 10, background: 'var(--bg-3)', borderRadius: 'var(--r-2)', display: 'flex', gap: 10 }}>
            <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>{story.id}</span>
            <span style={{ fontSize: 12.5, color: 'var(--fg-1)', lineHeight: 1.5 }}>{story.title}</span>
          </div>
        ) : <div className="placeholder-stripes" style={{ height: 40, marginTop: 6 }} />}
        {selectedAC.length > 0 && (
          <ul style={{ marginTop: 10, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {selectedAC.map(ac => (
              <li key={ac.id} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--fg-1)' }}>
                <span style={{ color: 'var(--accent)' }}>✓</span>
                <span className="mono" style={{ color: 'var(--fg-3)', fontSize: 10.5, minWidth: 56 }}>{ac.id}</span>
                {ac.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--stroke-1)' }}>
        <SectionLabel>Steps</SectionLabel>
        <ol style={{ marginTop: 8, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {form.steps.filter(s => s.text).length === 0 && (
            <li className="placeholder-stripes" style={{ height: 48 }} />
          )}
          {form.steps.filter(s => s.text).map((s, i) => (
            <li key={i} style={{
              display: 'grid', gridTemplateColumns: '24px 1fr', gap: 10, alignItems: 'baseline',
              padding: '5px 0',
            }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{String(i + 1).padStart(2, '0')}.</span>
              <span style={{ color: 'var(--fg-1)', fontSize: 13 }}>{s.text}</span>
            </li>
          ))}
        </ol>
      </div>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--stroke-1)' }}>
        <SectionLabel>Assertions</SectionLabel>
        <div style={{ marginTop: 8, padding: 10, background: 'var(--bg-0)', borderRadius: 3, border: '1px solid var(--stroke-1)' }}>
          {form.assertions.length === 0 && (
            <div className="hint mono" style={{ fontSize: 11.5 }}># no assertions defined — preview will pass on any output</div>
          )}
          {form.assertions.map((a, i) => (
            <div key={i} className="mono" style={{ fontSize: 11.5, color: 'var(--fg-1)' }}>
              <span style={{ color: 'var(--accent)' }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ color: 'var(--fg-4)' }}> │ </span>
              {a}
            </div>
          ))}
        </div>
      </div>

      {form.tags.length > 0 && (
        <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {form.tags.map((t, i) => <span key={i} className="tag">{t}</span>)}
        </div>
      )}

      <div style={{ marginTop: 18, paddingTop: 12, borderTop: '1px solid var(--stroke-1)',
        display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--fg-3)' }}>
        <span className="mono">schema · atc.v1</span>
        <span><Icon.Sparkle size={10} style={{ verticalAlign: -2 }} /> Updated live as you edit</span>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      font: '600 10.5px/1 var(--font-sans)',
      letterSpacing: '0.06em', textTransform: 'uppercase',
      color: 'var(--fg-3)',
    }}>{children}</div>
  );
}

Object.assign(window, { EditorScreen });
