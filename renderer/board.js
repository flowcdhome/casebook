// Холст: блоки и стрелки. Выделение, контекстные меню, работа с клавиатуры, отмена/повтор, выравнивание.
(() => {
  const L = window.Lib, NS = 'http://www.w3.org/2000/svg';
  const STRIPES = ['', '#d9a441', '#5fa8d3', '#7bb274', '#c2706b', '#9a82b5'];
  const ECOL = ['', '#7bd88f', '#5fd0e0', '#d9a441', '#c2706b'];
  const TL = { username: 'ник', email: 'почта', phone: 'телефон', domain: 'домен', ip: 'ip', url: 'ссылка', name: 'имя', note: 'текст' };
  let X, B, root, world, svg, defs, rb = null, nodesEl = new Map(), sel = new Set(), selE = null;
  let editing = null, linkMode = null, clip = null, clipTag = '', hist = [], hi = 0, space = false, moveT = null;

  const h = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };
  const S = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const nodeById = id => B.nodes.find(n => n.id === id);
  const single = () => (sel.size === 1 ? nodeById([...sel][0]) : null);
  const hint = a => L.specs((X.binds() || {})[a])[0] || '';
  const box = n => { const e = nodesEl.get(n.id); return { x: n.x, y: n.y, w: e ? e.offsetWidth : 160, h: e ? e.offsetHeight : 40 }; };
  const applyView = () => {
    const v = B.view;
    world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`;
    root.style.backgroundSize = `${24 * v.k}px ${24 * v.k}px`;
    root.style.backgroundPosition = `${v.x}px ${v.y}px`;
  };
  const toWorld = (cx, cy) => { const r = root.getBoundingClientRect(); return { x: (cx - r.left - B.view.x) / B.view.k, y: (cy - r.top - B.view.y) / B.view.k }; };
  const centre = () => { const r = root.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); };

  /* ---------- история (отмена / повтор) ---------- */
  const snap = () => JSON.stringify({ nodes: B.nodes, edges: B.edges });
  function commit() {
    const s = snap();
    if (s !== hist[hi]) { hist.length = hi + 1; hist.push(s); if (hist.length > 80) hist.shift(); hi = hist.length - 1; }
    X.save();
  }
  function restore(s) {
    const d = JSON.parse(s);
    B.nodes = d.nodes; B.edges = d.edges;
    sel = new Set([...sel].filter(id => nodeById(id))); selE = null;
    renderAll(); X.save();
  }
  const undo = () => { if (hi > 0) { hi--; restore(hist[hi]); } else X.toast('Нечего отменять'); };
  const redo = () => { if (hi < hist.length - 1) { hi++; restore(hist[hi]); } else X.toast('Нечего повторять'); };

  /* ---------- геометрия стрелок ---------- */
  function anchors(a, b) {
    const A = box(a), Q = box(b);
    const ax = A.x + A.w / 2, ay = A.y + A.h / 2, bx = Q.x + Q.w / 2, by = Q.y + Q.h / 2, dx = bx - ax, dy = by - ay;
    if (Math.abs(dx) >= Math.abs(dy) * 0.8) {
      const s = Math.sign(dx) || 1, p1 = { x: ax + s * A.w / 2, y: ay }, p2 = { x: bx - s * Q.w / 2, y: by }, k = Math.max(40, Math.abs(p2.x - p1.x) * 0.5);
      return [p1, { x: p1.x + s * k, y: p1.y }, { x: p2.x - s * k, y: p2.y }, p2];
    }
    const s = Math.sign(dy) || 1, p1 = { x: ax, y: ay + s * A.h / 2 }, p2 = { x: bx, y: by - s * Q.h / 2 }, k = Math.max(40, Math.abs(p2.y - p1.y) * 0.5);
    return [p1, { x: p1.x, y: p1.y + s * k }, { x: p2.x, y: p2.y - s * k }, p2];
  }
  const mid = (p, c1, c2, q) => ({ x: (p.x + 3 * c1.x + 3 * c2.x + q.x) / 8, y: (p.y + 3 * c1.y + 3 * c2.y + q.y) / 8 });
  function marker(col) {
    const id = 'm' + col.replace('#', '');
    if (!defs.querySelector('#' + id)) {
      const m = S('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto' }, defs);
      S('path', { d: 'M0,0 L10,5 L0,10 z', fill: col }, m);
    }
    return id;
  }
  function drawEdges() {
    svg.querySelectorAll('.eg').forEach(x => x.remove());
    for (const ed of B.edges) {
      const a = nodeById(ed.from), b = nodeById(ed.to);
      if (!a || !b) continue;
      const [p1, c1, c2, p2] = anchors(a, b), col = ed.color || '#8a867e', g = S('g', { class: 'eg' }, svg);
      const d = `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
      S('path', { d, fill: 'none', stroke: col, 'stroke-width': ed.id === selE ? 3.2 : 1.8, 'marker-end': `url(#${marker(col)})` }, g);
      const hit = S('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': 14, style: 'pointer-events:stroke;cursor:pointer' }, g);
      hit.addEventListener('mousedown', ev => { if (ev.button !== 0) return; ev.stopPropagation(); sel = new Set(); selE = ed.id; refresh(); });
      hit.addEventListener('dblclick', ev => { ev.stopPropagation(); editLabel(ed, mid(p1, c1, c2, p2)); });
      hit.addEventListener('contextmenu', ev => { ev.preventDefault(); ev.stopPropagation(); sel = new Set(); selE = ed.id; refresh(); edgeMenu(ed, ev.clientX, ev.clientY); });
      if (ed.label) {
        const m = mid(p1, c1, c2, p2), t = S('text', { x: m.x, y: m.y - 6, 'text-anchor': 'middle', fill: '#e8e4dc', style: 'font-size:12px;paint-order:stroke;stroke:#121212;stroke-width:4px;pointer-events:none' }, g);
        t.textContent = ed.label;
      }
    }
  }
  function refresh() {
    nodesEl.forEach((e, id) => { e.classList.toggle('sel', sel.has(id)); e.classList.toggle('cand', !!linkMode && linkMode.cand === id); });
    drawEdges();
  }
  const setSel = ids => { sel = new Set(ids); selE = null; refresh(); };

  /* ---------- правка текста, подписи ---------- */
  function editLabel(ed, p) {
    const i = h('input', 'bl', root);
    i.value = ed.label || '';
    i.style.left = (p.x * B.view.k + B.view.x - 60) + 'px';
    i.style.top = (p.y * B.view.k + B.view.y - 14) + 'px';
    i.focus(); i.select();
    i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); else if (e.key === 'Escape') { i.value = ed.label || ''; i.blur(); } };
    i.onblur = () => { ed.label = i.value.trim(); i.remove(); drawEdges(); commit(); };
  }
  function editLabelOf(ed) {
    const a = nodeById(ed.from), b = nodeById(ed.to);
    if (a && b) { const [p1, c1, c2, p2] = anchors(a, b); editLabel(ed, mid(p1, c1, c2, p2)); }
  }
  function startEdit(n) {
    const e = nodesEl.get(n.id), t = e.querySelector('.t');
    editing = n.id; t.contentEditable = 'true'; e.style.cursor = 'text'; e.style.userSelect = 'text';
    t.focus();
    const r = document.createRange(); r.selectNodeContents(t); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    t.oninput = () => { n.text = t.innerText; drawEdges(); };
    t.onkeydown = ev => {
      ev.stopPropagation();
      if (ev.key === 'Escape' || (ev.key === 'Enter' && !ev.shiftKey)) { ev.preventDefault(); t.blur(); }
      else if (ev.key === 'Tab') { ev.preventDefault(); t.blur(); A.child(); }
    };
    t.onblur = () => { t.contentEditable = 'false'; e.style.cursor = ''; e.style.userSelect = ''; editing = null; n.text = t.innerText.trim(); t.textContent = n.text; drawEdges(); commit(); };
  }

  /* ---------- узлы ---------- */
  function drawNode(n) {
    const e = h('div', 'bn' + (n.img ? ' im' : ''), world);
    e.style.left = n.x + 'px'; e.style.top = n.y + 'px';
    if (STRIPES[n.color]) e.style.setProperty('--stripe', STRIPES[n.color]);
    if (n.img && B.images[n.img]) { const im = h('img', '', e); im.src = B.images[n.img]; im.draggable = false; }
    h('div', 't', e).textContent = n.text || '';
    h('div', 'bh', e).title = 'Потяните к другому блоку или в пустое место';
    nodesEl.set(n.id, e);
    e.addEventListener('mousedown', ev => nodeDown(n, ev));
    e.addEventListener('dblclick', ev => { ev.stopPropagation(); startEdit(n); });
    e.addEventListener('contextmenu', ev => { ev.preventDefault(); ev.stopPropagation(); if (!sel.has(n.id)) setSel([n.id]); nodeMenu(ev.clientX, ev.clientY); });
  }
  function renderAll() { nodesEl.forEach(e => e.remove()); nodesEl = new Map(); B.nodes.forEach(drawNode); refresh(); }
  function newNode(x, y, text, extra) {
    const n = { id: X.uid(), x, y, text: text || '', color: 0, ...(extra || {}) };
    B.nodes.push(n); drawNode(n); return n;
  }
  function nodeDown(n, ev) {
    if (ev.button !== 0) return;
    if (ev.target.classList.contains('bh')) return link(n, ev);
    ev.stopPropagation();
    if (editing === n.id) return;
    if (linkMode) return finishLink(n.id);
    if (ev.shiftKey || ev.ctrlKey) { if (sel.has(n.id)) sel.delete(n.id); else sel.add(n.id); selE = null; refresh(); return; }
    if (!sel.has(n.id)) setSel([n.id]);
    const sx = ev.clientX, sy = ev.clientY, starts = [...sel].map(id => { const q = nodeById(id); return [q, q.x, q.y]; });
    let moved = false;
    const mv = m => {
      if (!moved && Math.abs(m.clientX - sx) + Math.abs(m.clientY - sy) < 3) return;
      moved = true;
      const dx = (m.clientX - sx) / B.view.k, dy = (m.clientY - sy) / B.view.k;
      starts.forEach(([q, x, y]) => { q.x = x + dx; q.y = y + dy; const el = nodesEl.get(q.id); el.style.left = q.x + 'px'; el.style.top = q.y + 'px'; });
      drawEdges();
    };
    const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (moved) commit(); else if (sel.size > 1) setSel([n.id]); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  }

  /* ---------- связи ---------- */
  const addEdge = (a, b) => { if (a !== b && !B.edges.some(q => q.from === a && q.to === b)) { B.edges.push({ id: X.uid(), from: a, to: b, label: '', color: '' }); return true; } return false; };
  function link(n, ev) {
    ev.preventDefault(); ev.stopPropagation();
    const a = box(n), p1 = { x: a.x + a.w, y: a.y + a.h / 2 };
    const tmp = S('path', { fill: 'none', stroke: '#d9a441', 'stroke-width': 1.8, 'stroke-dasharray': '5 4' }, svg);
    const mv = m => { const w = toWorld(m.clientX, m.clientY); tmp.setAttribute('d', `M${p1.x},${p1.y} L${w.x},${w.y}`); };
    const up = m => {
      removeEventListener('mousemove', mv); removeEventListener('mouseup', up); tmp.remove();
      const at = document.elementFromPoint(m.clientX, m.clientY), t = at && at.closest('.bn');
      let to = null, created = null;
      if (t) { const hit = B.nodes.find(q => nodesEl.get(q.id) === t); if (hit) to = hit.id; }
      else if (at && root.contains(at)) { const w = toWorld(m.clientX, m.clientY); created = newNode(w.x + 12, w.y - 18, ''); to = created.id; }
      if (to) addEdge(n.id, to);
      refresh(); commit();
      if (created) startEdit(created);
    };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  }
  function startLinkMode() {
    const s = single();
    if (!s) return X.toast('Выберите один блок');
    linkMode = { from: s.id, cand: null };
    X.toast('Связь: кликните по блоку-цели или Alt+стрелки и Enter. Esc: отмена');
  }
  function finishLink(to) {
    const from = linkMode.from; linkMode = null;
    if (addEdge(from, to)) { X.toast('Связь создана'); commit(); }
    refresh();
  }
  function neighbor(fromId, dx, dy) {
    const A0 = box(nodeById(fromId)), cx = A0.x + A0.w / 2, cy = A0.y + A0.h / 2;
    let best = null, bs = Infinity;
    for (const n of B.nodes) {
      if (n.id === fromId) continue;
      const b = box(n), x = b.x + b.w / 2 - cx, y = b.y + b.h / 2 - cy, along = x * dx + y * dy;
      if (along <= 0) continue;
      const s = along + Math.abs(x * dy - y * dx) * 2;
      if (s < bs) { bs = s; best = n; }
    }
    return best;
  }
  function reveal(n) {
    const b = box(n), k = B.view.k, sx = b.x * k + B.view.x, sy = b.y * k + B.view.y, w = root.clientWidth, hh = root.clientHeight;
    if (sx < 20 || sy < 20 || sx + b.w * k > w - 20 || sy + b.h * k > hh - 20) {
      B.view.x = w / 2 - (b.x + b.w / 2) * k; B.view.y = hh / 2 - (b.y + b.h / 2) * k; applyView(); X.save();
    }
  }
  function nav(dx, dy) {
    if (linkMode) { const n = neighbor(linkMode.cand || linkMode.from, dx, dy); if (n) { linkMode.cand = n.id; refresh(); reveal(n); } return; }
    const s = single();
    if (!s) { const first = [...B.nodes].sort((a, b) => a.y - b.y || a.x - b.x)[0]; if (first) { setSel([first.id]); reveal(first); } return; }
    const n = neighbor(s.id, dx, dy);
    if (n) { setSel([n.id]); reveal(n); }
  }

  /* ---------- действия над выделением ---------- */
  function move(dx, dy, big) {
    const c = X.conf(), st = big ? c.boardBigStep : c.boardStep;
    clearTimeout(moveT);
    if (!sel.size) { B.view.x -= dx * st * B.view.k; B.view.y -= dy * st * B.view.k; applyView(); moveT = setTimeout(() => X.save(), 400); return; }
    sel.forEach(id => { const n = nodeById(id), e = nodesEl.get(id); n.x += dx * st; n.y += dy * st; e.style.left = n.x + 'px'; e.style.top = n.y + 'px'; });
    drawEdges(); moveT = setTimeout(commit, 400);
  }
  function pan(dx, dy) { B.view.x -= dx * 80; B.view.y -= dy * 80; applyView(); clearTimeout(moveT); moveT = setTimeout(() => X.save(), 400); }
  function removeSel() {
    if (sel.size) { const ids = sel; B.nodes = B.nodes.filter(n => !ids.has(n.id)); B.edges = B.edges.filter(e => !ids.has(e.from) && !ids.has(e.to)); ids.forEach(id => { const e = nodesEl.get(id); if (e) e.remove(); nodesEl.delete(id); }); sel = new Set(); }
    else if (selE) { B.edges = B.edges.filter(e => e.id !== selE); selE = null; }
    else return;
    refresh(); commit();
  }
  function setColor(i) {
    sel.forEach(id => { const n = nodeById(id); n.color = i; const e = nodesEl.get(id); e.style.setProperty('--stripe', STRIPES[i] || '#3a3a3a'); });
    commit();
  }
  function cycleColor() {
    const s = single();
    if (s) return setColor((s.color + 1) % STRIPES.length);
    if (sel.size) return setColor(((nodeById([...sel][0]).color || 0) + 1) % STRIPES.length);
    if (selE) { const ed = B.edges.find(q => q.id === selE); ed.color = ECOL[(ECOL.indexOf(ed.color || '') + 1) % ECOL.length]; drawEdges(); commit(); }
  }
  function cloneSel(dx, dy) {
    const ns = B.nodes.filter(n => sel.has(n.id)), es = B.edges.filter(e => sel.has(e.from) && sel.has(e.to));
    return { nodes: JSON.parse(JSON.stringify(ns)), edges: JSON.parse(JSON.stringify(es)), dx, dy };
  }
  function insert(c, ox, oy) {
    const map = {}, ids = [];
    c.nodes.forEach(n => { const id = X.uid(); map[n.id] = id; ids.push(id); B.nodes.push({ ...n, id, x: n.x + ox, y: n.y + oy }); });
    c.edges.forEach(e => B.edges.push({ ...e, id: X.uid(), from: map[e.from], to: map[e.to] }));
    renderAll(); setSel(ids); commit();
  }
  function copy() {
    if (!sel.size) return false;
    clip = cloneSel(); clipTag = 'casebook:' + Date.now();
    if (navigator.clipboard) navigator.clipboard.writeText(clipTag).catch(() => {});
    X.toast('Скопировано блоков: ' + clip.nodes.length); return true;
  }
  const pasteClip = at => {
    if (!clip) return;
    const xs = clip.nodes.map(n => n.x), ys = clip.nodes.map(n => n.y);
    insert(clip, at ? at.x - Math.min(...xs) : 30, at ? at.y - Math.min(...ys) : 30);
  };
  function duplicate() { if (!sel.size) return; insert(cloneSel(), 30, 30); }
  function align(m) {
    const ns = [...sel].map(nodeById); if (ns.length < 2) return;
    const bs = ns.map(box), minX = Math.min(...bs.map(b => b.x)), maxR = Math.max(...bs.map(b => b.x + b.w)), minY = Math.min(...bs.map(b => b.y)), maxB = Math.max(...bs.map(b => b.y + b.h));
    ns.forEach((n, i) => {
      const b = bs[i];
      if (m === 'left') n.x = minX; else if (m === 'right') n.x = maxR - b.w; else if (m === 'hcenter') n.x = (minX + maxR) / 2 - b.w / 2;
      else if (m === 'top') n.y = minY; else if (m === 'bottom') n.y = maxB - b.h; else if (m === 'vcenter') n.y = (minY + maxB) / 2 - b.h / 2;
    });
    if (m === 'hdist' || m === 'vdist') {
      const hz = m === 'hdist', ord = ns.map((n, i) => [n, bs[i]]).sort((a, b) => (hz ? a[0].x - b[0].x : a[0].y - b[0].y));
      const span = hz ? maxR - minX : maxB - minY, total = ord.reduce((s, [, b]) => s + (hz ? b.w : b.h), 0), gap = (span - total) / (ord.length - 1);
      let p = hz ? minX : minY;
      ord.forEach(([n, b]) => { if (hz) n.x = p; else n.y = p; p += (hz ? b.w : b.h) + gap; });
    }
    ns.forEach(n => { const e = nodesEl.get(n.id); e.style.left = n.x + 'px'; e.style.top = n.y + 'px'; });
    drawEdges(); commit();
  }
  const ALIGN = [['По левому краю', 'left'], ['По центру', 'hcenter'], ['По правому краю', 'right'], ['По верхнему краю', 'top'], ['По середине', 'vcenter'], ['По нижнему краю', 'bottom'], ['Равномерно по горизонтали', 'hdist'], ['Равномерно по вертикали', 'vdist']];
  const alignItems = () => ALIGN.map(([label, m]) => ({ label, fn: () => align(m) }));
  function fit() {
    if (!B.nodes.length) return;
    const bs = B.nodes.map(box), x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)), x1 = Math.max(...bs.map(b => b.x + b.w)), y1 = Math.max(...bs.map(b => b.y + b.h));
    const rw = root.clientWidth, rh = root.clientHeight, k = Math.max(0.25, Math.min(1.2, (rw - 80) / (x1 - x0), (rh - 80) / (y1 - y0)));
    B.view = { k, x: (rw - (x1 - x0) * k) / 2 - x0 * k, y: (rh - (y1 - y0) * k) / 2 - y0 * k };
    applyView(); X.save();
  }
  function zoomAt(f, mx, my) {
    const v = B.view, k = Math.max(0.25, Math.min(2.5, v.k * f));
    v.x = mx - (mx - v.x) * (k / v.k); v.y = my - (my - v.y) * (k / v.k); v.k = k; applyView(); X.save();
  }
  const zoomBy = f => zoomAt(f, root.clientWidth / 2, root.clientHeight / 2);

  function template() {
    if (B.nodes.length && !confirm('Добавить шаблон к текущему холсту?')) return;
    const ox = B.nodes.length ? Math.max(...B.nodes.map(n => n.x)) + 1000 : 0;
    const mk = (x, y, t, color) => newNode(ox + x, y, t, { color });
    const c = mk(-95, -25, 'Информация о человеке', 1);
    const ln = (a, b, color) => B.edges.push({ id: X.uid(), from: a.id, to: b.id, label: '', color });
    const group = (x, y, title, kids, kx, ky, color) => { const g = mk(x, y, title, color); ln(c, g, '#7bd88f'); kids.forEach((k, i) => ln(g, mk(kx, ky + i * 68, k, 0), '#5fd0e0')); };
    group(-420, -130, 'Документы', ['Паспорт', 'Водительское удостоверение', 'СНИЛС', 'ИНН'], -740, -270, 2);
    group(250, -170, 'Биография', ['ФИО', 'Место работы', 'Номера телефонов', 'Место учёбы'], 560, -300, 3);
    ln(c, mk(250, -15, 'Связь с другими', 4), '#7bd88f');
    group(-420, 150, 'Данные в интернете', ['nickname', 'e-mail', 'Публикации'], -740, 90, 5);
    group(250, 170, 'Данные об интересах', ['Активность вне интернета', 'Активность в соц. сетях'], 560, 120, 1);
    fit(); refresh(); commit();
  }

  /* ---------- меню ---------- */
  function nodeMenu(x, y) {
    const n = sel.size, one = single();
    L.menu([
      ...(one ? [{ label: 'Редактировать', key: hint('edit'), fn: () => startEdit(one) }, { label: 'Новый дочерний', key: hint('child'), fn: () => A.child() }, { label: 'Соединить с…', key: hint('link'), fn: startLinkMode }] : []),
      { swatches: STRIPES, fn: setColor },
      { sep: true },
      { label: 'Дублировать', key: hint('duplicate'), fn: duplicate }, { label: 'Копировать', key: hint('copy'), fn: copy },
      { label: 'Вырезать', key: hint('cut'), fn: () => { if (copy()) removeSel(); } },
      ...(n > 1 ? [{ label: 'Выровнять', sub: alignItems() }] : []),
      ...(one && one.text ? [{ sep: true }, { label: 'Сделать зацепкой', key: hint('toLead'), fn: () => A.toLead() }, { label: 'Искать в Google', fn: () => X.open('https://www.google.com/search?q=' + encodeURIComponent('"' + one.text + '"')) }] : []),
      { sep: true }, { label: n > 1 ? `Удалить (${n})` : 'Удалить', key: hint('delete'), fn: removeSel },
    ], x, y, { focus: false });
  }
  function edgeMenu(ed, x, y) {
    L.menu([
      { label: 'Подпись', fn: () => editLabelOf(ed) },
      { swatches: ECOL, fn: i => { ed.color = ECOL[i]; drawEdges(); commit(); } },
      { label: 'Развернуть стрелку', fn: () => { const t = ed.from; ed.from = ed.to; ed.to = t; drawEdges(); commit(); } },
      { sep: true }, { label: 'Удалить', key: hint('delete'), fn: removeSel },
    ], x, y);
  }
  function canvasMenu(x, y) {
    const w = toWorld(x, y);
    L.menu([
      { label: 'Новый блок здесь', key: hint('newBlock'), fn: () => { const n = newNode(w.x - 60, w.y - 18, ''); setSel([n.id]); startEdit(n); } },
      { label: 'Вставить', off: !clip, fn: () => pasteClip(w) },
      { label: 'Выделить всё', key: hint('selectAll'), fn: () => A.selectAll() },
      { sep: true },
      { label: 'Шаблон: человек', fn: template }, { label: 'Вписать в экран', key: hint('fit'), fn: fit },
      { sep: true },
      { label: 'Отменить', key: hint('undo'), fn: undo }, { label: 'Повторить', key: hint('redo'), fn: redo },
    ], x, y);
  }
  function menuAtSelection() {
    const one = single(), r = root.getBoundingClientRect();
    if (one) { const e = nodesEl.get(one.id).getBoundingClientRect(); sel.size && nodeMenu(e.left + 20, e.bottom); }
    else if (sel.size) nodeMenu(r.left + 80, r.top + 80);
    else canvasMenu(r.left + r.width / 2, r.top + r.height / 2);
    const f = document.querySelector('.cmenu .cit'); if (f) f.focus();
  }

  /* ---------- действия, привязанные к клавишам (имена совпадают с binds.board в настройках) ---------- */
  const A = {
    newBlock() { const p = centre(), n = newNode(p.x - 80, p.y - 20, ''); setSel([n.id]); startEdit(n); },
    child() {
      const s = single();
      if (!s) return A.newBlock();
      const k = B.edges.filter(e => e.from === s.id).length, b = box(s), n = newNode(s.x + b.w + 90, s.y + k * 64, '');
      addEdge(s.id, n.id); setSel([n.id]); reveal(n); startEdit(n);
    },
    edit() {
      if (linkMode) { if (linkMode.cand) finishLink(linkMode.cand); return; }
      const s = single();
      if (s) startEdit(s); else if (selE) { const ed = B.edges.find(q => q.id === selE); if (ed) editLabelOf(ed); }
    },
    delete: removeSel,
    selectAll() { setSel(B.nodes.map(n => n.id)); },
    deselect() { if (linkMode) { linkMode = null; refresh(); X.toast('Связь отменена'); } else setSel([]); },
    duplicate, copy, cut() { if (copy()) removeSel(); }, undo, redo,
    moveLeft: () => move(-1, 0), moveRight: () => move(1, 0), moveUp: () => move(0, -1), moveDown: () => move(0, 1),
    moveBigLeft: () => move(-1, 0, true), moveBigRight: () => move(1, 0, true), moveBigUp: () => move(0, -1, true), moveBigDown: () => move(0, 1, true),
    navLeft: () => nav(-1, 0), navRight: () => nav(1, 0), navUp: () => nav(0, -1), navDown: () => nav(0, 1),
    panLeft: () => pan(-1, 0), panRight: () => pan(1, 0), panUp: () => pan(0, -1), panDown: () => pan(0, 1),
    link: startLinkMode, color: cycleColor, fit, zoomIn: () => zoomBy(1.2), zoomOut: () => zoomBy(1 / 1.2), menu: menuAtSelection,
    toLead() { const s = single(); if (s && s.text) { X.makeLead(s.text); X.toast('Зацепка добавлена'); } else X.toast('Выберите блок с текстом'); },
  };
  const LINK_KEYS = ['navLeft', 'navRight', 'navUp', 'navDown', 'edit', 'deselect'];

  /* ---------- монтирование ---------- */
  function mount(main, c, cx) {
    X = cx; B = c.board = c.board || {};
    B.nodes = B.nodes || []; B.edges = B.edges || []; B.images = B.images || {}; B.view = B.view || { x: 40, y: 40, k: 1 };
    const used = new Set(B.nodes.map(n => n.img).filter(Boolean));
    Object.keys(B.images).forEach(k => { if (!used.has(k)) delete B.images[k]; });
    const tabs = main.querySelector('.tabs');
    while (tabs.nextSibling) tabs.nextSibling.remove();
    const tool = h('div', 'btool', main);
    [['+ Блок', A.newBlock], ['Шаблон: человек', template], ['Вписать', fit], ['Отменить', undo], ['Повторить', redo], ['Цвет', cycleColor], ['Удалить', removeSel]].forEach(([t, f]) => { const b = h('button', '', tool); b.textContent = t; b.onclick = () => f(); });
    h('span', 'hint', tool).textContent = 'ПКМ: меню. Тяните по пустому месту: выделение. Пробел+тяните или средняя кнопка: двигать холст. Ctrl+K: все команды.';
    root = h('div', 'bd', main); world = h('div', 'bw', root);
    svg = S('svg', { width: 1, height: 1, style: 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none' }, world);
    defs = S('defs', {}, svg); nodesEl = new Map(); sel = new Set(); selE = null; editing = null; linkMode = null;
    B.nodes.forEach(drawNode); applyView(); drawEdges();
    hist = [snap()]; hi = 0;
    const isBg = t => t === root || t === world || t === svg;
    root.addEventListener('mousedown', ev => {
      if (!isBg(ev.target)) return;
      if (ev.button === 1 || (ev.button === 0 && space)) {
        ev.preventDefault();
        const sx = ev.clientX, sy = ev.clientY, ox = B.view.x, oy = B.view.y; let moved = false;
        const mv = m => { B.view.x = ox + m.clientX - sx; B.view.y = oy + m.clientY - sy; moved = true; applyView(); };
        const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (moved) X.save(); };
        addEventListener('mousemove', mv); addEventListener('mouseup', up); return;
      }
      if (ev.button !== 0) return;
      if (linkMode) { linkMode = null; refresh(); return; }
      const add = ev.shiftKey || ev.ctrlKey;
      if (!add) { sel = new Set(); selE = null; }
      refresh();
      const r0 = root.getBoundingClientRect(), sx = ev.clientX, sy = ev.clientY, base = new Set(sel);
      rb = h('div', 'rb', root);
      const mv = m => {
        const x0 = Math.min(sx, m.clientX), y0 = Math.min(sy, m.clientY), x1 = Math.max(sx, m.clientX), y1 = Math.max(sy, m.clientY);
        rb.style.left = (x0 - r0.left) + 'px'; rb.style.top = (y0 - r0.top) + 'px'; rb.style.width = (x1 - x0) + 'px'; rb.style.height = (y1 - y0) + 'px';
        const a = toWorld(x0, y0), b = toWorld(x1, y1);
        sel = new Set(base);
        B.nodes.forEach(n => { const q = box(n); if (q.x < b.x && q.x + q.w > a.x && q.y < b.y && q.y + q.h > a.y) sel.add(n.id); });
        nodesEl.forEach((e, id) => e.classList.toggle('sel', sel.has(id)));
      };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (rb) rb.remove(); rb = null; refresh(); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    });
    root.addEventListener('dblclick', ev => { if (!isBg(ev.target)) return; const w = toWorld(ev.clientX, ev.clientY), n = newNode(w.x - 60, w.y - 18, ''); setSel([n.id]); startEdit(n); });
    root.addEventListener('contextmenu', ev => { if (!isBg(ev.target)) return; ev.preventDefault(); canvasMenu(ev.clientX, ev.clientY); });
    root.addEventListener('wheel', ev => { ev.preventDefault(); const r = root.getBoundingClientRect(); zoomAt(ev.deltaY < 0 ? 1.1 : 1 / 1.1, ev.clientX - r.left, ev.clientY - r.top); }, { passive: false });

    if (!window.__boardInit) {
      window.__boardInit = true;
      const active = () => root && root.isConnected;
      const typing = t => /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
      addEventListener('keydown', ev => {
        if (!active() || typing(ev.target) || document.querySelector('.pal, .cmenu')) return;
        if (ev.code === 'Space') { space = true; ev.preventDefault(); return; }
        const b = X.binds() || {};
        for (const name in A) {
          if (!b[name] || !L.match(ev, b[name])) continue;
          ev.preventDefault();
          if (linkMode && !LINK_KEYS.includes(name)) return;
          A[name](); return;
        }
      });
      addEventListener('keyup', ev => { if (ev.code === 'Space') space = false; });
      document.addEventListener('paste', ev => {
        if (!active() || typing(ev.target)) return;
        const items = [...((ev.clipboardData && ev.clipboardData.items) || [])], im = items.find(i => i.type.startsWith('image/')), w = centre();
        if (im) {
          ev.preventDefault();
          const url = URL.createObjectURL(im.getAsFile()), img = new Image();
          img.onload = () => {
            const k = Math.min(1, 900 / img.width), cv = document.createElement('canvas');
            cv.width = img.width * k; cv.height = img.height * k; cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            const key = X.uid(); B.images[key] = cv.toDataURL('image/jpeg', 0.85);
            setSel([newNode(w.x - 100, w.y - 80, '', { img: key }).id]); commit(); URL.revokeObjectURL(url);
          };
          img.src = url; return;
        }
        const t = ev.clipboardData && ev.clipboardData.getData('text');
        if (!t) return;
        ev.preventDefault();
        if (t === clipTag && clip) pasteClip(); else { setSel([newNode(w.x - 90, w.y - 20, t.slice(0, 2000)).id]); commit(); }
      });
    }
  }

  const actions = () => [
    { label: 'Холст: новый блок', hint: hint('newBlock'), fn: A.newBlock }, { label: 'Холст: шаблон «человек»', fn: template },
    { label: 'Холст: вписать в экран', hint: hint('fit'), fn: fit }, { label: 'Холст: выделить всё', hint: hint('selectAll'), fn: A.selectAll },
    { label: 'Холст: отменить', hint: hint('undo'), fn: undo }, { label: 'Холст: повторить', hint: hint('redo'), fn: redo },
    { label: 'Холст: дублировать', hint: hint('duplicate'), fn: duplicate }, { label: 'Холст: удалить выбранное', hint: hint('delete'), fn: removeSel },
    ...ALIGN.map(([label, m]) => ({ label: 'Холст: выровнять ' + label.toLowerCase(), fn: () => align(m) })),
  ];

  window.Board = {
    mount, actions,
    addLead(c, l, uid) {
      const b = c.board = c.board || {};
      b.nodes = b.nodes || []; b.edges = b.edges || []; b.images = b.images || {}; b.view = b.view || { x: 40, y: 40, k: 1 };
      if (b.nodes.some(n => n.lead === l.id)) return;
      const i = b.nodes.length;
      b.nodes.push({ id: uid(), x: 40 + (i % 4) * 230, y: 40 + Math.floor(i / 4) * 90, text: (TL[l.type] || '') + ': ' + l.value, color: 1, lead: l.id });
    },
  };
})();
