'use strict';

const fs = require('fs');
const path = require('path');
const {
  app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, net, shell,
} = require('electron');
const {
  VERSIONS, MAX_ACCOUNTS, SERVER, GAME_MODES, AFK_COMMANDS, AUTO_MESSAGE_MINUTES, AUTO_MESSAGE_MAX_LENGTH,
} = require('../core/defaults');
const { SITE, parseNews } = require('../core/news');
const { Store } = require('./store');
const { Bridge } = require('./bridge');
const { BotManager } = require('./manager');
const { Updater } = require('./updater');

const RENDERER = path.join(__dirname, '..', 'renderer');
const ICON = path.join(RENDERER, 'assets', 'icon.ico');
const APP_ID = 'net.renderoyuncu.afkclient';
const EXTERNAL_HOSTS = new Set(['renderoyuncu.net', 'discord.gg']);
const NEWS_LIMIT = 3;
const LOG_MAX_BYTES = 1024 * 1024;

let store;
let bridge;
let manager;
const updater = new Updater();
let splash;
let win;
let tray;
let quitting = false;
let icons = null;

if (!app.requestSingleInstanceLock()) app.quit();

app.on('second-instance', () => showMain());

function showMain() {
  if (!win) return;
  win.show();
  if (win.isMinimized()) win.restore();
  win.focus();
}

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

// --- haberler -----------------------------------------------------------

function newsCacheFile() {
  return path.join(app.getPath('userData'), 'news-cache.json');
}

async function getNews() {
  try {
    const response = await net.fetch(`${SITE}/blog/`, { headers: { 'User-Agent': 'Mozilla/5.0 RenderOyuncu-AFK-Client' } });
    if (!response.ok) throw new Error(String(response.status));
    const items = parseNews(await response.text()).slice(0, NEWS_LIMIT);
    if (!items.length) throw new Error('Haber bulunamadı');
    fs.writeFileSync(newsCacheFile(), JSON.stringify(items));
    return { items, cached: false };
  } catch {
    try {
      return { items: JSON.parse(fs.readFileSync(newsCacheFile(), 'utf8')), cached: true };
    } catch {
      return { items: [], cached: false };
    }
  }
}

// --- sunucu durumu ------------------------------------------------------

async function serverStatus() {
  try {
    const { ping } = require('minecraft-protocol');
    const r = await ping({ host: SERVER.host, port: SERVER.port, closeTimeout: 6000 });
    return {
      online: true,
      players: r.players?.online ?? 0,
      max: r.players?.max ?? 0,
      latency: r.latency ?? 0,
    };
  } catch {
    return { online: false, players: 0, max: 0, latency: 0 };
  }
}

// --- pencereler ---------------------------------------------------------

const preload = path.join(__dirname, 'preload.js');

function createSplash() {
  splash = new BrowserWindow({
    width: 474,
    height: 351,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    icon: ICON,
    webPreferences: { preload, sandbox: true, contextIsolation: true },
  });
  splash.loadFile(path.join(RENDERER, 'splash.html'));
  splash.once('ready-to-show', () => splash.show());
  return new Promise((resolve) => splash.webContents.once('did-finish-load', resolve));
}

function splashProgress(percent, text) {
  if (splash && !splash.isDestroyed()) splash.webContents.send('splash:progress', percent, text);
}

function createMain() {
  win = new BrowserWindow({
    width: 1340,
    height: 825,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: '#0b0a09',
    icon: ICON,
    webPreferences: { preload, sandbox: true, contextIsolation: true },
  });
  // Gorev cubugunda Electron yerine uygulamanin simgesi gorunsun.
  win.setAppDetails({
    appId: APP_ID,
    appIconPath: app.isPackaged ? process.execPath : ICON,
    relaunchDisplayName: 'RenderOyuncu AFK Client',
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.on('close', (event) => onClose(event));
  win.on('closed', () => { win = null; });
  win.loadFile(path.join(RENDERER, 'index.html'));
  return new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
}

function onClose(event) {
  if (quitting) return;
  const { app: cfg } = store.settings;
  if (cfg.closeToTray) {
    event.preventDefault();
    win.hide();
    return;
  }
  if (cfg.confirmQuit && manager.activeCount() > 0) {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Çıkış yap', 'Vazgeç'],
      defaultId: 1,
      cancelId: 1,
      title: 'RenderOyuncu AFK Client',
      message: `${manager.activeCount()} hesap bağlı. Çıkarsan bağlantıları kesilecek.`,
    });
    if (choice === 1) {
      event.preventDefault();
      return;
    }
  }
  quitting = true;
}

function createTray() {
  const image = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('RenderOyuncu AFK Client');
  tray.on('double-click', showMain);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Aç', click: showMain },
    { label: 'Tüm hesapları başlat', click: () => manager.startAll() },
    { label: 'Tüm hesapları durdur', click: () => manager.stopAll() },
    { type: 'separator' },
    { label: 'Çıkış', click: () => { quitting = true; app.quit(); } },
  ]));
}

// --- IPC ----------------------------------------------------------------

function accountsPayload() {
  return { accounts: store.publicAccounts(), selected: store.data.selected, bots: manager.snapshot() };
}

function loadIcons() {
  if (!icons) icons = JSON.parse(fs.readFileSync(path.join(__dirname, 'item-icons.json'), 'utf8'));
  return icons;
}

function registerIpc() {
  ipcMain.handle('app:init', () => ({
    ...accountsPayload(),
    settings: store.settings,
    serverHost: SERVER.host,
    gameModes: GAME_MODES,
    afkCommands: AFK_COMMANDS,
    autoMessage: manager.autoMessageStatus(),
    update: updater.status,
    autoMessageMinutes: AUTO_MESSAGE_MINUTES,
    autoMessageMaxLength: AUTO_MESSAGE_MAX_LENGTH,
    versions: VERSIONS,
    maxAccounts: MAX_ACCOUNTS,
    appVersion: app.getVersion(),
  }));

  ipcMain.on('window:minimize', () => win?.minimize());
  ipcMain.on('window:close', () => win?.close());

  ipcMain.on('open-external', (_e, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && EXTERNAL_HOSTS.has(parsed.hostname)) shell.openExternal(parsed.href);
    } catch {
      // gecersiz adres yok sayilir
    }
  });

  ipcMain.handle('news:get', getNews);
  ipcMain.handle('server:status', serverStatus);

  ipcMain.handle('accounts:add', (_e, data) => {
    const id = store.addAccount(data);
    if (store.settings.app.autoStartBots) manager.start(id);
    return { id, ...accountsPayload() };
  });
  ipcMain.handle('accounts:update', (_e, id, patch) => {
    store.updateAccount(id, patch);
    return accountsPayload();
  });
  ipcMain.handle('accounts:remove', (_e, id) => {
    manager.remove(id);
    store.removeAccount(id);
    manager.configureAutoMessage();
    send('autoMessage:changed', manager.autoMessageStatus());
    return accountsPayload();
  });
  ipcMain.handle('accounts:setModes', (_e, id, patch) => {
    store.updateAccount(id, patch);
    manager.applyModes(id, patch);
    return accountsPayload();
  });
  ipcMain.handle('autoMessage:set', (_e, value) => {
    store.setAutoMessage(value);
    manager.configureAutoMessage();
    return manager.autoMessageStatus();
  });
  ipcMain.handle('accounts:select', (_e, id) => {
    store.select(id);
    return accountsPayload();
  });
  ipcMain.handle('accounts:reveal', (_e, id) => store.password(id));

  ipcMain.handle('bots:start', (_e, id) => manager.start(id));
  ipcMain.handle('bots:stop', (_e, id) => manager.stop(id));
  ipcMain.handle('bots:startAll', () => manager.startAll());
  ipcMain.handle('bots:stopAll', () => manager.stopAll());
  ipcMain.handle('bots:chat', (_e, id, text) => manager.send(id, 'chat', text));
  ipcMain.handle('bots:logs', (_e, id) => manager.logs(id));
  ipcMain.handle('bots:clearLogs', (_e, id) => manager.clearLogs(id));
  ipcMain.handle('bots:inventoryAction', (_e, id, action) => manager.send(id, 'inventory', action));

  ipcMain.handle('icons:get', (_e, names) => {
    const all = loadIcons();
    return Object.fromEntries(names.map((n) => [n, all[n] ?? null]));
  });

  ipcMain.handle('settings:save', (_e, settings) => {
    const saved = store.updateSettings(settings);
    applyAppSettings();
    manager.broadcastSettings();
    return saved;
  });
  ipcMain.handle('settings:reset', () => {
    const saved = store.resetSettings();
    applyAppSettings();
    manager.broadcastSettings();
    return saved;
  });

  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:install', () => updater.install());
  ipcMain.handle('update:postpone', () => updater.postpone());

  ipcMain.handle('bridge:status', () => bridge.status());
  ipcMain.handle('bridge:download', async () => {
    const version = await bridge.download((p) => send('bridge:progress', p));
    return { version, ...(await bridge.status()) };
  });
}

function applyAppSettings() {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: store.settings.app.launchOnBoot });
}

/** Destek icin kisa kayit. Sohbet yazilmaz; sifreler oturumda zaten maskelenir. */
function appLog(line) {
  const file = path.join(app.getPath('userData'), 'app.log');
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > LOG_MAX_BYTES) fs.rmSync(file);
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // kayit yazilamamasi uygulamayi durdurmamali
  }
}

function wireManager() {
  manager.on('update', (id) => send('bot:update', id, manager.snapshot()[id]));
  manager.on('log', (id, entry) => {
    send('bot:log', id, entry);
    if (entry.kind === 'system' || entry.kind === 'error') {
      appLog(`[${store.find(id)?.username}] ${entry.kind}: ${entry.text}`);
    }
  });
  manager.on('inventory', (id, inventory) => send('bot:inventory', id, inventory));
  manager.on('accounts', () => send('accounts:changed', accountsPayload()));
  manager.on('autoMessage', () => send('autoMessage:changed', manager.autoMessageStatus()));
  updater.on('status', (status) => send('update:status', status));
  updater.on('install', () => { quitting = true; });
  manager.on('transition', (id, previous, state, detail) => {
    appLog(`[${store.find(id)?.username}] durum: ${previous} -> ${state} ${detail}`);
    if (!store.settings.app.notifications || previous !== 'online') return;
    if (state === 'online' || !Notification.isSupported()) return;
    const name = store.find(id)?.username ?? 'Hesap';
    new Notification({ title: `${name} bağlantısı koptu`, body: detail || 'Sunucudan ayrıldı', icon: ICON }).show();
  });
}

// --- acilis -------------------------------------------------------------

app.whenReady().then(async () => {
  app.setAppUserModelId(APP_ID);
  Menu.setApplicationMenu(null);

  await createSplash();
  splashProgress(15, 'Ayarlar yükleniyor');
  store = new Store();
  bridge = new Bridge();
  manager = new BotManager(store, bridge);
  registerIpc();
  wireManager();
  applyAppSettings();
  manager.configureAutoMessage();

  splashProgress(40, 'Arayüz hazırlanıyor');
  await createMain();

  splashProgress(70, 'Haberler alınıyor');
  await getNews();

  splashProgress(100, 'Hazır');
  await new Promise((r) => setTimeout(r, 450));

  createTray();
  splash.destroy();
  if (!store.settings.app.startMinimized) showMain();
  appLog(`Uygulama acildi v${app.getVersion()} hesap=${store.data.accounts.length} otomatikGiris=${store.settings.app.autoStartBots} ayarOkuma=${store.loadError ?? 'tamam'} argv=${process.argv.slice(1).join(' ')}`);
  if (store.settings.app.autoStartBots) manager.startAll({ onlyAutoStart: true });
  updater.start();
});

app.on('before-quit', () => {
  quitting = true;
  manager?.shutdown();
});

app.on('window-all-closed', () => app.quit());
