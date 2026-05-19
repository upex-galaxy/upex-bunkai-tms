// Bunkai — App shell & router. Exports Shell, Sidebar, Topbar, useRouter to window.

const { useState, useEffect, useMemo, useRef, createContext, useContext } = React;

// ====== ROUTER (very simple) ======
const RouterCtx = createContext(null);
function RouterProvider({ children }) {
  const [route, setRoute] = useState({ name: 'login', params: {} });
  const nav = (name, params = {}) => setRoute({ name, params });
  return <RouterCtx.Provider value={{ route, nav }}>{children}</RouterCtx.Provider>;
}
function useRouter() { return useContext(RouterCtx); }

// ====== LOGO ======
function Logo({ size = 18 }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size + 6, height: size + 6,
        background: 'var(--accent)',
        color: '#fff',
        borderRadius: 4,
        fontFamily: 'var(--font-jp)',
        fontWeight: 700,
        fontSize: size - 2,
        lineHeight: 1,
        letterSpacing: '-0.04em',
      }}>分</span>
      <span style={{ fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--fg-0)', fontSize: 14 }}>
        Bunkai
      </span>
    </div>
  );
}

// ====== SIDEBAR ======
function Sidebar() {
  const { Icon } = window;
  const { route, nav } = useRouter();
  const sections = [
    { id: 'home',     icon: 'Home',     label: 'Home',         badge: null,  route: 'home' },
    { id: 'projects', icon: 'Folder',   label: 'Projects',     badge: '5',   route: 'project', params: { id: 'checkout-revamp' } },
    { id: 'library',  icon: 'Library',  label: 'ATC Library',  badge: '623', route: null },
    { id: 'runs',     icon: 'Play',     label: 'Test Runs',    badge: '3',   route: null },
    { id: 'bugs',     icon: 'Bug',      label: 'Bug Reports',  badge: '33',  route: null },
    { id: 'metrics',  icon: 'Chart',    label: 'Metrics',      badge: null,  route: null },
    { id: 'settings', icon: 'Settings', label: 'Settings',     badge: null,  route: null },
  ];

  const projects = window.BunkaiData.projects;
  const isActive = (s) => s.route && route.name === s.route;

  return (
    <aside style={{
      background: 'var(--bg-1)',
      borderRight: '1px solid var(--stroke-1)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden',
    }}>
      {/* Workspace header */}
      <div style={{ padding: '14px 14px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Logo />
        <button className="btn" data-variant="ghost" data-icon-only title="New">
          <Icon.Plus size={14} />
        </button>
      </div>

      {/* Workspace switcher */}
      <div style={{ padding: '0 8px 10px' }}>
        <button className="btn" style={{
          width: '100%', justifyContent: 'space-between', padding: '6px 8px',
          background: 'transparent', borderColor: 'var(--stroke-1)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 16, height: 16, borderRadius: 3,
              background: 'linear-gradient(135deg, #3a4252, #1f2330)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9.5, fontWeight: 700, color: 'var(--fg-1)',
            }}>UG</span>
            <span style={{ fontWeight: 600, color: 'var(--fg-1)' }}>upex-galaxy</span>
          </span>
          <Icon.ChevronDown size={12} color="var(--fg-3)" />
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '0 8px 10px' }}>
        <button className="btn" style={{
          width: '100%', justifyContent: 'space-between', padding: '6px 8px',
          background: 'var(--bg-2)', color: 'var(--fg-3)',
        }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon.Search size={13} color="var(--fg-3)" /> Search or jump to…
          </span>
          <span style={{ display: 'inline-flex', gap: 2 }}>
            <span className="kbd">⌘</span><span className="kbd">K</span>
          </span>
        </button>
      </div>

      {/* Main nav */}
      <nav style={{ padding: '0 6px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {sections.map(s => {
          const IconC = Icon[s.icon];
          const active = isActive(s);
          return (
            <button key={s.id}
              onClick={() => s.route && nav(s.route, s.params || {})}
              style={{
                appearance: 'none', border: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 8, padding: '6px 8px',
                background: active ? 'var(--bg-3)' : 'transparent',
                color: active ? 'var(--fg-0)' : 'var(--fg-2)',
                borderRadius: 4,
                font: '500 12.5px/1 var(--font-sans)',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-2)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <IconC size={14} color={active ? 'var(--accent)' : 'var(--fg-2)'} />
                {s.label}
              </span>
              {s.badge && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10.5,
                  color: 'var(--fg-3)', padding: '1px 5px',
                  background: 'rgba(255,255,255,0.04)', borderRadius: 3,
                }}>{s.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Projects sub-nav */}
      <div style={{ padding: '16px 14px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ font: '600 10.5px/1 var(--font-sans)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-3)' }}>
          Pinned projects
        </span>
        <Icon.Plus size={12} color="var(--fg-3)" style={{ cursor: 'pointer' }} />
      </div>
      <div style={{ padding: '0 6px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {projects.map(p => {
          const active = route.name === 'project' && route.params.id === p.id;
          return (
            <button key={p.id}
              onClick={() => nav('project', { id: p.id })}
              style={{
                appearance: 'none', border: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                background: active ? 'var(--bg-3)' : 'transparent',
                color: active ? 'var(--fg-0)' : 'var(--fg-2)',
                borderRadius: 4,
                font: '500 12px/1 var(--font-sans)',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-2)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <span className="mono" style={{ fontSize: 9.5, color: 'var(--fg-3)', minWidth: 32 }}>{p.code}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
              <span className="dot" data-status={p.status}></span>
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* Bottom: user */}
      <div style={{
        borderTop: '1px solid var(--stroke-1)',
        padding: '10px 12px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: 3,
          background: 'linear-gradient(135deg, #d9543f, #b73a28)',
          color: '#fff', fontWeight: 700, fontSize: 11,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>MT</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Mariko Tanaka</div>
          <div style={{ fontSize: 10.5, color: 'var(--fg-3)' }}>QA Architect · v0.4.2</div>
        </div>
        <Icon.More size={14} color="var(--fg-3)" />
      </div>
    </aside>
  );
}

// ====== TOPBAR (kept thin — most screens add their own inner toolbar) ======
function Topbar({ left, center, right }) {
  return (
    <header style={{
      height: 40, flexShrink: 0,
      borderBottom: '1px solid var(--stroke-1)',
      background: 'var(--bg-1)',
      display: 'flex', alignItems: 'center',
      padding: '0 12px', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{left}</div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>{center}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{right}</div>
    </header>
  );
}

// ====== SHELL ======
function Shell({ children, topbar }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh', overflow: 'hidden' }}>
        {topbar}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </main>
    </div>
  );
}

Object.assign(window, { RouterProvider, useRouter, Sidebar, Topbar, Shell, Logo });
