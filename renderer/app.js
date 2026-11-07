(() => {
  const L = window.Lib, esc = L.esc, $ = s => document.querySelector(s), E = encodeURIComponent;
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  const TYPES = { username: 'ник', email: 'почта', phone: 'телефон', domain: 'домен', ip: 'ip', url: 'ссылка', name: 'имя', note: 'текст' };
  const S = { cases: [], cur: null, lead: null, tab: 'leads', view: 'case', conf: L.merge(L.DEFAULT_CONF, {}), confPath: '', error: '', log: {} };
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => api.save(S.cases), 300); };
  const cur = () => S.cases.find(c => c.id === S.cur);
  const curLead = () => (cur() ? cur().leads : []).find(l => l.id === S.lead);
  const findLead = id => { for (const c of S.cases) { const l = c.leads.find(x => x.id === id); if (l) return [c, l]; } return []; };
  const bind = n => L.specs(S.conf.binds[n])[0] || '';
  const ACC = ['#d9a441', '#5fa8d3', '#7bb274', '#c2706b', '#9a82b5', '#cfcfcf'];

  /* ---------- определение типа, ссылки и dork-шаблоны ---------- */
  function detect(v) {
    if (/^https?:\/\//i.test(v)) return 'url';
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'email';
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) return 'ip';
    if (/^\+?[\d\s().-]{7,}$/.test(v)) return 'phone';
    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(v)) return 'domain';
    return /\s/.test(v) ? 'name' : 'username';
  }
  const g = q => 'https://www.google.com/search?q=' + E(q);
  function pivots(t, v) {
    const q = '"' + v + '"', d = v.replace(/\D/g, ''), e = E(v);
    const web = [['Google', g(q)], ['Bing', 'https://www.bing.com/search?q=' + E(q)], ['DuckDuckGo', 'https://duckduckgo.com/?q=' + E(q)], ['Yandex', 'https://yandex.com/search/?text=' + E(q)]];
    const by = {
      username: [['GitHub', 'https://github.com/' + e], ['Reddit', 'https://www.reddit.com/user/' + e], ['Telegram', 'https://t.me/' + e], ['X', 'https://x.com/' + e], ['Instagram', 'https://www.instagram.com/' + e + '/'], ['TikTok', 'https://www.tiktok.com/@' + e], ['YouTube', 'https://www.youtube.com/@' + e], ['Twitch', 'https://www.twitch.tv/' + e], ['Steam', 'https://steamcommunity.com/id/' + e], ['VK', 'https://vk.com/' + e], ['Pinterest', 'https://www.pinterest.com/' + e + '/'], ['WhatsMyName', 'https://whatsmyname.app/?q=' + e]],
      email: [['Epieos', 'https://epieos.com/?q=' + e + '&t=email'], ['GitHub', 'https://github.com/search?type=users&q=' + e], ['HIBP', 'https://haveibeenpwned.com/account/' + e]],
      phone: [['Telegram', 'https://t.me/+' + d], ['WhatsApp', 'https://wa.me/' + d], ['Epieos', 'https://epieos.com/?q=' + E('+' + d) + '&t=phone']],
      domain: [['crt.sh', 'https://crt.sh/?q=' + e], ['Wayback', 'https://web.archive.org/web/*/' + v], ['urlscan', 'https://urlscan.io/search/#' + e], ['who.is', 'https://who.is/whois/' + e], ['Shodan', 'https://www.shodan.io/search?query=' + e], ['BuiltWith', 'https://builtwith.com/' + e]],
      ip: [['Shodan', 'https://www.shodan.io/host/' + e], ['ipinfo', 'https://ipinfo.io/' + e], ['AbuseIPDB', 'https://www.abuseipdb.com/check/' + e]],
      url: [['Wayback', 'https://web.archive.org/web/*/' + v], ['archive.today', 'https://archive.ph/' + e], ['Яндекс Картинки', 'https://yandex.com/images/search?rpt=imageview&url=' + e], ['Google Lens', 'https://lens.google.com/uploadbyurl?url=' + e], ['TinEye', 'https://tineye.com/search?url=' + e]],
      name: [['LinkedIn', g('site:linkedin.com/in ' + q)], ['VK', 'https://vk.com/search?c%5Bsection%5D=people&c%5Bq%5D=' + e], ['Facebook', 'https://www.facebook.com/search/people/?q=' + e]],
    };
    return [...(by[t] || []), ...(t === 'note' ? [] : web)];
  }
  function dorks(t, v) {
    const q = '"' + v + '"';
    const by = {
      username: [q, 'inurl:' + v, 'site:github.com ' + q, 'site:pastebin.com ' + q, 'site:t.me ' + q],
      email: [q, q + ' filetype:pdf', 'site:pastebin.com ' + q, '"' + v.split('@')[0] + '" "' + v.split('@')[1] + '"'],
      phone: [q, '"' + v.replace(/\D/g, '') + '"', 'site:t.me ' + q],
      domain: ['site:' + v, 'site:' + v + ' filetype:pdf', '"@' + v + '"', 'inurl:' + v + ' -site:' + v],
      ip: [q, '"' + v + '" site:pastebin.com'],
      name: [q, q + ' site:linkedin.com/in', q + ' filetype:pdf', q + ' (резюме OR cv)'],
      url: [q, 'link:' + v],
    };
    return by[t] || [q];
  }

  /* ---------- дела и зацепки ---------- */
  function newCase() {
    const n = { id: uid(), title: 'Дело ' + (S.cases.length + 1), notes: '', leads: [] };
    S.cases.unshift(n); S.cur = n.id; S.lead = null; S.view = 'case'; S.tab = 'leads'; save(); render();
    const t = $('#title'); if (t) t.select();
  }
  const mkLead = (value, type, from) => ({ id: uid(), type: type || detect(value), value, note: '', found: [], from: from || '' });
  function add(value, type, from) {
    const c = cur(); value = String(value).trim();
    if (!c || !value) return;
    const l = mkLead(value, type, from);
    c.leads.unshift(l); S.lead = l.id; save(); render();
  }
  function makeLead(text) {   // зацепка, созданная с холста: без смены вкладки
    const c = cur(); if (!c || !text.trim()) return;
    c.leads.unshift(mkLead(text.trim().slice(0, 300))); save();
  }
  function toMd() {
    const c = cur(), nm = id => (c.board && c.board.nodes.find(n => n.id === id) || {}).text || '?';
    const out = ['# ' + c.title, '', c.notes || ''];
    c.leads.forEach(l => { out.push('', `## [${TYPES[l.type]}] ${l.value}`, l.note || '', ...l.found.map(f => `- ${f.site}${f.url ? ': ' + f.url : ''}${f.text ? ' — ' + f.text.replace(/\n/g, ' ') : ''}`)); });
    if (c.board && c.board.nodes.length) {
      out.push('', '## Холст', ...c.board.nodes.map(n => `- ${(n.text || '(картинка)').replace(/\n/g, ' ')}`));
      if (c.board.edges.length) out.push('', '### Связи', ...c.board.edges.map(e => `- ${nm(e.from).replace(/\n/g, ' ')} → ${nm(e.to).replace(/\n/g, ' ')}${e.label ? ' (' + e.label + ')' : ''}`));
    }
    return out.join('\n');
  }
  const exportMd = () => { const c = cur(); if (c) api.exportMd(c.title.replace(/[\\/:*?"<>|]/g, '_'), toMd()); };

  /* ---------- отрисовка ---------- */
  const ctx = { save, uid, toast: L.toast, conf: () => S.conf, binds: () => S.conf.board, makeLead, open: u => api.open(u) };
  function renderSide() {
    $('#side').innerHTML = `<div class="logo">Casebook</div><button class="pri" data-a="newCase">Новое дело</button>` +
      S.cases.map(c => `<button class="case ${c.id === S.cur && S.view === 'case' ? 'on' : ''}" data-a="selCase" data-id="${c.id}">${esc(c.title)}</button>`).join('') +
      `<div class="sp"></div><button data-a="palette" title="${esc(bind('palette'))}">Команды</button><button data-a="settings">Настройки</button><button data-a="help">Обучение</button>`;
  }
  function render() {
    renderSide();
    if (S.view === 'settings') return renderSettings();
    const c = cur(), m = $('#main'), banner = S.error ? `<div class="banner">${esc(S.error)}</div>` : '';
    if (!c) { m.innerHTML = banner + `<div class="empty"><h2>Дел пока нет</h2><p class="dim">Дело хранит зацепки, найденное, холст и заметки. Всё сохраняется само.</p><button class="pri" data-a="newCase">Создать первое дело</button></div>`; return; }
    const l = curLead(), tb = (id, t) => `<button class="tab ${S.tab === id ? 'on' : ''}" data-a="tab" data-id="${id}">${t}</button>`;
    m.innerHTML = banner + `<div class="bar"><input class="title" id="title" value="${esc(c.title)}"><button data-a="export">Экспорт .md</button><button data-a="delCase">Удалить дело</button></div>
      <div class="tabs">${tb('leads', `Зацепки (${c.leads.length})`)}${tb('board', 'Холст')}${tb('notes', 'Заметки')}</div>` +
      (S.tab === 'notes' ? `<textarea id="notes" style="min-height:50vh" placeholder="Свободные заметки по делу">${esc(c.notes)}</textarea>` : S.tab === 'board' ? '' :
        `<div class="cols"><div><form class="add" id="addf"><select id="atype"><option value="">авто</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><input id="aval" placeholder="ник, почта, телефон, домен…" autocomplete="off"></form>` +
        (c.leads.map(x => `<button class="lead ${x.id === S.lead ? 'on' : ''}" data-a="selLead" data-id="${x.id}"><span class="tag">${TYPES[x.type]}</span><span class="val">${esc(x.value)}</span></button>`).join('') || `<p class="dim">Добавьте первую зацепку: то, от чего можно оттолкнуться.</p>`) +
        `</div><div>${l ? leadView(l) : '<p class="dim">Выберите зацепку слева.</p>'}</div></div>`);
    if (S.tab === 'board') window.Board.mount(m, c, ctx);
  }
  const logHtml = l => { const x = S.log[l.id]; return x ? `<pre>${esc(x.text.slice(-1800))}</pre>` + (x.running ? `<button data-a="stop" data-id="${esc(x.running)}">Остановить</button>` : '') : ''; };
  const foundHtml = l => l.found.map(f => `<div class="row"><span class="val">${esc(f.site)} ${f.text ? esc(f.text) + ' ' : ''}<span class="dim">${esc(f.url || '')}</span></span>${f.url ? `<button data-a="open" data-u="${esc(f.url)}">открыть</button>` : ''}<button data-a="promote" data-id="${f.id}">в зацепки</button><button data-a="delFound" data-id="${f.id}">×</button></div>`).join('') || '<p class="dim">Пока пусто.</p>';
  function leadView(l) {
    const rs = Object.keys(S.conf.runners).filter(n => (S.conf.runners[n].types || []).includes(l.type));
    const sv = (S.conf.services || []).filter(s => !s.types || s.types.includes(l.type));
    return `<div class="bar"><span class="tag">${TYPES[l.type]}</span><span class="val" style="flex:1;font-size:16px">${esc(l.value)}</span><button data-a="toBoard">На холст</button><button data-a="delLead">Удалить</button></div>
    ${rs.length ? `<h3>Проверить здесь</h3><div class="chips">${rs.map(n => `<button class="pri" data-a="run" data-id="${esc(n)}">${esc(n)}</button>`).join('')}</div><div id="log">${logHtml(l)}</div>` : ''}
    ${sv.length ? `<h3>Сервисы (отдельное окно, вход сохраняется)</h3><div class="chips">${sv.map(s => `<button data-a="svc" data-id="${esc(s.name)}">${esc(s.name)}</button>`).join('')}</div>` : ''}
    <h3>Найденное (<span id="fcount">${l.found.length}</span>)</h3><div class="chips" style="margin-bottom:6px"><button data-a="pasteFound">Вставить найденное из буфера</button></div><div id="found">${foundHtml(l)}</div>
    <h3>Быстрые ссылки (откроются в браузере)</h3><div class="chips">${pivots(l.type, l.value).map(([n, u]) => `<button data-a="open" data-u="${esc(u)}">${esc(n)}</button>`).join('')}</div>
    <h3>Google dorks</h3>${dorks(l.type, l.value).map(d => `<div class="row"><span class="val">${esc(d)}</span><button data-a="open" data-u="${esc(g(d))}">искать</button><button data-a="copy" data-u="${esc(d)}">копировать</button></div>`).join('')}
    <h3>Заметка</h3><textarea id="lnote" placeholder="Откуда зацепка, что подтверждено, что нет">${esc(l.note)}</textarea>`;
  }
  const updLog = l => { if (S.lead === l.id && $('#log')) $('#log').innerHTML = logHtml(l); };
  const updFound = l => { if (S.lead === l.id && $('#found')) { $('#found').innerHTML = foundHtml(l); $('#fcount').textContent = l.found.length; } };
  function addFound(l, site, url, text) {
    if (l.found.some(f => f.site === site && f.url === (url || '') && f.text === text)) return false;
    l.found.push({ id: uid(), site, url: url || '', ...(text ? { text } : {}) }); return true;
  }

  /* ---------- настройки ---------- */
  const GL = { newCase: 'Новое дело', addLead: 'Новая зацепка (фокус на поле)', export: 'Экспорт .md', help: 'Обучение', palette: 'Палитра команд', settings: 'Настройки', tabLeads: 'Вкладка «Зацепки»', tabBoard: 'Вкладка «Холст»', tabNotes: 'Вкладка «Заметки»' };
  const BL = { newBlock: 'Новый блок', child: 'Дочерний блок со стрелкой', edit: 'Править текст блока', delete: 'Удалить', selectAll: 'Выделить всё', deselect: 'Снять выделение / отмена', duplicate: 'Дублировать', copy: 'Копировать', cut: 'Вырезать', undo: 'Отменить', redo: 'Повторить',
    moveLeft: 'Сдвиг блоков влево', moveRight: 'Сдвиг блоков вправо', moveUp: 'Сдвиг блоков вверх', moveDown: 'Сдвиг блоков вниз', moveBigLeft: 'Крупный сдвиг влево', moveBigRight: 'Крупный сдвиг вправо', moveBigUp: 'Крупный сдвиг вверх', moveBigDown: 'Крупный сдвиг вниз',
    navLeft: 'Перейти к блоку слева', navRight: 'Перейти к блоку справа', navUp: 'Перейти к блоку выше', navDown: 'Перейти к блоку ниже', panLeft: 'Сдвиг холста влево', panRight: 'Сдвиг холста вправо', panUp: 'Сдвиг холста вверх', panDown: 'Сдвиг холста вниз',
    link: 'Соединить стрелкой', color: 'Сменить цвет', toLead: 'Сделать зацепкой', fit: 'Вписать в экран', zoomIn: 'Приблизить', zoomOut: 'Отдалить', menu: 'Меню с клавиатуры' };
  const writeConf = () => api.confSave(JSON.stringify(S.conf, null, 2)).then(c => { S.conf = c; applyConf(); if (S.view === 'settings') renderSettings(); }).catch(() => L.toast('Не удалось сохранить настройки'));
  function renderSettings() {
    const rows = (grp, lab) => Object.keys(lab).map(n => `<tr><td>${lab[n]}</td><td><button class="bk" data-a="cap" data-g="${grp}" data-n="${n}">${esc(L.specs(S.conf[grp][n]).join(' / ') || '—')}</button> <button data-a="resetBind" data-g="${grp}" data-n="${n}" title="По умолчанию">↺</button></td></tr>`).join('');
    $('#main').innerHTML = `<div class="bar"><h2 style="flex:1">Настройки</h2></div>${S.error ? `<div class="banner">${esc(S.error)}</div>` : ''}
    <p class="dim">Файл настроек: <span class="val">${esc(S.confPath)}</span>. Меняйте здесь или прямо в файле: оба способа работают с одним файлом, изменения подхватываются сами.</p>
    <h3>Цвет акцента</h3><div class="sw">${ACC.map(c => `<button data-a="accent" data-id="${c}" class="${c === S.conf.accent ? 'on' : ''}" style="background:${c}"></button>`).join('')}<input id="hex" value="${esc(S.conf.accent)}" style="width:96px"></div>
    <h3>Горячие клавиши: общие</h3><table>${rows('binds', GL)}</table>
    <h3>Горячие клавиши: холст</h3><p class="dim" style="margin-bottom:6px">Клавиши привязаны к физическим кнопкам и работают в любой раскладке. Нажмите на поле и затем нужное сочетание. Esc: отмена.</p><table>${rows('board', BL)}</table>
    <h3>Шаг сдвига блоков (пиксели)</h3><div class="sw"><input id="st1" type="number" value="${S.conf.boardStep}" style="width:80px"><input id="st2" type="number" value="${S.conf.boardBigStep}" style="width:80px"><span class="dim">обычный и крупный (с Shift)</span></div>
    <h3>Файл настроек целиком</h3><p class="dim" style="margin-bottom:6px">Здесь же программы запуска (runners) и сайты-сервисы (services). Добавьте свою программу или сайт по образцу.</p>
    <textarea id="conf" style="min-height:280px">${esc(JSON.stringify(S.conf, null, 2))}</textarea>
    <div class="bar" style="margin-top:10px"><button class="pri" data-a="saveConf">Сохранить</button><button data-a="resetConf">Сбросить всё</button><span id="cmsg" class="dim"></span></div>`;
  }
  function applyConf() { document.documentElement.style.setProperty('--ac', S.conf.accent || '#d9a441'); }

  /* ---------- обучение ---------- */
  const STEPS = [
    ['Дело', 'Дело это папка расследования. Создайте его слева. Закрыли программу, выключили ПК, завтра открыли, и всё на месте.'],
    ['Зацепка', 'Зацепка это то, от чего вы отталкиваетесь: ник, почта, телефон, домен, ip, ссылка, имя. Тип определяется сам.'],
    ['Проверка внутри', 'Для ника доступны Sherlock и Maigret, для почты holehe, для домена whois, если они установлены. Результат появится под зацепкой. Лишнее удаляйте, нужное отправляйте в зацепки.'],
    ['Сервисы', 'Сайты вроде osintsearch открываются в отдельном окне, вход там сохраняется. Нашли результат, нажмите «Забрать ссылки» или выделите текст и «Забрать выделенное»: всё попадёт под зацепку.'],
    ['Холст', 'Вкладка «Холст» это доска для связей. ПКМ открывает меню, тяните по пустому месту для выделения, точка ● у блока тянет стрелку. Ctrl+Z отменяет, Ctrl+V вставляет картинку.'],
    ['Клавиатура', 'Всё доступно без мыши: Ctrl+K открывает все команды, N новый блок, Tab дочерний блок, стрелки двигают, Alt+стрелки переходят между блоками, L соединяет. Клавиши меняются в Настройках или в config.json.'],
  ];
  function tour(i) {
    const o = $('#ov'); o.hidden = false;
    o.innerHTML = `<div class="card"><span class="dim">${i + 1} из ${STEPS.length}</span><h2>${STEPS[i][0]}</h2><p>${STEPS[i][1]}</p><div class="nav"><button data-a="tourEnd">Пропустить</button><button class="pri" data-a="tourNext" data-id="${i + 1}">${i + 1 < STEPS.length ? 'Дальше' : 'Начать'}</button></div></div>`;
  }

  /* ---------- команды ---------- */
  function setTab(t) { if (!cur()) return; S.view = 'case'; S.tab = t; render(); }
  function focusAdd() { if (!cur()) return newCase(); if (S.tab !== 'leads' || S.view !== 'case') setTab('leads'); const i = $('#aval'); if (i) i.focus(); }
  function runTool(name) {
    const l = curLead(); if (!l) return;
    S.log[l.id] = { text: 'запуск ' + name + '…\n', running: name }; updLog(l);
    api.run(name, l.value).then(r => { const x = S.log[l.id]; x.running = null; x.text += r.error ? 'Ошибка: ' + r.error + '\n' : `готово (код ${r.code})\n`; updLog(l); });
  }
  function openService(name) {
    const l = curLead(), s = (S.conf.services || []).find(x => x.name === name);
    if (l && s) api.svcOpen(String(s.url).split('{v}').join(E(l.value)), l.id);
  }
  function paletteItems() {
    const it = [], c = cur(), l = curLead(), b = n => bind(n);
    it.push({ label: 'Новое дело', hint: b('newCase'), fn: newCase }, { label: 'Новая зацепка', hint: b('addLead'), fn: focusAdd }, { label: 'Настройки', hint: b('settings'), fn: () => { S.view = 'settings'; render(); } }, { label: 'Обучение', hint: b('help'), fn: () => tour(0) });
    if (c) it.push({ label: 'Вкладка: зацепки', hint: b('tabLeads'), fn: () => setTab('leads') }, { label: 'Вкладка: холст', hint: b('tabBoard'), fn: () => setTab('board') }, { label: 'Вкладка: заметки', hint: b('tabNotes'), fn: () => setTab('notes') }, { label: 'Экспорт дела в .md', hint: b('export'), fn: exportMd });
    S.cases.forEach(cs => it.push({ label: 'Дело: ' + cs.title, fn: () => { S.cur = cs.id; S.lead = null; S.view = 'case'; render(); } }));
    if (c) c.leads.forEach(x => it.push({ label: 'Зацепка: ' + x.value, hint: TYPES[x.type], fn: () => { S.lead = x.id; setTab('leads'); } }));
    if (l) {
      Object.keys(S.conf.runners).filter(n => (S.conf.runners[n].types || []).includes(l.type)).forEach(n => it.push({ label: 'Проверить: ' + n, fn: () => { setTab('leads'); runTool(n); } }));
      (S.conf.services || []).filter(s => !s.types || s.types.includes(l.type)).forEach(s => it.push({ label: 'Сервис: ' + s.name, fn: () => openService(s.name) }));
      pivots(l.type, l.value).forEach(([n, u]) => it.push({ label: 'Открыть: ' + n, fn: () => api.open(u) }));
    }
    if (c && S.tab === 'board' && S.view === 'case') it.push(...window.Board.actions());
    return it;
  }

  /* ---------- события ---------- */
  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-a]'); if (!b) return;
    const a = b.dataset.a, id = b.dataset.id, c = cur(), l = curLead();
    switch (a) {
      case 'newCase': newCase(); break;
      case 'selCase': S.cur = id; S.lead = null; S.view = 'case'; render(); break;
      case 'delCase': if (confirm('Удалить дело «' + c.title + '» целиком?')) { S.cases = S.cases.filter(x => x !== c); S.cur = S.cases[0] ? S.cases[0].id : null; save(); render(); } break;
      case 'tab': setTab(id); break;
      case 'selLead': S.lead = id; render(); break;
      case 'delLead': if (confirm('Удалить зацепку?')) { c.leads = c.leads.filter(x => x !== l); S.lead = null; save(); render(); } break;
      case 'delFound': l.found = l.found.filter(f => f.id !== id); save(); updFound(l); break;
      case 'promote': { const f = l.found.find(x => x.id === id); add(f.text || f.url, null, l.value); break; }
      case 'open': api.open(b.dataset.u); break;
      case 'copy': navigator.clipboard.writeText(b.dataset.u); L.toast('Скопировано'); break;
      case 'export': exportMd(); break;
      case 'toBoard': window.Board.addLead(c, l, uid); save(); setTab('board'); break;
      case 'pasteFound': navigator.clipboard.readText().then(t => { t = (t || '').trim(); if (!t) return L.toast('Буфер обмена пуст'); addFound(l, 'из буфера', '', t.slice(0, 2000)); save(); updFound(l); L.toast('Добавлено под зацепку'); }).catch(() => L.toast('Нет доступа к буферу обмена')); break;
      case 'run': runTool(id); break;
      case 'stop': api.runStop(id, l.value); break;
      case 'svc': openService(id); break;
      case 'palette': L.palette(paletteItems()); break;
      case 'settings': S.view = 'settings'; render(); break;
      case 'help': tour(0); break;
      case 'tourNext': if (+id < STEPS.length) tour(+id); else { localStorage.seen = 1; $('#ov').hidden = true; } break;
      case 'tourEnd': localStorage.seen = 1; $('#ov').hidden = true; break;
      case 'accent': S.conf.accent = id; writeConf(); break;
      case 'resetBind': S.conf[b.dataset.g][b.dataset.n] = L.DEFAULT_CONF[b.dataset.g][b.dataset.n]; writeConf(); break;
      case 'cap': {
        const grp = b.dataset.g, n = b.dataset.n; b.textContent = 'Нажмите клавишу…';
        L.capture(k => {
          if (k) {
            const dup = Object.keys(S.conf[grp]).find(o => o !== n && L.specs(S.conf[grp][o]).some(s => L.norm(s) === L.norm(k)));
            if (dup) L.toast('Это сочетание уже занято: ' + (GL[dup] || BL[dup]));
            S.conf[grp][n] = k; writeConf();
          } else renderSettings();
        });
        break;
      }
      case 'saveConf': api.confSave($('#conf').value).then(cf => { S.conf = cf; applyConf(); renderSettings(); L.toast('Сохранено'); }).catch(() => { $('#cmsg').textContent = 'Ошибка: это не корректный JSON'; }); break;
      case 'resetConf': if (confirm('Вернуть все настройки по умолчанию?')) { S.conf = JSON.parse(JSON.stringify(L.DEFAULT_CONF)); writeConf(); } break;
    }
  });
  document.addEventListener('submit', ev => { ev.preventDefault(); const i = $('#aval'); if (i) add(i.value, $('#atype').value); });
  document.addEventListener('input', ev => {
    const c = cur(), l = curLead(), t = ev.target.id;
    if (t === 'title') { c.title = ev.target.value; renderSide(); } else if (t === 'notes') c.notes = ev.target.value; else if (t === 'lnote') l.note = ev.target.value; else return;
    save();
  });
  document.addEventListener('change', ev => {
    const t = ev.target.id;
    if (t === 'hex' && /^#[0-9a-f]{6}$/i.test(ev.target.value)) { S.conf.accent = ev.target.value; writeConf(); }
    else if (t === 'st1' || t === 'st2') { S.conf[t === 'st1' ? 'boardStep' : 'boardBigStep'] = Math.max(1, +ev.target.value || 10); writeConf(); }
  });
  addEventListener('keydown', e => {
    if (document.querySelector('.pal, .cmenu')) return;
    const t = e.target, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
    if (typing && !(e.ctrlKey || e.altKey || /^F\d+$/.test(e.key))) return;
    const b = S.conf.binds, acts = { palette: () => L.palette(paletteItems()), newCase, addLead: focusAdd, export: exportMd, help: () => tour(0), settings: () => { S.view = 'settings'; render(); }, tabLeads: () => setTab('leads'), tabBoard: () => setTab('board'), tabNotes: () => setTab('notes') };
    for (const k in acts) if (L.match(e, b[k])) { e.preventDefault(); acts[k](); return; }
  });

  api.onRun(({ tool, value, chunk }) => {
    const ok = x => x.value === value && ((S.conf.runners[tool] || {}).types || []).includes(x.type);
    const l = (cur() ? cur().leads : []).find(ok) || S.cases.flatMap(c => c.leads).find(ok);
    if (!l) return;
    const text = chunk.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    (S.log[l.id] = S.log[l.id] || { text: '' }).text += text;
    for (const line of text.split('\n')) {
      const m = line.match(/\[\+\]\s+(.+?):\s+(https?:\/\/\S+)/) || (tool === 'holehe' && line.match(/\[\+\]\s+(\S+)/));
      if (m) addFound(l, m[1], m[2] || '');
    }
    save(); updLog(l); updFound(l);
  });
  api.onConf(d => { S.conf = d.conf; S.error = d.error || ''; applyConf(); if (S.view === 'settings' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) renderSettings(); });
  api.onSvc(({ leadId, what, data, from }) => {
    const [, l] = findLead(leadId); if (!l) return L.toast('Зацепка не найдена');
    let n = 0;
    if (what === 'sel') { if (data && addFound(l, 'выделено на странице', from, data.trim().slice(0, 500))) n = 1; }
    else (data || []).forEach(([href, text]) => { if (addFound(l, text || href, href)) n++; });
    save(); updFound(l); L.toast('Добавлено под зацепку: ' + n);
  });

  (async () => {
    const d = await api.load();
    S.cases = (d.cases || []).map(c => ({ notes: '', leads: [], ...c, leads: (c.leads || []).map(l => ({ note: '', found: [], ...l })) }));
    S.conf = d.conf; S.confPath = d.confPath; S.error = d.error || ''; S.cur = S.cases[0] ? S.cases[0].id : null;
    applyConf(); render();
    if (!localStorage.seen) tour(0);
  })();
})();
