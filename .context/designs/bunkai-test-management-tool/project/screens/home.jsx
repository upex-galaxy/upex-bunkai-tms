// Screen 2 — Workspace Home

function HomeScreen() {
  const { Icon, useRouter, Shell, Topbar, BunkaiData } = window;
  const { nav } = useRouter();
  const { projects, activity, activeRuns } = BunkaiData;

  // four KPIs
  const kpis = [
    { label: 'Total ATCs',  value: '623',  delta: '+18 this week',    accent: false },
    { label: 'Active runs', value: '3',    delta: '2 running · 1 blocked', accent: true },
    { label: 'Open bugs',   value: '33',   delta: '7 P1 · 12 P2 · 14 P3+',  accent: false },
    { label: 'Coverage',    value: '78%',  delta: '+4.2 vs last sprint',   accent: false },
  ];

  return (
    <Shell
      topbar={
        <Topbar
          left={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon.Home size={13} color="var(--fg-3)" />
              <span style={{ fontWeight: 600, color: 'var(--fg-1)', fontSize: 12.5 }}>Home</span>
              <span className="hint" style={{ marginLeft: 6 }}>· upex-galaxy workspace</span>
            </div>
          }
          right={
            <>
              <button className="btn" data-variant="ghost" data-size="sm">
                <Icon.CMD size={12} /> Command palette <span className="kbd">⌘</span><span className="kbd">K</span>
              </button>
              <span className="v-divider" style={{ height: 16, margin: '0 4px' }} />
              <button className="btn" data-size="sm"><Icon.Plus size={12} /> New project</button>
            </>
          }
        />
      }
    >
      <div style={{
        flex: 1, overflow: 'auto',
        padding: '24px 28px 40px',
        display: 'flex', flexDirection: 'column', gap: 20,
        maxWidth: 1480, width: '100%', alignSelf: 'center',
      }}>

        {/* greeting */}
        <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.06em', marginBottom: 6 }}>
              SPRINT 24-Q2 · DAY 7 / 10
            </div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--fg-0)' }}>
              Welcome back, Mariko.
            </h1>
            <div className="hint" style={{ marginTop: 4 }}>
              4 ATCs and 2 tests changed since you last signed off. Two runs are currently executing.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="btn" data-size="sm"><Icon.Refresh size={12} /> Sync</button>
            <button className="btn" data-size="sm"><Icon.Filter size={12} /> Filter</button>
            <button className="btn" data-variant="primary" data-size="sm"><Icon.Plus size={12} /> Start run</button>
          </div>
        </header>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {kpis.map((k, i) => (
            <div key={i} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>
                  {k.label}
                </span>
                <Icon.ArrowUpRight size={12} color="var(--fg-4)" />
              </div>
              <div style={{
                marginTop: 8, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em',
                color: k.accent ? 'var(--accent)' : 'var(--fg-0)',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1,
              }}>
                {k.value}
              </div>
              <div className="hint" style={{ marginTop: 8, fontSize: 11.5 }}>{k.delta}</div>
            </div>
          ))}
        </div>

        {/* main grid: projects left, activity right */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16 }}>

          {/* Recent projects */}
          <section className="card" style={{ overflow: 'hidden' }}>
            <header style={SectionHeader.styleH}>
              <span style={SectionHeader.styleT}>Recent projects</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="hint">Sorted by activity</span>
                <button className="btn" data-variant="ghost" data-size="sm">View all <Icon.ChevronRight size={11} /></button>
              </div>
            </header>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {projects.map((p, i) => (
                <button key={p.id}
                  onClick={() => nav('project', { id: p.id })}
                  style={{
                    appearance: 'none', border: 0, cursor: 'pointer', textAlign: 'left',
                    display: 'grid', gridTemplateColumns: '18px minmax(0, 1.4fr) minmax(0, 1fr) minmax(110px, 1.1fr) 70px 12px',
                    alignItems: 'center', gap: 12,
                    padding: '11px 16px',
                    background: 'transparent',
                    borderTop: i === 0 ? 'none' : '1px solid var(--stroke-1)',
                    color: 'var(--fg-1)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span className="dot" data-status={p.status} />
                  <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{p.code}</span>
                    <span style={{ fontWeight: 600, color: 'var(--fg-0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                  </span>
                  <span className="hint" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                    <span className="mono" style={{ color: 'var(--fg-2)' }}>{p.modules}</span> mod ·
                    <span className="mono" style={{ color: 'var(--fg-2)', marginLeft: 4 }}>{p.atcs}</span> ATC
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div className="bar" style={{ flex: 1, minWidth: 40, maxWidth: 120 }}>
                      <div className="fill" data-color={p.coverage >= 80 ? 'pass' : (p.coverage >= 60 ? null : 'running')} style={{ width: p.coverage + '%' }} />
                    </div>
                    <span className="mono hint" style={{ minWidth: 28 }}>{p.coverage}%</span>
                  </span>
                  <span className="hint" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.lastActivity}</span>
                  <Icon.ChevronRight size={12} color="var(--fg-4)" />
                </button>
              ))}
            </div>
          </section>

          {/* Activity */}
          <section className="card" style={{ overflow: 'hidden' }}>
            <header style={SectionHeader.styleH}>
              <span style={SectionHeader.styleT}>Recent activity</span>
              <span className="hint">Last 24h</span>
            </header>
            <div>
              {activity.map((a, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: 'auto 1fr auto',
                  alignItems: 'flex-start', gap: 10,
                  padding: '9px 16px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--stroke-1)',
                }}>
                  <ActivityGlyph kind={a.kind} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, color: 'var(--fg-1)' }}>
                      <span className="mono" style={{ color: 'var(--fg-2)' }}>{a.who}</span>
                      <span style={{ color: 'var(--fg-3)' }}> {a.action} </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--fg-0)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.target}
                    </div>
                  </div>
                  <span className="mono hint" style={{ fontSize: 11 }}>{a.time}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Active runs */}
        <section className="card" style={{ overflow: 'hidden' }}>
          <header style={SectionHeader.styleH}>
            <span style={SectionHeader.styleT}>
              Active test runs <span className="hint" style={{ marginLeft: 6 }}>· 4</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="btn" data-variant="ghost" data-size="sm">All runs</button>
              <button className="btn" data-size="sm" onClick={() => nav('run')}>
                <Icon.Play size={11} /> Resume RUN-1839
              </button>
            </div>
          </header>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '92px 1fr 70px 90px 1.4fr 1fr 90px 16px',
            fontSize: 11, color: 'var(--fg-3)', letterSpacing: '0.04em', textTransform: 'uppercase',
            padding: '8px 16px', borderTop: '1px solid var(--stroke-1)', borderBottom: '1px solid var(--stroke-1)',
            fontWeight: 600,
          }}>
            <span>Run</span><span>Project</span><span>Mode</span><span>Status</span><span>Progress</span><span>Executor</span><span>Started</span><span></span>
          </div>
          {activeRuns.map((r, i) => (
            <div key={r.id} style={{
              display: 'grid',
              gridTemplateColumns: '92px 1fr 70px 90px 1.4fr 1fr 90px 16px',
              alignItems: 'center', gap: 8,
              padding: '11px 16px',
              borderBottom: i === activeRuns.length - 1 ? 'none' : '1px solid var(--stroke-1)',
              fontSize: 12.5,
            }}>
              <span className="mono" style={{ color: 'var(--fg-1)', fontWeight: 600 }}>{r.id}</span>
              <span style={{ color: 'var(--fg-0)' }}>{r.project}</span>
              <span className="mono hint" style={{ fontSize: 11 }}>{r.mode}</span>
              <span className="chip" data-status={r.status}>
                <span className="dot" data-status={r.status} />
                {r.status === 'running' ? 'running' : r.status === 'fail' ? 'failed' : r.status}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SegBar pass={r.pass} fail={r.fail} pending={r.total - r.done} />
                <span className="mono hint" style={{ minWidth: 50, fontSize: 11 }}>{r.done}/{r.total}</span>
              </span>
              <span className="mono" style={{ color: 'var(--fg-2)', fontSize: 11.5 }}>{r.exec}</span>
              <span className="hint" style={{ fontSize: 11.5 }}>{r.started}</span>
              <Icon.More size={13} color="var(--fg-4)" />
            </div>
          ))}
        </section>
      </div>
    </Shell>
  );
}

const SectionHeader = {
  styleH: { padding: '11px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--stroke-1)' },
  styleT: { font: '600 12px/1 var(--font-sans)', color: 'var(--fg-0)' },
};

function ActivityGlyph({ kind }) {
  const { Icon } = window;
  const map = {
    bug: { I: Icon.Bug, c: 'var(--fail)' },
    run: { I: Icon.Play, c: 'var(--running)' },
    atc: { I: Icon.Box, c: 'var(--accent)' },
  };
  const v = map[kind] || map.atc;
  const IconC = v.I;
  return (
    <span style={{
      width: 22, height: 22, borderRadius: 4,
      background: 'rgba(255,255,255,0.04)', border: '1px solid var(--stroke-1)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      marginTop: 2,
    }}>
      <IconC size={12} color={v.c} />
    </span>
  );
}

function SegBar({ pass, fail, pending }) {
  const total = Math.max(1, pass + fail + pending);
  return (
    <span className="bar seg-bar" style={{ width: 140, flex: 1 }}>
      {pass    > 0 && <span style={{ width: (pass    / total * 100) + '%', background: 'var(--pass)' }} />}
      {fail    > 0 && <span style={{ width: (fail    / total * 100) + '%', background: 'var(--fail)' }} />}
      {pending > 0 && <span style={{ width: (pending / total * 100) + '%', background: 'rgba(255,255,255,0.07)' }} />}
    </span>
  );
}

Object.assign(window, { HomeScreen, SegBar });
