const { app, BrowserWindow, WebContentsView, ipcMain, shell, dialog } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
const Lib = require('./renderer/lib.js');

const BASE = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'casebook');
const CASES = path.join(BASE, 'cases.json'), CONF = path.join(BASE, 'config.json');
app.setPath('userData', BASE);
// Cloudflare и подобные проверки смотрят на согласованность User-Agent и client hints: убираем только метки «Electron» и имя приложения
if (app.userAgentFallback) app.userAgentFallback = app.userAgentFallback.replace(/\sElectron\/\S+/, '').replace(/\scasebook\/\S+/, '');

let win = null, lastBackup = 0;
const procs = new Map(), svcs = new Map();

function readConf() {
  let user = {}, error = '';
  try { user = JSON.parse(fs.readFileSync(CONF, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') error = 'config.json: ' + e.message; }
  return { conf: Lib.merge(Lib.DEFAULT_CONF, user), error };
}
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', text);
  fs.renameSync(file + '.tmp', file);
}

ipcMain.handle('load', () => {
  if (!fs.existsSync(CONF)) writeAtomic(CONF, JSON.stringify(Lib.DEFAULT_CONF, null, 2));
  let cases = [], error = '';
  for (const f of [CASES, CASES + '.bak']) {
    try { cases = JSON.parse(fs.readFileSync(f, 'utf8')); if (f !== CASES) error = 'Основной файл дел повреждён, восстановлено из резервной копии.'; break; }
    catch (e) { if (e.code === 'ENOENT') break; error = 'Не удалось прочитать ' + f + ': ' + e.message; }
  }
  const c = readConf();
  return { cases, conf: c.conf, confPath: CONF, casesPath: CASES, error: error || c.error, version: app.getVersion() };
});
ipcMain.handle('save', (e, cases) => {
  if (fs.existsSync(CASES) && Date.now() - lastBackup > 60000) { try { fs.copyFileSync(CASES, CASES + '.bak'); lastBackup = Date.now(); } catch {} }
  writeAtomic(CASES, JSON.stringify(cases));
  return true;
});
ipcMain.handle('conf:save', (e, text) => { JSON.parse(text); writeAtomic(CONF, text); return readConf().conf; });
fs.mkdirSync(BASE, { recursive: true });
fs.watchFile(CONF, { interval: 1000 }, () => { if (win && !win.isDestroyed()) win.webContents.send('conf:changed', readConf()); });

ipcMain.handle('open', (e, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); });
ipcMain.handle('export', async (e, name, text) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(os.homedir(), name + '.md') });
  if (r.canceled) return false;
  fs.writeFileSync(r.filePath, text);
  return true;
});

/* ---------- запуск внешних программ (Sherlock, Maigret, holehe, whois и любые свои из config.json) ---------- */
ipcMain.handle('run', (e, name, value) => new Promise(resolve => {
  const r = readConf().conf.runners[name];
  if (!r || !r.cmd) return resolve({ error: 'неизвестный инструмент: ' + name });
  if (typeof value !== 'string' || /^-|[\r\n\0]/.test(value)) return resolve({ error: 'недопустимое значение' });
  const args = (r.args || ['{v}']).map(a => String(a).split('{v}').join(value));
  const env = { ...process.env, PATH: process.env.PATH + ':' + path.join(os.homedir(), '.local', 'bin') };
  const key = name + ':' + value;
  const p = spawn(r.cmd, args, { cwd: os.tmpdir(), env });
  procs.set(key, p);
  const timer = setTimeout(() => p.kill(), (r.timeout || 300) * 1000);
  const send = chunk => { if (!e.sender.isDestroyed()) e.sender.send('run:data', { tool: name, value, chunk: chunk.toString() }); };
  p.stdout.on('data', send); p.stderr.on('data', send);
  p.on('error', err => { clearTimeout(timer); procs.delete(key); resolve({ error: err.code === 'ENOENT' ? `${r.cmd}: не найден (установите или укажите путь в config.json)` : err.message }); });
  p.on('close', code => { clearTimeout(timer); procs.delete(key); resolve({ code }); });
}));
ipcMain.handle('run:stop', (e, name, value) => { const p = procs.get(name + ':' + value); if (p) p.kill(); return !!p; });

/* ---------- окно сервиса: сайт с входом (сессия сохраняется) и забор ссылок со страницы ---------- */
function grabLinks() {
  const out = new Map(), host = location.hostname;
  document.querySelectorAll('a[href]').forEach(a => {
    try {
      const u = new URL(a.href, location.href);
      if (!/^https?:$/.test(u.protocol) || u.hostname === host) return;
      const t = (a.innerText || a.title || u.hostname).trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!out.has(u.href)) out.set(u.href, t);
    } catch {}
  });
  return [...out].slice(0, 300);
}
function openService(url, leadId) {
  const w = new BrowserWindow({ width: 1100, height: 800, title: 'Casebook: сервис', backgroundColor: '#121212', webPreferences: { preload: path.join(__dirname, 'renderer', 'svc-preload.js'), contextIsolation: true, sandbox: true } });
  const id = w.webContents.id;
  w.removeMenu();
  w.loadFile(path.join(__dirname, 'renderer', 'svc.html'));
  const v = new WebContentsView({ webPreferences: { partition: 'persist:svc', sandbox: true, contextIsolation: true } });
  w.contentView.addChildView(v);
  const fit = () => { const [cw, ch] = w.getContentSize(); v.setBounds({ x: 0, y: 48, width: cw, height: Math.max(0, ch - 48) }); };
  fit(); w.on('resize', fit);
  const tell = (e, u) => { if (!w.isDestroyed()) w.webContents.send('svc:url', u); };
  v.webContents.on('did-navigate', tell); v.webContents.on('did-navigate-in-page', tell);
  v.webContents.setWindowOpenHandler(({ url: u }) => { v.webContents.loadURL(u); return { action: 'deny' }; });
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  v.webContents.on('did-fail-load', (e, code, desc, u, isMain) => {
    if (!isMain || code === -3 || u.startsWith('data:')) return;
    v.webContents.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="background:#121212;color:#e8e4dc;font:16px system-ui,sans-serif;padding:40px;line-height:1.6"><h2>Страница не открылась</h2><p>${esc(desc)} (код ${code})</p><p>Адрес: <b>${esc(u)}</b></p><p>Проверьте адрес. Введите правильный в поле сверху и нажмите Enter, а потом поправьте его в config.json (раздел services).</p>`));
  });
  v.webContents.on('page-title-updated', (e, t) => { if (!w.isDestroyed()) w.setTitle('Casebook: ' + t); });
  v.webContents.session.webRequest.onErrorOccurred(d => { if (d.error !== 'net::ERR_ABORTED') log('[сервис] не загрузилось:', d.url.slice(0, 140), d.error); });
  v.webContents.on('console-message', (e, level, msg) => { if (level >= 2) log('[сервис] консоль:', String(msg).slice(0, 200)); });
  v.webContents.loadURL(url);
  svcs.set(id, { w, v, leadId });
  w.on('closed', () => svcs.delete(id));
}
ipcMain.handle('svc:open', (e, url, leadId) => { if (/^https?:\/\//i.test(url)) openService(url, leadId); });
for (const [ch, fn] of Object.entries({ back: v => v.webContents.goBack(), forward: v => v.webContents.goForward(), reload: v => v.webContents.reload() })) {
  ipcMain.on('svc:' + ch, e => { const s = svcs.get(e.sender.id); if (s) fn(s.v); });
}
ipcMain.on('svc:external', e => { const s = svcs.get(e.sender.id); const u = s && s.v.webContents.getURL(); if (u && /^https?:\/\//i.test(u)) shell.openExternal(u); });
ipcMain.on('svc:go', (e, u) => { const s = svcs.get(e.sender.id); if (s && u) s.v.webContents.loadURL(/^https?:\/\//i.test(u) ? u : 'https://' + u); });
ipcMain.handle('svc:grab', async (e, what) => {
  const s = svcs.get(e.sender.id);
  if (!s) return 0;
  const data = await s.v.webContents.executeJavaScript(what === 'sel' ? 'String(getSelection())' : `(${grabLinks})()`);
  if (win && !win.isDestroyed()) win.webContents.send('svc:data', { leadId: s.leadId, what, data, from: s.v.webContents.getURL() });
  return what === 'sel' ? (data ? 1 : 0) : data.length;
});

const log = (...a) => console.log('[casebook]', ...a);
function createWindow() {
  win = new BrowserWindow({
    width: 1320, height: 840, minWidth: 980, minHeight: 600, backgroundColor: '#121212', title: 'Casebook', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'renderer', 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', ev => ev.preventDefault());
  log('окно создано; Electron', process.versions.electron, '; сессия:', process.env.XDG_SESSION_TYPE || 'не указана');
  win.webContents.on('did-finish-load', () => log('страница загружена'));
  win.webContents.on('did-fail-load', (e, code, desc, url) => log('ОШИБКА загрузки', code, desc, url));
  win.webContents.on('render-process-gone', (e, d) => log('процесс страницы упал:', d.reason));
  win.webContents.on('console-message', (e, level, msg, line, src) => log('консоль:', msg, '(' + src + ':' + line + ')'));
  win.on('show', () => log('окно показано'));
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.show();
}

// Одна копия программы: повторный запуск возвращает окно, а не плодит процессы
if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    if (!win || win.isDestroyed()) createWindow();
    else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
  app.whenReady().then(createWindow);
} else {
  log('Casebook уже запущен, передаю управление работающей копии');
  app.quit();
}
process.on('uncaughtException', e => console.log('[casebook] ОШИБКА в главном процессе:', (e && e.stack) || e));
app.on('window-all-closed', () => app.quit());
