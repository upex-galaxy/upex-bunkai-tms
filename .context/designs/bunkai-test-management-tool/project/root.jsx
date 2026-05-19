// Root — mounts the router and renders the active screen.

function Root() {
  const { useRouter } = window;
  const { route, nav } = useRouter();

  let screen = null;
  if (route.name === 'login')   screen = <window.LoginScreen />;
  if (route.name === 'home')    screen = <window.HomeScreen />;
  if (route.name === 'project') screen = <window.ProjectScreen />;
  if (route.name === 'editor')  screen = <window.EditorScreen />;
  if (route.name === 'run')     screen = <window.RunScreen />;

  return (
    <>
      {screen}
      {route.name !== 'login' && <ScreenSwitcher current={route.name} onPick={(n, p) => nav(n, p || {})} />}
    </>
  );
}

// Floating, dismissible jumper so reviewers can hop between screens
const { useState: useStateZ } = React;
function ScreenSwitcher({ current, onPick }) {
  const { Icon } = window;
  const [expanded, setExpanded] = useStateZ(false);
  const items = [
    { id: 'login',   n: '01', label: 'Login',         hint: 'Entry point',     route: ['login'] },
    { id: 'home',    n: '02', label: 'Workspace',     hint: 'Dashboard',       route: ['home'] },
    { id: 'project', n: '03', label: 'Project',       hint: 'Tree · Table · Map', route: ['project', { id: 'checkout-revamp' }] },
    { id: 'editor',  n: '04', label: 'ATC editor',    hint: 'Form + preview',  route: ['editor', { id: 'ATC-CHK-079' }] },
    { id: 'run',     n: '05', label: 'Manual run',    hint: 'Execution',       route: ['run'] },
  ];

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="btn"
        style={{
          position: 'fixed', bottom: 14, right: 14, zIndex: 100,
          padding: '7px 10px',
          background: 'var(--bg-3)',
          border: '1px solid var(--stroke-3)',
          color: 'var(--fg-1)',
          boxShadow: 'var(--shadow-pop)',
        }}>
        <Icon.Layers size={12} color="var(--accent)" /> Screens
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 14, right: 14, zIndex: 100,
      background: 'var(--bg-3)',
      border: '1px solid var(--stroke-3)',
      borderRadius: 'var(--r-3)',
      boxShadow: 'var(--shadow-pop)',
      padding: 6,
      minWidth: 220,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 8px' }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Prototype · Bunkai MVP
        </span>
        <button onClick={() => setExpanded(false)} className="btn" data-variant="ghost" data-icon-only data-size="sm">
          <Icon.Close size={10} />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {items.map(it => {
          const active = current === it.id;
          return (
            <button key={it.id}
              onClick={() => onPick(it.route[0], it.route[1])}
              style={{
                appearance: 'none', border: 0, cursor: 'pointer', textAlign: 'left',
                display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center',
                padding: '6px 8px',
                borderRadius: 4,
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--fg-0)' : 'var(--fg-1)',
                fontSize: 12,
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-4)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <span className="mono" style={{ fontSize: 10.5, color: active ? 'var(--accent)' : 'var(--fg-3)', fontWeight: 600 }}>{it.n}</span>
              <span>
                <div style={{ fontWeight: 600 }}>{it.label}</div>
                <div className="hint" style={{ fontSize: 10.5 }}>{it.hint}</div>
              </span>
              {active && <Icon.ChevronRight size={11} color="var(--accent)" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

window.Root = Root;
