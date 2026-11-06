'use strict';

const { EventEmitter } = require('events');
const { app } = require('electron');
const { UPDATE_FEED, UPDATE_CHECK_MINUTES, UPDATE_INSTALL_SECONDS } = require('../core/defaults');

/**
 * Yeni surumu arka planda indirir. Uygulama tepside gunlerce acik kalabildigi icin
 * "kapaninca kur" yetmez: indirme bitince geri sayimla kurup yeniden baslatir.
 */
class Updater extends EventEmitter {
  constructor() {
    super();
    this.status = { state: 'disabled' };
    this.installTimer = null;
  }

  set(status) {
    this.status = status;
    this.emit('status', status);
  }

  start() {
    if (!app.isPackaged || !UPDATE_FEED) return;
    const { autoUpdater } = require('electron-updater');
    this.autoUpdater = autoUpdater;
    autoUpdater.setFeedURL(UPDATE_FEED);
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = null;

    autoUpdater.on('checking-for-update', () => {
      if (this.status.state !== 'ready') this.set({ state: 'checking' });
    });
    autoUpdater.on('update-not-available', () => this.set({ state: 'latest' }));
    autoUpdater.on('update-available', (info) => this.set({ state: 'downloading', version: info.version, percent: 0 }));
    autoUpdater.on('download-progress', (p) => {
      this.set({ ...this.status, state: 'downloading', percent: Math.round(p.percent) });
    });
    autoUpdater.on('update-downloaded', (info) => this.onDownloaded(info.version));
    autoUpdater.on('error', (err) => {
      if (this.status.state !== 'ready') this.set({ state: 'error', message: err.message.split('\n')[0] });
    });

    this.check();
    setInterval(() => this.check(), UPDATE_CHECK_MINUTES * 60000);
  }

  check() {
    if (!this.autoUpdater || this.status.state === 'ready' || this.status.state === 'downloading') return;
    this.autoUpdater.checkForUpdates().catch(() => {}); // hata 'error' olayiyla gosterilir
  }

  onDownloaded(version) {
    const installAt = Date.now() + UPDATE_INSTALL_SECONDS * 1000;
    this.set({ state: 'ready', version, installAt });
    this.installTimer = setTimeout(() => this.install(), UPDATE_INSTALL_SECONDS * 1000);
  }

  /** Geri sayimi iptal eder; guncelleme uygulama kapaninca kurulur. */
  postpone() {
    clearTimeout(this.installTimer);
    this.set({ ...this.status, installAt: null });
  }

  install() {
    if (this.status.state !== 'ready') return;
    clearTimeout(this.installTimer);
    this.emit('install');
    this.autoUpdater.quitAndInstall(true, true);
  }
}

module.exports = { Updater };
