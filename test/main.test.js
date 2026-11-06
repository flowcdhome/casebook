// Проверка main.js без Electron: подставляем заглушку модуля electron и вызываем обработчики IPC.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), Module = require('module');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-'));
process.env.XDG_CONFIG_HOME = tmp;
const handlers = {}, on = {}, sent = [];
const electron = {
  app: { setPath() {}, whenReady: () => new Promise(() => {}), on() {}, getVersion: () => '0.0.0-test', quit() {} },
  BrowserWindow: class {}, WebContentsView: class {}, shell: { openExternal() {} }, dialog: {},
  ipcMain: { handle: (c, f) => (handlers[c] = f), on: (c, f) => (on[c] = f) },
};
const load = Module._load;
Module._load = function (r, ...a) { return r === 'electron' ? electron : load.call(this, r, ...a); };
require('../main.js');
fs.unwatchFile(path.join(tmp, 'casebook', 'config.json'));
const ev = { sender: { isDestroyed: () => false, send: (c, d) => sent.push([c, d]) } };
let ok = 0; const t = async (n, f) => { await f(); ok++; console.log('ok  ', n); };
(async () => {
  await t('load создаёт config.json со всеми настройками', async () => { const d = await handlers.load(ev); assert.deepEqual(d.cases, []); assert.ok(d.conf.board.undo); assert.ok(fs.existsSync(d.confPath)); const saved = JSON.parse(fs.readFileSync(d.confPath, 'utf8')); assert.ok(saved.runners.sherlock && saved.services.length >= 2 && saved.board.selectAll); });
  await t('save пишет дела и делает резервную копию', async () => { await handlers.save(ev, [{ id: 1 }]); await handlers.save(ev, [{ id: 2 }]); const d = await handlers.load(ev); assert.equal(d.cases[0].id, 2); assert.ok(fs.existsSync(path.join(tmp, 'casebook', 'cases.json.bak'))); });
  await t('повреждённый cases.json восстанавливается из .bak', async () => { fs.writeFileSync(path.join(tmp, 'casebook', 'cases.json'), '{oops'); const d = await handlers.load(ev); assert.equal(d.cases[0].id, 1); assert.ok(d.error.includes('резервной')); });
  await t('conf:save отклоняет неверный JSON и принимает верный', async () => { assert.throws(() => handlers['conf:save'](ev, '{no'), SyntaxError); const c = await handlers['conf:save'](ev, JSON.stringify({ accent: '#123456', board: { newBlock: 'B' } })); assert.equal(c.accent, '#123456'); assert.equal(c.board.newBlock, 'B'); assert.ok(c.board.undo === 'Ctrl+Z'); });
  await t('своя программа из config.json запускается и отдаёт вывод', async () => { await handlers['conf:save'](ev, JSON.stringify({ runners: { echo: { cmd: 'echo', args: ['[+] Site:', 'https://x.example/{v}'], types: ['username'] } } })); const r = await handlers.run(ev, 'echo', 'neo'); assert.equal(r.code, 0); assert.ok(sent.some(([c, d]) => c === 'run:data' && d.chunk.includes('https://x.example/neo'))); });
  await t('значения с ведущим дефисом и неизвестные программы отклоняются', async () => { assert.ok((await handlers.run(ev, 'echo', '--help')).error); assert.ok((await handlers.run(ev, 'nope', 'a')).error); });
  await t('несуществующая команда даёт понятную ошибку', async () => { await handlers['conf:save'](ev, JSON.stringify({ runners: { ghost: { cmd: 'definitely-not-installed-xyz', args: ['{v}'], types: ['username'] } } })); const r = await handlers.run(ev, 'ghost', 'neo'); assert.ok(r.error.includes('не найден')); });
  console.log('\nпройдено:', ok); process.exit(0);
})().catch(e => { console.error('ПРОВАЛ:', e); process.exit(1); });
