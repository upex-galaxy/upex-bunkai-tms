// Screen 3 — Project View (tree / table / mind-map)
const { useState: useStateP, useMemo: useMemoP } = React;

function ProjectScreen() {
  const { Icon, useRouter, Shell, Topbar, BunkaiData } = window;
  const { nav } = useRouter();
  const { tree, focusATC } = BunkaiData;

  const [view, setView] = useStateP('tree');     // tree | table | mindmap
  const [selectedId, setSelectedId] = useStateP('a:CHK-079');
  const [openIds, setOpenIds] = useStateP(new Set([
    'p:checkout-revamp', 'm:checkout', 'f:promo', 'm:cart', 'f:cart-pricing',
  ]));
  const [tabs, setTabs] = useStateP([
    { id: 'a:CHK-024', label: 'ATC-CHK-024', status: 'fail',  layer: 'API' },
    { id: 'a:CHK-079', label: 'ATC-CHK-079', status: 'fail',  layer: 'UI'  },
    { id: 't:T-CHK-PROMO', label: 'T-CHK-PROMO', status: 'fail', layer: null },
  ]);
  const [activeTab, setActiveTab] = useStateP('a:CHK-079');
  const [ctxMenu, setCtxMenu] = useStateP(null); // {x, y, node}

  const toggleOpen = id => {
    setOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onNodeClick = (node) => {
    if (node.type === 'folder' || node.type === 'module' || node.type === 'project') {
      toggleOpen(node.id);
      return;
    }
    setSelectedId(node.id);
    if (!tabs.find(t => t.id === node.id)) {
      const label = node.code || node.name;
      setTabs(prev => [...prev, { id: node.id, label, status: node.status, layer: node.layer }]);
    }
    setActiveTab(node.id);
  };

  const closeCtx = () => setCtxMenu(null);

  return (
    <Shell
      topbar={
        <Topbar
          left={<Breadcrumb items={['upex-galaxy', 'Checkout Revamp', 'Promo codes', 'ATC-CHK-079']} />}
          center={
            <div className="seg" role="tablist">
              <button aria-pressed={view === 'tree'}    onClick={() => setView('tree')}><Icon.Tree size={12} /> Tree</button>
              <button aria-pressed={view === 'table'}   onClick={() => setView('table')}><Icon.Table size={12} /> Table</button>
              <button aria-pressed={view === 'mindmap'} onClick={() => setView('mindmap')}><Icon.Graph size={12} /> Mind map</button>
            </div>
          }
          right={
            <>
              <div style={{ position: 'relative' }}>
                <Icon.Search size={12} color="var(--fg-3)" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }} />
                <input className="input" placeholder="Filter by name, ATC ID, tag…"
                  style={{ width: 280, paddingLeft: 26, height: 26, fontSize: 12 }} />
              </div>
              <span className="v-divider" style={{ height: 16, margin: '0 2px' }} />
              <button className="btn" data-size="sm" onClick={() => nav('editor', { id: 'new' })}>
                <Icon.Plus size={11} /> New ATC <span className="kbd">N</span>
              </button>
              <button className="btn" data-variant="primary" data-size="sm">
                <Icon.Plus size={11} /> New Test
              </button>
              <button className="btn" data-variant="ghost" data-icon-only data-size="sm">
                <Icon.More size={13} />
              </button>
            </>
          }
        />
      }
    >
      {view === 'tree' &&
        <TreeView
          tree={tree}
          openIds={openIds}
          toggleOpen={toggleOpen}
          selectedId={selectedId}
          onNodeClick={onNodeClick}
          tabs={tabs}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          setTabs={setTabs}
          ctxMenu={ctxMenu}
          setCtxMenu={setCtxMenu}
          closeCtx={closeCtx}
          focusATC={focusATC}
        />
      }
      {view === 'table' && <TableView tree={tree} />}
      {view === 'mindmap' && <MindMapView />}
    </Shell>
  );
}

// ====== Breadcrumb ======
function Breadcrumb({ items }) {
  const { Icon } = window;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, minWidth: 0, overflow: 'hidden' }}>
      {items.map((it, i) => (
        <React.Fragment key={i}>
          <span style={{
            color: i === items.length - 1 ? 'var(--fg-0)' : 'var(--fg-3)',
            fontFamily: i === items.length - 1 ? 'var(--font-mono)' : 'inherit',
            fontWeight: i === items.length - 1 ? 600 : 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{it}</span>
          {i < items.length - 1 && <Icon.ChevronRight size={10} color="var(--fg-4)" />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ====== TREE VIEW ======
function TreeView(props) {
  const { tree, openIds, toggleOpen, selectedId, onNodeClick, tabs, activeTab, setActiveTab, setTabs, ctxMenu, setCtxMenu, closeCtx, focusATC } = props;
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr', minHeight: 0 }}>
      {/* Left: tree panel */}
      <div style={{
        borderRight: '1px solid var(--stroke-1)',
        background: 'var(--bg-1)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Toolbar */}
        <div style={{
          height: 34, padding: '0 10px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--stroke-1)',
        }}>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
            EXPLORER
          </span>
          <div style={{ display: 'flex', gap: 2 }}>
            <button className="btn" data-variant="ghost" data-icon-only data-size="sm" title="Collapse all">
              <window.Icon.ChevronUp size={11} />
            </button>
            <button className="btn" data-variant="ghost" data-icon-only data-size="sm" title="New ATC">
              <window.Icon.Plus size={11} />
            </button>
            <button className="btn" data-variant="ghost" data-icon-only data-size="sm" title="Refresh">
              <window.Icon.Refresh size={11} />
            </button>
          </div>
        </div>
        {/* Filter pills */}
        <div style={{ padding: '8px 10px', display: 'flex', gap: 6, borderBottom: '1px solid var(--stroke-1)' }}>
          {[
            ['all', '623', true],
            ['fail', '7', false],
            ['blocked', '3', false],
            ['unrun', '14', false],
          ].map(([k, n, active], i) => (
            <button key={i} className="btn" data-size="sm"
              style={{
                padding: '3px 7px', fontSize: 10.5,
                background: active ? 'var(--bg-3)' : 'transparent',
                borderColor: active ? 'var(--stroke-3)' : 'var(--stroke-1)',
              }}>
              {k} <span className="mono" style={{ color: 'var(--fg-3)', marginLeft: 4 }}>{n}</span>
            </button>
          ))}
        </div>
        {/* Tree */}
        <div style={{ flex: 1, overflow: 'auto', padding: '6px 0 12px' }}>
          <TreeNode node={tree} depth={0}
            openIds={openIds} selectedId={selectedId}
            toggleOpen={toggleOpen} onClick={onNodeClick}
            onContextMenu={(e, node) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, node }); }}
          />
        </div>
      </div>

      {/* Right: tabs + content */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-0)', minWidth: 0 }}>
        <TabBar tabs={tabs} activeTab={activeTab}
          onPick={(id) => setActiveTab(id)}
          onClose={(id) => {
            setTabs(prev => prev.filter(t => t.id !== id));
            if (activeTab === id) {
              const remaining = tabs.filter(t => t.id !== id);
              if (remaining[0]) setActiveTab(remaining[0].id);
            }
          }} />
        <div style={{ flex: 1, overflow: 'auto' }}>
          {activeTab && activeTab.startsWith('a:') && <ATCDetail atc={focusATC} />}
          {activeTab && activeTab.startsWith('t:') && <TestDetail />}
        </div>
      </div>

      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={closeCtx} />}
    </div>
  );
}

function TreeNode({ node, depth, openIds, selectedId, toggleOpen, onClick, onContextMenu }) {
  const { Icon } = window;
  const isContainer = node.children && node.children.length > 0;
  const isOpen = openIds.has(node.id);
  const isSelected = node.id === selectedId;

  const indent = 6 + depth * 12;

  let label = node.name;
  let codePrefix = null;
  let IconC = Icon.Folder;
  let iconColor = 'var(--fg-3)';

  if (node.type === 'project') { IconC = Icon.Box; iconColor = 'var(--accent)'; }
  else if (node.type === 'module') { IconC = isOpen ? Icon.FolderOpen : Icon.Folder; iconColor = 'var(--fg-2)'; }
  else if (node.type === 'folder') { IconC = isOpen ? Icon.FolderOpen : Icon.Folder; iconColor = 'var(--fg-3)'; }
  else if (node.type === 'atc')    { IconC = Icon.Box; iconColor = 'var(--fg-3)'; codePrefix = node.code?.replace('ATC-', ''); }
  else if (node.type === 'test')   { IconC = Icon.Branch; iconColor = 'var(--fg-3)'; codePrefix = node.code; }

  return (
    <>
      <div
        onClick={() => onClick(node)}
        onContextMenu={(e) => onContextMenu(e, node)}
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto auto auto 1fr auto auto',
          alignItems: 'center', gap: 6,
          padding: '3px 10px 3px ' + indent + 'px',
          cursor: 'pointer',
          background: isSelected ? 'var(--accent-soft)' : 'transparent',
          borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
          color: isSelected ? 'var(--fg-0)' : 'var(--fg-1)',
          fontSize: 12.5,
          height: 24,
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-2)'; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ width: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {isContainer ? (isOpen ? <Icon.ChevronDown size={10} color="var(--fg-3)" /> : <Icon.ChevronRight size={10} color="var(--fg-3)" />) : null}
        </span>
        <IconC size={12} color={iconColor} />
        {node.type === 'atc' && (
          <span className="chip" data-layer={node.layer} style={{ height: 14, padding: '0 4px', fontSize: 9.5 }}>{node.layer}</span>
        )}
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontWeight: node.type === 'project' || node.type === 'module' ? 600 : 400,
          color: node.type === 'project' || node.type === 'module' ? 'var(--fg-0)' : 'var(--fg-1)',
        }}>
          {codePrefix && <span className="mono" style={{ color: 'var(--fg-3)', fontSize: 11, marginRight: 6 }}>{codePrefix}</span>}
          {node.type !== 'atc' && node.type !== 'test' ? label : label}
        </span>
        {node.status && <span className="dot" data-status={node.status} />}
        <span style={{ width: 1 }} />
      </div>
      {isContainer && isOpen && node.children.map(child => (
        <TreeNode key={child.id} node={child} depth={depth + 1}
          openIds={openIds} selectedId={selectedId}
          toggleOpen={toggleOpen} onClick={onClick}
          onContextMenu={onContextMenu}
        />
      ))}
    </>
  );
}

function ContextMenu({ menu, onClose }) {
  const { Icon } = window;
  const items = [
    { l: 'Open',                k: '⏎',     i: 'ArrowRight' },
    { l: 'Open in new tab',     k: '⌘⏎',   i: 'ArrowUpRight' },
    null,
    { l: 'Run this',            k: 'R',     i: 'Run',    accent: true },
    { l: 'Run from here…',      k: '⇧R',   i: 'Play' },
    null,
    { l: 'Edit',                k: 'E',     i: 'Edit' },
    { l: 'Rename',              k: 'F2',    i: null },
    { l: 'Duplicate',           k: '⌘D',   i: null },
    { l: 'Copy ATC ID',         k: '⌘C',   i: null },
    null,
    { l: 'Link to user story',  k: null,   i: 'Link' },
    { l: 'View dependencies',   k: null,   i: 'Graph' },
    null,
    { l: 'Delete',              k: '⌫',    i: 'X', danger: true },
  ];
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
      <div style={{
        position: 'fixed', zIndex: 51,
        left: Math.min(menu.x, window.innerWidth - 240),
        top:  Math.min(menu.y, window.innerHeight - 360),
        width: 230,
        background: 'var(--bg-3)',
        border: '1px solid var(--stroke-3)',
        borderRadius: 6,
        padding: 4,
        boxShadow: 'var(--shadow-pop)',
        fontSize: 12.5,
      }}>
        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--stroke-1)', marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>
            {menu.node.type === 'atc' ? 'ATC' : menu.node.type}
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-0)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {menu.node.code || menu.node.name}
          </div>
        </div>
        {items.map((it, i) => it === null ? (
          <div key={i} style={{ height: 1, background: 'var(--stroke-1)', margin: '4px 0' }} />
        ) : (
          <button key={i} onClick={onClose}
            style={{
              appearance: 'none', border: 0, background: 'transparent', cursor: 'pointer',
              width: '100%', padding: '5px 8px',
              display: 'grid', gridTemplateColumns: '14px 1fr auto', alignItems: 'center', gap: 8,
              borderRadius: 3,
              color: it.danger ? 'var(--fail)' : (it.accent ? 'var(--accent-hi)' : 'var(--fg-1)'),
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-4)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <span>{it.i && Icon[it.i] ? React.createElement(Icon[it.i], { size: 11, color: 'currentColor' }) : null}</span>
            <span style={{ textAlign: 'left' }}>{it.l}</span>
            <span className="kbd" style={{ visibility: it.k ? 'visible' : 'hidden' }}>{it.k}</span>
          </button>
        ))}
      </div>
    </>
  );
}

// ====== Tabs ======
function TabBar({ tabs, activeTab, onPick, onClose }) {
  const { Icon } = window;
  return (
    <div style={{
      height: 32, flexShrink: 0,
      borderBottom: '1px solid var(--stroke-1)',
      background: 'var(--bg-1)',
      display: 'flex', alignItems: 'stretch',
      overflowX: 'auto', overflowY: 'hidden',
      whiteSpace: 'nowrap',
    }}>
      {tabs.map((t, i) => (
        <div key={t.id}
          onClick={() => onPick(t.id)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '0 10px 0 12px',
            borderRight: '1px solid var(--stroke-1)',
            background: t.id === activeTab ? 'var(--bg-0)' : 'transparent',
            color: t.id === activeTab ? 'var(--fg-0)' : 'var(--fg-2)',
            fontSize: 12,
            cursor: 'pointer',
            borderTop: t.id === activeTab ? '1px solid var(--accent)' : '1px solid transparent',
            marginTop: -1,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <span className="dot" data-status={t.status} />
          <span className="mono" style={{ fontSize: 11.5 }}>{t.label}</span>
          {t.layer && <span className="chip" data-layer={t.layer} style={{ height: 14, padding: '0 4px', fontSize: 9.5 }}>{t.layer}</span>}
          <span
            onClick={(e) => { e.stopPropagation(); onClose(t.id); }}
            style={{ display: 'inline-flex', padding: 2, marginLeft: 4, borderRadius: 2, color: 'var(--fg-3)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--fg-0)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-3)'; }}
          >
            <Icon.Close size={10} color="currentColor" />
          </span>
        </div>
      ))}
      <div style={{ flex: 1, borderBottom: '1px solid var(--stroke-1)' }} />
    </div>
  );
}

// ====== ATC DETAIL (right panel content for an ATC tab) ======
function ATCDetail({ atc }) {
  const { Icon, useRouter } = window;
  const { nav } = useRouter();
  return (
    <div style={{ padding: '20px 28px 40px', maxWidth: 980 }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 6 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 11.5, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{atc.id}</span>
            <span className="chip" data-status={atc.status}><span className="dot" data-status={atc.status} />{atc.status === 'fail' ? 'failed' : atc.status}</span>
            <span className="chip" data-layer={atc.layer}>{atc.layer}</span>
            <span className="hint mono" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>· {atc.module}</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--fg-0)' }}>
            {atc.title}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn" data-size="sm"><Icon.Play size={11} /> Run</button>
          <button className="btn" data-size="sm" onClick={() => nav('editor', { id: atc.id })}><Icon.Edit size={11} /> Edit</button>
          <button className="btn" data-variant="ghost" data-icon-only data-size="sm"><Icon.More size={13} /></button>
        </div>
      </header>

      {/* Last result strip */}
      <div style={{
        marginTop: 14,
        padding: '8px 12px',
        background: 'var(--fail-bg)',
        border: '1px solid rgba(229,72,77,0.20)',
        borderRadius: 'var(--r-2)',
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between',
        gap: '6px 12px',
        fontSize: 12.5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 auto' }}>
          <Icon.X size={13} color="var(--fail)" />
          <span style={{ color: 'var(--fg-0)', whiteSpace: 'nowrap' }}>Last run failed</span>
          <span className="mono hint" style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>· {atc.lastResult.runId} · {atc.lastResult.actor} · {atc.lastResult.when}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--fail)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}>
            assertion: inline_error.text matches /expired/i
          </div>
          <button className="btn" data-size="sm" style={{ flexShrink: 0 }}>Open run <Icon.ArrowUpRight size={11} /></button>
        </div>
      </div>

      {/* Linked user story */}
      <section style={{ marginTop: 22 }}>
        <SectionLabel>Linked user story</SectionLabel>
        <div style={{
          marginTop: 8, padding: '12px 14px',
          background: 'var(--bg-2)', border: '1px solid var(--stroke-2)',
          borderRadius: 'var(--r-3)',
          display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'flex-start',
        }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, paddingTop: 2 }}>{atc.story.id}</span>
          <span style={{ fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.55 }}>{atc.story.title}</span>
          <Icon.ArrowUpRight size={13} color="var(--fg-3)" />
        </div>

        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {atc.acceptanceCriteria.map(ac => (
            <div key={ac.id} style={{
              display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: 10, alignItems: 'flex-start',
              padding: '7px 10px',
              borderRadius: 'var(--r-2)',
              background: ac.selected ? 'var(--accent-soft)' : 'transparent',
              border: ac.selected ? '1px solid rgba(217,84,63,0.25)' : '1px solid var(--stroke-1)',
              fontSize: 12.5,
            }}>
              <span style={{
                width: 14, height: 14, borderRadius: 3,
                border: ac.selected ? '1px solid var(--accent)' : '1px solid var(--stroke-3)',
                background: ac.selected ? 'var(--accent)' : 'transparent',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 2,
              }}>
                {ac.selected && <Icon.Check size={9} color="#fff" />}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--fg-3)', paddingTop: 2 }}>{ac.id}</span>
              <span style={{ color: ac.selected ? 'var(--fg-0)' : 'var(--fg-2)' }}>{ac.text}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Two-column: steps + assertions */}
      <section style={{ marginTop: 26, display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
        <div>
          <SectionLabel>Steps <span className="hint" style={{ marginLeft: 6 }}>{atc.steps.length}</span></SectionLabel>
          <ol style={{
            margin: '8px 0 0', padding: 0, listStyle: 'none',
            border: '1px solid var(--stroke-2)', borderRadius: 'var(--r-3)', overflow: 'hidden',
            background: 'var(--bg-2)',
          }}>
            {atc.steps.map((s, i) => (
              <li key={s.id} style={{
                display: 'grid', gridTemplateColumns: '28px 1fr', gap: 0, alignItems: 'stretch',
                borderTop: i === 0 ? 'none' : '1px solid var(--stroke-1)',
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.02)',
                  borderRight: '1px solid var(--stroke-1)',
                  fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)',
                  fontWeight: 500,
                }}>{String(s.id).padStart(2, '0')}</span>
                <span style={{ padding: '8px 12px', fontSize: 13, color: 'var(--fg-1)' }}>{s.text}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <SectionLabel>Assertions <span className="hint" style={{ marginLeft: 6 }}>{atc.assertions.length}</span></SectionLabel>
          <div style={{
            marginTop: 8, padding: 10, borderRadius: 'var(--r-3)',
            background: 'var(--bg-2)', border: '1px solid var(--stroke-2)',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {atc.assertions.map((a, i) => (
              <code key={i} style={{
                display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11.5,
                color: i === 0 ? 'var(--fail)' : 'var(--fg-1)',
                background: i === 0 ? 'var(--fail-bg)' : 'transparent',
                padding: '5px 8px', borderRadius: 3,
                borderLeft: i === 0 ? '2px solid var(--fail)' : '2px solid transparent',
              }}>{a}</code>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <SectionLabel>Tags</SectionLabel>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {atc.tags.map(t => <span key={t} className="tag">{t}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* Used by */}
      <section style={{ marginTop: 26 }}>
        <SectionLabel>Used by <span className="hint" style={{ marginLeft: 6 }}>2 tests</span></SectionLabel>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {atc.usedBy.map(t => (
            <div key={t.id} style={{
              padding: '8px 12px', background: 'var(--bg-2)',
              border: '1px solid var(--stroke-2)', borderRadius: 'var(--r-2)',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <Icon.Branch size={12} color="var(--fg-3)" />
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', minWidth: 110 }}>{t.id}</span>
              <span style={{ flex: 1, fontSize: 12.5, color: 'var(--fg-1)' }}>{t.name}</span>
              <span className="chip" data-status={t.status}>{t.status === 'fail' ? 'failed' : t.status}</span>
              <Icon.ChevronRight size={12} color="var(--fg-4)" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      font: '600 10.5px/1 var(--font-sans)',
      letterSpacing: '0.06em', textTransform: 'uppercase',
      color: 'var(--fg-3)',
      display: 'inline-flex', alignItems: 'center',
    }}>
      {children}
    </div>
  );
}

function TestDetail() {
  return (
    <div style={{ padding: 28, color: 'var(--fg-2)', fontSize: 12.5 }}>
      <em>Test detail view placeholder.</em>
    </div>
  );
}

// ====== TABLE VIEW ======
function TableView({ tree }) {
  const { Icon } = window;
  // flatten ATCs from tree
  const rows = [];
  const walk = (node, modulePath) => {
    if (node.type === 'atc') {
      rows.push({ ...node, modulePath });
    } else if (node.children) {
      const newPath = (node.type === 'project') ? modulePath : [...modulePath, node.name];
      node.children.forEach(c => walk(c, newPath));
    }
  };
  walk(tree, []);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-0)' }}>
      {/* Filter bar */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--stroke-1)',
        display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-1)',
      }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{rows.length} ATCs</span>
        <span className="v-divider" style={{ height: 14 }} />
        <FilterPill icon="Filter" label="status" value="any" />
        <FilterPill icon="Layers" label="layer" value="any" />
        <FilterPill icon="Folder" label="module" value="any" />
        <FilterPill icon="Hash" label="tag" value="any" />
        <span className="hint mono" style={{ marginLeft: 8, fontSize: 11 }}>+ Add filter</span>
        <div style={{ flex: 1 }} />
        <button className="btn" data-size="sm" data-variant="ghost"><Icon.Sort size={11} /> Sort</button>
        <button className="btn" data-size="sm" data-variant="ghost"><Icon.Pin size={11} /> Group: module</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-1)', zIndex: 1 }}>
              {['', 'ID', 'Title', 'Layer', 'Module', 'Status', 'Last run', 'Used by', 'Tags', ''].map((h, i) => (
                <th key={i} style={{
                  textAlign: 'left', padding: '8px 10px',
                  fontSize: 10.5, fontWeight: 600, color: 'var(--fg-3)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  borderBottom: '1px solid var(--stroke-1)',
                  whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const lastRun = { pass: '2h ago', fail: '11m ago', blocked: 'never', skipped: 'never' }[r.status] || 'never';
              const usedBy = Math.max(1, (r.code.charCodeAt(r.code.length - 1) % 4)) ;
              return (
                <tr key={r.id} style={{
                  borderBottom: '1px solid var(--stroke-1)',
                  background: i === 1 ? 'var(--accent-soft)' : 'transparent',
                }}>
                  <td style={tdStyle}>
                    <input type="checkbox" checked={i === 1} readOnly style={{ accentColor: 'var(--accent)' }} />
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--fg-0)' }}>
                    {r.code}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--fg-0)' }}>{r.name}</td>
                  <td style={tdStyle}><span className="chip" data-layer={r.layer}>{r.layer}</span></td>
                  <td style={{ ...tdStyle, color: 'var(--fg-2)' }} className="mono">{r.modulePath.join(' › ')}</td>
                  <td style={tdStyle}><span className="chip" data-status={r.status}><span className="dot" data-status={r.status} />{r.status === 'fail' ? 'failed' : r.status}</span></td>
                  <td style={{ ...tdStyle, color: 'var(--fg-3)' }} className="hint">{lastRun}</td>
                  <td style={{ ...tdStyle, color: 'var(--fg-2)' }} className="mono">{usedBy}×</td>
                  <td style={tdStyle}>
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      <span className="tag" style={{ fontSize: 10 }}>regression</span>
                      {r.status !== 'pass' && <span className="tag" style={{ fontSize: 10, color: 'var(--accent)' }}>P{2 + i % 2}</span>}
                    </span>
                  </td>
                  <td style={tdStyle}><Icon.More size={12} color="var(--fg-4)" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Selection footer */}
      <div style={{
        height: 36, padding: '0 16px', borderTop: '1px solid var(--stroke-1)',
        background: 'var(--bg-1)',
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: 12,
      }}>
        <span className="mono" style={{ color: 'var(--accent)' }}>1 selected</span>
        <span className="v-divider" style={{ height: 14 }} />
        <button className="btn" data-size="sm" data-variant="ghost"><Icon.Play size={11} /> Run</button>
        <button className="btn" data-size="sm" data-variant="ghost"><Icon.Edit size={11} /> Edit</button>
        <button className="btn" data-size="sm" data-variant="ghost"><Icon.Hash size={11} /> Tag</button>
        <button className="btn" data-size="sm" data-variant="ghost"><Icon.Folder size={11} /> Move</button>
        <span style={{ flex: 1 }} />
        <span className="hint">{rows.length} of {rows.length} · 14 columns · 0 filters</span>
      </div>
    </div>
  );
}

const tdStyle = { padding: '8px 10px', whiteSpace: 'nowrap' };

function FilterPill({ icon, label, value }) {
  const IconC = window.Icon[icon];
  return (
    <button className="btn" data-size="sm" style={{ padding: '3px 8px', fontSize: 11.5, background: 'transparent' }}>
      <IconC size={11} color="var(--fg-3)" />
      <span className="hint">{label}:</span>
      <span style={{ color: 'var(--fg-1)' }}>{value}</span>
    </button>
  );
}

// ====== MIND MAP VIEW ======
function MindMapView() {
  const { Icon } = window;
  // node positions (laid out by hand for a compelling visual)
  const nodes = [
    { id: 'US-742', label: 'US-742 · Returning customer · clear promo errors', type: 'story', x: 220, y: 200, w: 240 },
    { id: 'CHK-079', label: 'ATC-CHK-079 · Apply expired promo', type: 'atc-fail', x: 560, y: 90,  w: 200 },
    { id: 'CHK-080', label: 'ATC-CHK-080 · Reject malformed promo', type: 'atc', x: 580, y: 210, w: 200 },
    { id: 'CHK-081', label: 'ATC-CHK-081 · Promo persists across reload', type: 'atc-blocked', x: 560, y: 330, w: 200 },
    { id: 'T-CHK-PROMO', label: 'T-CHK-PROMO · Checkout with promo', type: 'test-fail', x: 880, y: 130, w: 210 },
    { id: 'T-RET-USER',  label: 'T-RET-USER · Returning user retry',  type: 'test', x: 880, y: 280, w: 210 },
    { id: 'RUN-1841', label: 'RUN-1841 · CI · 4 fail', type: 'run-fail', x: 1180, y: 180, w: 180 },
    { id: 'BUG-205',  label: 'BUG-205 · P2 · Stepper reverts',  type: 'bug', x: 1180, y: 60, w: 200 },
  ];
  const edges = [
    ['US-742', 'CHK-079'],
    ['US-742', 'CHK-080'],
    ['US-742', 'CHK-081'],
    ['CHK-079', 'T-CHK-PROMO'],
    ['CHK-080', 'T-CHK-PROMO'],
    ['CHK-079', 'T-RET-USER'],
    ['CHK-081', 'T-RET-USER'],
    ['T-CHK-PROMO', 'RUN-1841'],
    ['T-CHK-PROMO', 'BUG-205'],
  ];
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));

  const colorFor = (type) => {
    if (type.includes('fail')) return 'var(--fail)';
    if (type.includes('blocked')) return 'var(--blocked)';
    if (type === 'story') return 'var(--accent)';
    if (type === 'run') return 'var(--running)';
    if (type === 'bug') return 'var(--fail)';
    return 'var(--fg-2)';
  };

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--bg-0)' }}>
      {/* Toolbar */}
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 2,
        display: 'flex', gap: 6,
      }}>
        <div className="seg">
          <button aria-pressed="true">Topology</button>
          <button>Coverage</button>
          <button>Bug density</button>
        </div>
        <button className="btn" data-size="sm" data-variant="ghost"><Icon.Filter size={11} /> Filter</button>
      </div>
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 2,
        display: 'flex', gap: 4,
      }}>
        <button className="btn" data-size="sm" data-icon-only><Icon.Plus size={12} /></button>
        <button className="btn" data-size="sm" data-icon-only><span style={{ fontSize: 14, lineHeight: 1 }}>−</span></button>
        <button className="btn" data-size="sm">Fit</button>
      </div>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 2,
        background: 'var(--bg-2)', border: '1px solid var(--stroke-2)', borderRadius: 'var(--r-3)',
        padding: '8px 12px', display: 'flex', gap: 14, fontSize: 11,
      }}>
        {[
          ['User story', 'var(--accent)'],
          ['ATC', 'var(--fg-2)'],
          ['Test', 'var(--fg-1)'],
          ['Run', 'var(--running)'],
          ['Bug', 'var(--fail)'],
          ['Blocked', 'var(--blocked)'],
        ].map(([k, c]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--fg-2)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} /> {k}
          </span>
        ))}
      </div>

      {/* Grid bg */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        backgroundImage:
          `radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)`,
        backgroundSize: '22px 22px',
        backgroundPosition: '0 0',
      }} />

      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {edges.map(([from, to], i) => {
          const a = byId[from], b = byId[to];
          if (!a || !b) return null;
          const x1 = a.x + a.w, y1 = a.y + 18;
          const x2 = b.x,        y2 = b.y + 18;
          const mx = (x1 + x2) / 2;
          const dColor = (a.type.includes('fail') || b.type.includes('fail')) ? 'var(--fail)' :
                          (a.type.includes('blocked') || b.type.includes('blocked')) ? 'var(--blocked)' :
                          'var(--stroke-strong)';
          return (
            <path key={i}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              fill="none" stroke={dColor} strokeWidth="1" strokeOpacity="0.8" />
          );
        })}
      </svg>

      <div style={{ position: 'absolute', inset: 0 }}>
        {nodes.map(n => (
          <div key={n.id} style={{
            position: 'absolute', left: n.x, top: n.y, width: n.w,
            padding: '8px 12px',
            background: 'var(--bg-2)',
            border: '1px solid ' + (n.type.includes('fail') ? 'rgba(229,72,77,0.35)' :
                                     n.type.includes('blocked') ? 'rgba(232,168,56,0.30)' :
                                     n.type === 'story' ? 'rgba(217,84,63,0.35)' :
                                     'var(--stroke-2)'),
            borderRadius: 'var(--r-3)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span className="dot" data-status={
              n.type.includes('fail') ? 'fail' :
              n.type.includes('blocked') ? 'blocked' :
              n.type === 'run' ? 'running' :
              'pass'
            } />
            <span style={{ fontSize: 11.5, color: 'var(--fg-0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {n.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { ProjectScreen });
