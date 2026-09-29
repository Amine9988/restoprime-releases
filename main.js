'use strict';
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { startServer, localAddresses } = require('./lan-server');

/* ---------- النسخة التجريبية (تُفعَّل عبر extraMetadata عند بناء نسخة Trial) ---------- */
const PKG = require('./package.json');
const IS_TRIAL = !!PKG.trial;
const TRIAL_DAYS = PKG.trialDays || 15;
const DAY = 24 * 60 * 60 * 1000;
// نسخة احتياطية ثانية من تاريخ البداية خارج مجلد userData لصعوبة التحايل بحذفه
const trialFiles = () => [
  path.join(app.getPath('userData'), 'trial.json'),
  path.join(process.env.PROGRAMDATA || app.getPath('appData'), 'RestoPrimeTrial', 'trial.json'),
];
function readTrialFile(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
function trialStatus() {
  if (!IS_TRIAL) return { trial: false };
  const now = Date.now();
  const saved = trialFiles().map(readTrialFile).filter((d) => d && Number.isFinite(d.start));
  const start = saved.length ? Math.min(...saved.map((d) => d.start)) : now;
  const lastSeen = saved.length ? Math.max(...saved.map((d) => d.lastSeen || d.start)) : now;
  // رجوع الساعة إلى الوراء بأكثر من يوم = محاولة تحايل
  const tampered = now < lastSeen - DAY;
  const effectiveNow = Math.max(now, lastSeen);
  const data = JSON.stringify({ start, lastSeen: effectiveNow });
  for (const f of trialFiles()) {
    try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); } catch (e) { /* ignore */ }
  }
  const daysLeft = Math.max(0, Math.ceil((start + TRIAL_DAYS * DAY - effectiveNow) / DAY));
  return { trial: true, days: TRIAL_DAYS, daysLeft, expired: tampered || daysLeft <= 0, tampered };
}

// منع فتح أكثر من نسخة من التطبيق في نفس الوقت
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let win = null;
  let lan = { running: false, error: null };
  let trial = trialStatus();

  /* ---------- إعدادات الشبكة المحلية ---------- */
  const DEFAULT_NET = { mode: 'standalone', port: 8787, host: '' }; // mode: standalone | server | client
  const netFile = () => path.join(app.getPath('userData'), 'network.json');
  function readNet() {
    try { return { ...DEFAULT_NET, ...JSON.parse(fs.readFileSync(netFile(), 'utf8')) }; }
    catch (e) { return { ...DEFAULT_NET }; }
  }
  function writeNet(cfg) {
    const clean = {
      mode: ['standalone', 'server', 'client'].includes(cfg.mode) ? cfg.mode : 'standalone',
      port: Math.min(65535, Math.max(1024, parseInt(cfg.port, 10) || 8787)),
      host: String(cfg.host || '').trim(),
    };
    fs.writeFileSync(netFile(), JSON.stringify(clean, null, 2));
    return clean;
  }

  async function startLan(cfg) {
    if (cfg.mode !== 'server' || trial.expired) return;
    try {
      const r = await startServer({
        port: cfg.port,
        dataFile: path.join(app.getPath('userData'), 'shared-data.json'),
        appDir: __dirname,
        appVersion: app.getVersion(),
      });
      lan = { running: true, error: null, port: r.port, addresses: r.addresses };
    } catch (e) {
      lan = { running: false, error: e.code === 'EADDRINUSE' ? `المنفذ ${cfg.port} مستخدم من برنامج آخر` : String(e.message || e) };
    }
  }

  ipcMain.handle('net:get', () => ({ config: readNet(), status: lan, addresses: localAddresses() }));
  ipcMain.handle('net:set', (_e, cfg) => writeNet(cfg));
  ipcMain.handle('trial:get', () => trial);
  ipcMain.handle('net:relaunch', () => { app.relaunch(); app.exit(0); });

  function createWindow() {
    win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 600,
      title: 'RestoPrime',
      icon: path.join(__dirname, 'build', 'icon.png'),
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    Menu.setApplicationMenu(null);
    win.loadFile(path.join(__dirname, trial.expired ? 'trial-expired.html' : 'index.html'));
    win.once('ready-to-show', () => win.maximize());

    // فتح الروابط الخارجية في المتصفح بدل نافذة جديدة
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });

    win.on('closed', () => { win = null; });
  }

  /* ---------- التحديث التلقائي عبر GitHub Releases ---------- */
  function setupAutoUpdater() {
    if (!app.isPackaged) return; // لا تحديثات أثناء التطوير

    if (IS_TRIAL) autoUpdater.channel = 'trial'; // النسخة التجريبية تتحدّث من trial.yml
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = null;

    autoUpdater.on('update-available', (info) => {
      if (win) win.webContents.send('update:available', info.version);
    });

    autoUpdater.on('download-progress', (p) => {
      if (win) win.webContents.send('update:progress', Math.round(p.percent));
    });

    autoUpdater.on('update-downloaded', async (info) => {
      if (win) win.webContents.send('update:downloaded', info.version);
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        title: 'تحديث جديد',
        message: `تم تنزيل الإصدار ${info.version} من RestoPrime`,
        detail: 'هل تريد إعادة تشغيل البرنامج الآن لتثبيت التحديث؟ سيُثبَّت تلقائياً عند الإغلاق إذا اخترت لاحقاً.',
        buttons: ['إعادة التشغيل الآن', 'لاحقاً'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (response === 0) setImmediate(() => autoUpdater.quitAndInstall(false, true));
    });

    autoUpdater.on('error', () => { /* تجاهل أخطاء الشبكة بصمت */ });

    const check = () => autoUpdater.checkForUpdates().catch(() => {});
    setTimeout(check, 5000);                    // بعد 5 ثوانٍ من التشغيل
    setInterval(check, 4 * 60 * 60 * 1000);     // ثم كل 4 ساعات
  }

  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    trial = trialStatus();
    await startLan(readNet());
    createWindow();
    setupAutoUpdater();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { app.quit(); });
}
