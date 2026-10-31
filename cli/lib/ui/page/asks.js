/* Question widgets: one per ask kind (cli/lib/ui/events.ts AskKind). Taken from the approved mockup
   (installer-ui-spike/mockup/src/asks.js) and rewired to the event spec: `finish(value)` sends the answer;
   the label shown afterwards comes back from the server in the `answered` event, so every tab shows the
   same text. Strings from the server are text (`h` children) or limited markup (`safe`), never raw HTML. */
window.ASK_KINDS = (() => {
  const S = () => window.UI.S;

  function renderDiff(h, lines) {
    return h('div', { class: 'diff' }, (lines || []).map(l => h('div', { class: l[0] === '+' ? 'add' : l[0] === '-' ? 'rem' : l[0] === '@' ? 'hunk' : '' }, l)));
  }

  const CHECK = '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 5.2l2.2 2.2L8.5 2.6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const kinds = {
    select(ask, finish, { h, safe }) {
      const options = ask.spec.options || [];
      let sel = options.findIndex(o => o.value === ask.default);
      if (sel < 0) { sel = 0; }
      const submit = () => finish(options[sel].value);
      const btns = options.map((o, i) => h('button', {
        'type': 'button',
        'class': 'opt radio',
        'role': 'radio',
        'aria-checked': String(i === sel),
        'onclick': () => { sel = i; btns.forEach((b, j) => b.setAttribute('aria-checked', String(j === i))); },
        'ondblclick': () => submit(),
      }, h('span', { class: 'on' }, h('span', { class: 'box' }), o.label, o.rec ? h('span', { class: 'rec' }, S().recommended) : null), o.desc ? h('span', { class: 'od', html: safe(o.desc) }) : null));
      return { el: h('div', { class: 'opts', role: 'radiogroup' }, btns), submit };
    },

    multi(ask, finish, { h, safe }) {
      const options = ask.spec.options || [];
      const on = new Set(options.filter(o => o.checked).map(o => o.value));
      const err = h('div', { class: 'err-text', hidden: true }, ask.spec.minMsg || S().pickOne);
      const btns = options.map((o) => {
        const b = h('button', {
          'type': 'button',
          'class': 'opt',
          'role': 'checkbox',
          'aria-checked': String(on.has(o.value)),
          'onclick': () => { on.has(o.value) ? on.delete(o.value) : on.add(o.value); b.setAttribute('aria-checked', String(on.has(o.value))); err.hidden = true; },
        }, h('span', { class: 'on' }, h('span', { class: 'box', html: CHECK }), o.label, o.rec ? h('span', { class: 'rec' }, S().recommended) : null), o.desc ? h('span', { class: 'od', html: safe(o.desc) }) : null);
        return b;
      });
      const submit = () => {
        if (ask.spec.min && on.size < ask.spec.min) { err.hidden = false; return; }
        finish(options.filter(o => on.has(o.value)).map(o => o.value));
      };
      return { el: h('div', { style: 'display:grid;gap:8px' }, h('div', { class: 'opts' }, btns), err), submit };
    },

    text(ask, finish, { h, safe }) {
      const fields = ask.spec.fields || [];
      const rows = fields.map((f) => {
        const inp = h('input', { id: `f-${ask.id}-${f.id}`, value: f.value || '', placeholder: f.placeholder || '', autocomplete: 'off', spellcheck: 'false' });
        const err = h('div', { class: 'err-text', hidden: true });
        const el = h('div', { class: 'field' }, h('label', { for: inp.id }, f.label), h('div', { class: 'inp-wrap' }, f.prefix ? h('span', { class: 'pre' }, f.prefix) : null, inp), f.hint ? h('div', { class: 'hint', html: safe(f.hint) }) : null, err);
        return { f, inp, err, el };
      });
      const submit = () => {
        let ok = true;
        for (const { f, inp, err } of rows) {
          const v = inp.value.trim();
          let msg = '';
          if (f.required && !v) { msg = S().required; }
          else if (v && f.pattern && !new RegExp(f.pattern).test(v)) { msg = f.patternMsg || S().required; }
          err.textContent = msg;
          err.hidden = !msg;
          if (msg) { ok = false; }
        }
        if (ok) { finish(rows.map(r => r.inp.value.trim())); }
      };
      return { el: h('div', { style: 'display:grid;gap:10px' }, rows.map(r => r.el)), submit };
    },

    secret(ask, finish, { h, safe, ICON }) {
      const spec = ask.spec;
      const inp = h('input', { id: `f-${ask.id}`, type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: S().secretPlaceholder });
      const peek = h('button', { type: 'button', class: 'peek', onclick: () => { inp.type = inp.type === 'password' ? 'text' : 'password'; peek.textContent = inp.type === 'password' ? S().secretShow : S().secretHide; } }, S().secretShow);
      const err = h('div', { class: 'err-text', hidden: true }, S().secretMissing);
      const el = h('div', { style: 'display:grid;gap:8px' }, h('div', { class: 'field' }, h('label', { for: inp.id }, spec.label || ask.title), h('div', { class: 'inp-wrap' }, spec.varName ? h('span', { class: 'pre' }, spec.varName) : null, inp, peek), spec.hint ? h('div', { class: 'hint', html: safe(spec.hint) }) : null, err), h('div', { class: 'secret-note' }, h('span', { html: ICON.lock }), h('span', { html: safe(spec.note || S().secretNote) })));
      const submit = () => {
        if (!inp.value) { err.hidden = false; return; }
        const v = inp.value;
        inp.value = '';
        finish(v);
      };
      return { el, submit };
    },

    confirm(ask, finish, { h }) {
      const yes = ask.spec.yes || S().yes;
      const no = ask.spec.no || S().no;
      const el = h('div', { class: 'controls' }, h('button', { type: 'button', class: 'btn primary', onclick: () => finish(true) }, yes), h('button', { type: 'button', class: 'btn', onclick: () => finish(false) }, no));
      return { el };
    },

    files(ask, finish, { h, fill }) {
      const files = ask.spec.files || [];
      const on = new Set(files.filter(f => f.checked !== false).map(f => f.path));
      const count = h('span', {});
      const upd = () => { count.textContent = fill(S().filesSelected, { n: on.size, total: files.length }); };
      const rows = files.map((f) => {
        const cb = h('input', { 'type': 'checkbox', 'aria-label': f.path, 'checked': on.has(f.path) || null, 'onchange': () => { cb.checked ? on.add(f.path) : on.delete(f.path); upd(); } });
        let dv = null;
        const toggle = f.diff
          ? h('button', { type: 'button', class: 'link', onclick: (e) => {
              if (dv) { dv.remove(); dv = null; e.target.textContent = S().showChanges; }
              else { dv = renderDiff(h, f.diff); e.target.closest('.frow').append(dv); e.target.textContent = S().hideChanges; }
            } }, S().showChanges)
          : null;
        const row = h('div', { class: 'frow' }, cb, h('span', { class: 'path', title: f.path }, f.path), h('span', { class: 'delta' }, h('span', { class: 'a' }, `+${f.add || 0}`), ' ', h('span', { class: 'd' }, `−${f.del || 0}`)), h('span', { style: 'display:flex;gap:8px;align-items:center' }, f.kindLabel ? h('span', { class: `pill ${f.kind || 'mod'}` }, f.kindLabel) : null, toggle));
        return row;
      });
      upd();
      const setAll = (v) => { files.forEach(f => (v ? on.add(f.path) : on.delete(f.path))); rows.forEach((r) => { r.querySelector('input').checked = v; }); upd(); };
      const tools = h('div', { class: 'controls', style: 'font-size:13px' }, count, h('button', { type: 'button', class: 'btn-ghost', onclick: () => setAll(true) }, S().all), h('button', { type: 'button', class: 'btn-ghost', onclick: () => setAll(false) }, S().noneBtn));
      return { el: h('div', { style: 'display:grid;gap:8px' }, tools, h('div', { class: 'files' }, rows)), submit: () => finish(files.map(f => f.path).filter(p => on.has(p))) };
    },

    deletions(ask, finish, { h }) {
      const files = ask.spec.files || [];
      const del = new Set();
      const rows = files.map((f) => {
        const cb = h('input', { 'type': 'checkbox', 'aria-label': f.path, 'onchange': () => (cb.checked ? del.add(f.path) : del.delete(f.path)) });
        return h('div', { class: 'frow' }, cb, h('span', { class: 'path' }, f.path), h('span', { class: 'delta', style: 'color:var(--fg-3)' }, f.why || ''), h('span', { class: 'pill del' }, S().deletedUpstream));
      });
      return { el: h('div', { style: 'display:grid;gap:8px' }, h('div', { class: 'files' }, rows), h('div', { class: 'hint', style: 'font-size:12.5px;color:var(--fg-3)' }, S().deletionsHint)), submit: () => finish(files.map(f => f.path).filter(p => del.has(p))) };
    },

    divergence(ask, finish, ctx) {
      const { h } = ctx;
      const spec = ask.spec;
      const split = h('div', { class: 'split' }, h('div', { class: 'side' }, h('h5', {}, h('span', {}, S().yourVersion), h('span', { class: 'mono', style: 'color:var(--fg-3)' }, spec.mineMeta || '')), renderDiff(h, spec.mine)), h('div', { class: 'side' }, h('h5', {}, h('span', {}, S().newVersion), h('span', { class: 'mono', style: 'color:var(--fg-3)' }, spec.theirsMeta || '')), renderDiff(h, spec.theirs)));
      const choice = kinds.select(ask, finish, ctx);
      return { el: h('div', { style: 'display:grid;gap:10px' }, split, choice.el), submit: choice.submit };
    },
  };
  kinds['package-keys'] = kinds.multi;
  kinds.renderDiff = renderDiff;
  return kinds;
})();
