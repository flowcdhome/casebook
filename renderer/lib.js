// Общие утилиты: горячие клавиши, настройки по умолчанию, контекстное меню, уведомления, палитра команд.
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- горячие клавиши (по физической клавише, поэтому работают и в русской раскладке) ---------- */
  const CODE = { Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Backquote: '`', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Backslash: '\\', NumpadAdd: '+', NumpadSubtract: '-' };
  const KEY = { arrowleft: 'Left', arrowright: 'Right', arrowup: 'Up', arrowdown: 'Down', ' ': 'Space', contextmenu: 'Menu' };
  function keyName(e) {
    const c = e.code || '';
    if (/^Key[A-Z]$/.test(c)) return c[3];
    if (/^Digit\d$/.test(c)) return c[5];
    if (CODE[c]) return CODE[c];
    const k = e.key || '', l = k.toLowerCase();
    if (KEY[l]) return KEY[l];
    return k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1);
  }
  const combo = e => [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', keyName(e)].filter(Boolean).join('+');
  const isMod = e => ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key);
  function norm(spec) {
    let s = String(spec).trim();
    const mods = [];
    for (;;) { const m = s.match(/^(ctrl|alt|shift)\+(?=.)/i); if (!m) break; mods.push(m[1].toLowerCase()); s = s.slice(m[0].length); }
    return [...['ctrl', 'alt', 'shift'].filter(x => mods.includes(x)), s.toLowerCase()].join('+');
  }
  const specs = v => (Array.isArray(v) ? v : v ? [v] : []);
  const match = (e, v) => !isMod(e) && specs(v).some(s => norm(s) === combo(e).toLowerCase());
  function capture(cb) {
    const h = e => {
      if (isMod(e)) return;
      e.preventDefault(); e.stopPropagation();
      removeEventListener('keydown', h, true);
      if (e.key !== 'Escape') cb(combo(e));
      else cb(null);
    };
    addEventListener('keydown', h, true);
  }

  /* ---------- настройки по умолчанию (единственный источник правды) ---------- */
  const DEFAULT_CONF = {
    accent: '#d9a441',
    boardStep: 10,
    boardBigStep: 60,
    binds: {
      newCase: 'Ctrl+N', addLead: 'Ctrl+L', export: 'Ctrl+E', help: 'F1', palette: 'Ctrl+K', settings: 'Ctrl+,',
      tabLeads: 'Alt+1', tabBoard: 'Alt+2', tabNotes: 'Alt+3',
    },
    board: {
      newBlock: 'N', child: 'Tab', edit: ['Enter', 'F2'], delete: ['Delete', 'Backspace'],
      selectAll: 'Ctrl+A', deselect: 'Escape', duplicate: 'Ctrl+D', copy: 'Ctrl+C', cut: 'Ctrl+X',
      undo: 'Ctrl+Z', redo: ['Ctrl+Shift+Z', 'Ctrl+Y'],
      moveLeft: 'Left', moveRight: 'Right', moveUp: 'Up', moveDown: 'Down',
      moveBigLeft: 'Shift+Left', moveBigRight: 'Shift+Right', moveBigUp: 'Shift+Up', moveBigDown: 'Shift+Down',
      navLeft: 'Alt+Left', navRight: 'Alt+Right', navUp: 'Alt+Up', navDown: 'Alt+Down',
      panLeft: 'Ctrl+Left', panRight: 'Ctrl+Right', panUp: 'Ctrl+Up', panDown: 'Ctrl+Down',
      link: 'L', color: 'K', toLead: 'Shift+L', fit: 'F', zoomIn: ['=', 'Shift+=', '+'], zoomOut: ['-', 'Shift+-'], menu: ['Shift+F10', 'Menu'],
    },
    runners: {
      sherlock: { cmd: 'sherlock', args: ['{v}', '--print-found', '--timeout', '10'], types: ['username'] },
      maigret: { cmd: 'maigret', args: ['{v}', '--no-color', '--no-progressbar'], types: ['username'] },
      holehe: { cmd: 'holehe', args: ['{v}', '--only-used', '--no-color', '--no-clear'], types: ['email'] },
      whois: { cmd: 'whois', args: ['{v}'], types: ['domain', 'ip'] },
    },
    services: [
      { name: 'OSINTSearch', url: 'https://osintsearch.org/?q={v}', types: ['username', 'email', 'phone', 'name'] },
      { name: 'OSINTList', url: 'https://osintlist.cc/', types: ['username', 'email', 'phone', 'name', 'domain'] },
    ],
  };
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const merge = (d, u) => {
    const o = { ...d };
    for (const k in u || {}) o[k] = isObj(d[k]) && isObj(u[k]) ? merge(d[k], u[k]) : u[k];
    return o;
  };

  /* ---------- контекстное меню ---------- */
  let open = null;
  function closeMenu() {
    if (!open) return;
    open.el.remove();
    document.removeEventListener('mousedown', open.out, true);
    document.removeEventListener('keydown', open.key, true);
    open = null;
  }
  function menu(items, x, y, opts = {}) {
    closeMenu();
    const el = document.createElement('div');
    el.className = 'cmenu';
    for (const it of items) {
      if (it.sep) { const s = document.createElement('div'); s.className = 'csep'; el.appendChild(s); continue; }
      if (it.swatches) {
        const r = document.createElement('div'); r.className = 'cswa';
        it.swatches.forEach((c, i) => { const b = document.createElement('button'); b.style.background = c || '#3a3a3a'; b.onclick = () => { closeMenu(); it.fn(i); }; r.appendChild(b); });
        el.appendChild(r); continue;
      }
      const b = document.createElement('button');
      b.className = 'cit'; b.disabled = !!it.off;
      const l = document.createElement('span'); l.textContent = it.label;
      const k = document.createElement('i'); k.textContent = (it.key || '') + (it.sub ? ' ▸' : '');
      b.append(l, k);
      b.onclick = () => {
        if (it.sub) { const r = b.getBoundingClientRect(); menu(it.sub, r.right - 4, r.top, { focus: true }); }
        else { closeMenu(); if (it.fn) it.fn(); }
      };
      el.appendChild(b);
    }
    document.body.appendChild(el);
    el.style.left = Math.max(4, Math.min(x, innerWidth - el.offsetWidth - 4)) + 'px';
    el.style.top = Math.max(4, Math.min(y, innerHeight - el.offsetHeight - 4)) + 'px';
    const out = e => { if (!el.contains(e.target)) closeMenu(); };
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault(); e.stopPropagation();
      const btns = [...el.querySelectorAll('.cit')].filter(b => !b.disabled), i = btns.indexOf(document.activeElement), d = e.key === 'ArrowDown' ? 1 : -1;
      const next = btns[(i + d + btns.length) % btns.length] || btns[0];
      if (next) next.focus();
    };
    open = { el, out, key };
    setTimeout(() => { document.addEventListener('mousedown', out, true); document.addEventListener('keydown', key, true); }, 0);
    if (opts.focus) { const f = [...el.querySelectorAll('.cit')].find(b => !b.disabled); if (f) f.focus(); }
    return el;
  }

  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2400);
  }

  /* ---------- палитра команд ---------- */
  function palette(items, placeholder) {
    const ov = document.createElement('div'); ov.className = 'pal';
    const bx = document.createElement('div'); bx.className = 'palbox';
    const inp = document.createElement('input'); inp.placeholder = placeholder || 'Команда, дело или зацепка…';
    const list = document.createElement('div'); list.className = 'pallist';
    bx.append(inp, list); ov.appendChild(bx); document.body.appendChild(ov);
    let shown = [], idx = 0;
    const close = () => ov.remove();
    const run = n => { const it = shown[n]; close(); if (it) it.fn(); };
    const draw = () => {
      const q = inp.value.trim().toLowerCase();
      shown = items.filter(i => !q || i.label.toLowerCase().includes(q)).slice(0, 14);
      idx = Math.min(idx, Math.max(0, shown.length - 1));
      list.innerHTML = '';
      shown.forEach((it, n) => {
        const r = document.createElement('button'); r.className = 'palit' + (n === idx ? ' on' : '');
        const a = document.createElement('span'); a.textContent = it.label;
        const b = document.createElement('i'); b.textContent = it.hint || '';
        r.append(a, b); r.onclick = () => run(n); list.appendChild(r);
      });
    };
    inp.oninput = () => { idx = 0; draw(); };
    inp.onkeydown = e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, shown.length - 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(idx); }
    };
    ov.onmousedown = e => { if (e.target === ov) close(); };
    draw(); inp.focus();
  }

  const Lib = { esc, DEFAULT_CONF, merge, combo, match, specs, norm, capture, menu, closeMenu, toast, palette };
  if (typeof module !== 'undefined' && module.exports) module.exports = Lib; else window.Lib = Lib;
})();
