'use strict';
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// منع فتح أكثر من نسخة من التطبيق في نفس الوقت
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  let win = null;

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
    win.loadFile(path.join(__dirname, 'index.html'));
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

  app.whenReady().then(() => {
    createWindow();
    setupAutoUpdater();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { app.quit(); });
}
