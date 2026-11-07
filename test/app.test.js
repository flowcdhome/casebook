const assert = require('assert');
const { install, ev, El } = require('./fakedom.js');
const env = install();
window.Lib = require('../renderer/lib.js');
const Lib = window.Lib;
for (const id of ['side', 'main', 'ov']) { const e = new El('div'); e.attrs.id = id; env.body.appendChild(e); }
const q = id => env.body.querySelector('#' + id);
globalThis.localStorage = { seen: 1 };
let saved = null, confSaved = null, runs = [], opened = [];
const conf0 = JSON.parse(JSON.stringify(Lib.DEFAULT_CONF));
const cbs = {};
globalThis.api = {
  load: async () => ({ cases: [{ id: 'c1', title: 'Дело A', leads: [{ id: 'l1', type: 'username', value: 'neo' }] }], conf: conf0, confPath: '/x/config.json', error: '' }),
  save: c => { saved = c; return Promise.resolve(true); }, confSave: t => { confSaved = JSON.parse(t); return Promise.resolve(Lib.merge(Lib.DEFAULT_CONF, confSaved)); },
  open: u => opened.push(u), exportMd: (n, t) => { globalThis.exported = [n, t]; return Promise.resolve(true); },
  run: (t, v) => { runs.push([t, v]); return Promise.resolve({ code: 0 }); }, runStop: () => Promise.resolve(true), svcOpen: (u, id) => { globalThis.svc = [u, id]; return Promise.resolve(); },
  onRun: cb => (cbs.run = cb), onConf: cb => (cbs.conf = cb), onSvc: cb => (cbs.svc = cb),
};
globalThis.Board = window.Board = { mount() {}, actions: () => [{ label: 'Холст: тест', fn() {} }], addLead(c, l) { c.board = { nodes: [{ id: 'n1', text: l.value }], edges: [] }; } };
require('../renderer/app.js');
const click = (a, extra = {}) => { const btn = { dataset: { a, ...extra }, closest: () => btn }; for (const f of (env.listeners.click || [])) f({ target: { closest: () => btn }, preventDefault() {} }); };
let ok = 0; const t = async (name, fn) => { await fn(); ok++; console.log('ok  ', name); };
const tick = () => new Promise(r => setTimeout(r, 10));

(async () => {
  await tick();
  await t('старт: дело и зацепка отрисованы', () => { assert.ok(q('side').innerHTML.includes('Дело A')); assert.ok(q('main').innerHTML.includes('neo')); });
  await t('панель зацепки: проверки, сервисы, ссылки, dork', () => { click('selLead', { id: 'l1' }); const h = q('main').innerHTML; ['sherlock', 'maigret', 'OSINTSearch', 'github.com/neo', 'inurl:neo', 'На холст'].forEach(s => assert.ok(h.includes(s), s)); assert.ok(!h.includes('holehe')); });
  await t('новое дело создаётся и сохраняется', async () => { click('newCase'); await tick(); assert.ok(q('side').innerHTML.includes('Дело 2')); });
  await t('запуск sherlock вызывает api.run', async () => { click('selCase', { id: 'c1' }); click('selLead', { id: 'l1' }); click('run', { id: 'sherlock' }); await tick(); assert.deepEqual(runs[0], ['sherlock', 'neo']); });
  await t('вывод Sherlock превращается в найденное', () => { cbs.run({ tool: 'sherlock', value: 'neo', chunk: '[+] GitHub: https://github.com/neo\n[+] Reddit: https://reddit.com/u/neo\n' }); });
  await t('вкладка заметок и экспорт .md', () => { click('tab', { id: 'notes' }); assert.ok(q('main').innerHTML.includes('textarea')); click('export'); assert.ok(exported[1].includes('GitHub: https://github.com/neo')); assert.ok(exported[1].includes('## [ник] neo')); });
  await t('«На холст» добавляет блок и переключает вкладку', () => { click('selLead', { id: 'l1' }); click('tab', { id: 'leads' }); click('selLead', { id: 'l1' }); click('toBoard'); click('export'); assert.ok(exported[1].includes('## Холст')); });
  await t('настройки: все привязки видны', () => { click('settings'); const h = q('main').innerHTML; assert.ok(h.includes('Выделить всё')); assert.ok(h.includes('Ctrl+K')); assert.ok(h.includes('Alt+Left')); });
  await t('смена клавиши через захват пишет файл настроек', () => { click('cap', { g: 'board', n: 'newBlock' }); const e = { type: 'keydown', key: 'b', code: 'KeyB', ctrlKey: false, altKey: false, shiftKey: false, preventDefault() {}, stopPropagation() {}, target: env.body }; for (const f of (env.listeners.keydown || []).slice()) f(e); assert.equal(confSaved.board.newBlock, 'B'); });
  await t('сброс клавиши к значению по умолчанию', () => { click('resetBind', { g: 'board', n: 'newBlock' }); assert.equal(confSaved.board.newBlock, 'N'); });
  await t('изменение настроек в файле подхватывается', () => { cbs.conf({ conf: Lib.merge(Lib.DEFAULT_CONF, { accent: '#112233' }), error: '' }); });
  await t('сервис: открывает окно с адресом и id зацепки', () => { click('settings'); click('selCase', { id: 'c1' }); click('selLead', { id: 'l1' }); click('svc', { id: 'OSINTSearch' }); assert.ok(svc[0].startsWith('https://osintsearch.org/?q=neo')); assert.equal(svc[1], 'l1'); });
  await t('данные сервиса: ссылки и выделение попадают под зацепку', () => { cbs.svc({ leadId: 'l1', what: 'links', data: [['https://a.example/x', 'Профиль'], ['https://b.example', '']], from: 'https://osintsearch.org/' }); cbs.svc({ leadId: 'l1', what: 'sel', data: 'Иван Петров', from: 'https://osintsearch.org/' }); click('export'); assert.ok(exported[1].includes('Профиль: https://a.example/x')); assert.ok(exported[1].includes('Иван Петров')); });
  await t('вставка найденного из буфера', async () => { navigator.clipboard.readText = async () => 'найдено вручную: профиль neo'; click('settings'); click('selCase', { id: 'c1' }); click('selLead', { id: 'l1' }); click('pasteFound'); await tick(); click('export'); assert.ok(exported[1].includes('найдено вручную: профиль neo')); });
  console.log('\nпройдено:', ok);
})().catch(e => { console.error('ПРОВАЛ:', e); process.exit(1); });
