// Минимальная имитация DOM для проверки логики без браузера.
class El {
  constructor(tag) {
    this.tag = (tag || '').toUpperCase(); this.tagName = this.tag; this.children = []; this.parent = null; this.attrs = {}; this.listeners = {};
    this._cls = new Set(); this.style = { setProperty() {} }; this.dataset = {}; this.isConnected = true; this._text = '';
    this.offsetWidth = 150; this.offsetHeight = 40; this.clientWidth = 1000; this.clientHeight = 600; this.isContentEditable = false;
    const self = this;
    this.classList = { toggle(c, on) { if (on === undefined ? !self._cls.has(c) : on) self._cls.add(c); else self._cls.delete(c); }, add(c) { self._cls.add(c); }, remove(c) { self._cls.delete(c); }, contains(c) { return self._cls.has(c); } };
  }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._cls].join(' '); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set innerText(v) { this._text = String(v); }
  get innerText() { return this.textContent; }
  set innerHTML(v) { this.children = []; this._text = ''; this._html = String(v); }
  get innerHTML() { return this._html || ''; }
  appendChild(c) { this.children.push(c); c.parent = this; return c; }
  append(...cs) { cs.forEach(c => this.appendChild(c)); }
  get nextSibling() { if (!this.parent) return null; const i = this.parent.children.indexOf(this); return this.parent.children[i + 1] || null; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); this.isConnected = false; this.parent = null; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'class') this.className = v; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  fire(t, ev) { (this.listeners[t] || []).forEach(f => f(ev)); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 150, bottom: 40, width: 1000, height: 600 }; }
  focus() { document.activeElement = this; } select() {} blur() { if (this.onblur) this.onblur(); }
  contains(e) { for (let x = e; x; x = x.parent) if (x === this) return true; return false; }
  one(sel) { sel = sel.trim(); if (sel[0] === '.') return this._cls.has(sel.slice(1)); if (sel[0] === '#') return this.attrs.id === sel.slice(1); return this.tag === sel.toUpperCase(); }
  match(sel) { return sel.split(',').some(s => { const parts = s.trim().split(/\s+/); if (!this.one(parts.pop())) return false; let p = this.parent; for (let i = parts.length - 1; i >= 0; i--) { while (p && !p.one(parts[i])) p = p.parent; if (!p) return false; p = p.parent; } return true; }); }
  all(sel, out = []) { for (const c of this.children) { if (c.match(sel)) out.push(c); c.all(sel, out); } return out; }
  querySelector(sel) { return this.all(sel)[0] || null; }
  querySelectorAll(sel) { return this.all(sel); }
  closest(sel) { let e = this; while (e) { if (e.match(sel)) return e; e = e.parent; } return null; }
}
const listeners = {};
const ev = (type, o = {}) => ({ type, preventDefault() { this.dp = true; }, stopPropagation() {}, target: o.target || document.body, key: '', code: '', ...o });
function install() {
  const body = new El('body');
  globalThis.window = globalThis;
  globalThis.document = {
    body, head: new El('head'), documentElement: new El('html'), activeElement: body, createElement: t => new El(t), createElementNS: (n, t) => new El(t),
    getElementById: () => null, querySelector: s => body.querySelector(s), querySelectorAll: s => body.querySelectorAll(s),
    addEventListener: (t, f) => (listeners[t] = listeners[t] || []).push(f), removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter(x => x !== f); },
    elementFromPoint: () => null, createRange: () => ({ selectNodeContents() {}, collapse() {} }),
  };
  globalThis.addEventListener = document.addEventListener; globalThis.removeEventListener = document.removeEventListener;
  globalThis.getSelection = () => ({ removeAllRanges() {}, addRange() {} });
  globalThis.innerWidth = 1600; globalThis.innerHeight = 900;
  globalThis.confirm = () => true;
  let clipText = '';
  Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: t => { clipText = t; return Promise.resolve(); } } }, configurable: true, writable: true });
  return { body, press(key, mods = {}) { const e = ev('keydown', { key: key.length === 1 ? key.toLowerCase() : key, code: mods.code || (key.length === 1 ? 'Key' + key.toUpperCase() : key), ...mods }); (listeners.keydown || []).slice().forEach(f => f(e)); return e; },
    paste(text) { const e = ev('paste', { clipboardData: { items: [], getData: () => text } }); (listeners.paste || []).slice().forEach(f => f(e)); return e; }, clip: () => clipText, listeners };
}
module.exports = { El, install, ev };
