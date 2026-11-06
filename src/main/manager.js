'use strict';

const path = require('path');
const { EventEmitter } = require('events');
const { utilityProcess } = require('electron');
const defaults = require('../core/defaults');

const { SERVER } = defaults;

const WORKER = path.join(__dirname, 'worker.js');
const ACTIVE = new Set(['connecting', 'auth', 'online', 'waiting']);

/** Hesap basina bir worker sureci calistirir, durum/konsol/envanteri arayuze aktarir. */
class BotManager extends EventEmitter {
  constructor(store, bridge) {
    super();
    this.store = store;
    this.bridge = bridge;
    this.runtime = new Map();
    this.staggerTimers = new Set();
  }

  rt(id) {
    if (!this.runtime.has(id)) {
      this.runtime.set(id, {
        child: null, state: 'idle', detail: '', stats: null, inventory: null, logs: [],
      });
    }
    return this.runtime.get(id);
  }

  snapshot() {
    const out = {};
    for (const { id } of this.store.publicAccounts()) {
      const { state, detail, stats, inventory } = this.rt(id);
      out[id] = { state, detail, stats, inventory };
    }
    return out;
  }

  logs(id) {
    return this.rt(id).logs;
  }

  clearLogs(id) {
    this.rt(id).logs = [];
  }

  isActive(id) {
    return ACTIVE.has(this.rt(id).state);
  }

  activeCount() {
    return this.store.publicAccounts().filter((a) => this.isActive(a.id)).length;
  }

  pushLog(id, entry) {
    const rt = this.rt(id);
    rt.logs.push(entry);
    const max = this.store.settings.console.maxLines;
    if (rt.logs.length > max) rt.logs.splice(0, rt.logs.length - max);
    this.emit('log', id, entry);
  }

  setStatus(id, state, detail = '') {
    const rt = this.rt(id);
    const previous = rt.state;
    rt.state = state;
    rt.detail = detail;
    this.emit('update', id);
    if (previous !== state) this.emit('transition', id, previous, state, detail);
  }

  async resolveConnection() {
    const { server, bridge } = this.store.settings;
    if (!bridge.enabled) {
      return {
        host: SERVER.host,
        port: SERVER.port,
        version: server.version === 'auto' ? null : server.version,
      };
    }
    await this.bridge.ensure({
      host: SERVER.host,
      port: SERVER.port,
      targetVersion: bridge.targetVersion,
      bindPort: bridge.port,
    });
    return { host: '127.0.0.1', port: bridge.port, version: bridge.clientVersion };
  }

  async start(id) {
    const account = this.store.find(id);
    if (!account || this.isActive(id)) return;

    // Hata ile duran oturumun sureci hala acik olabilir.
    const rt = this.rt(id);
    if (rt.child) {
      const old = rt.child;
      rt.child = null;
      old.kill();
    }

    this.setStatus(id, 'connecting', 'Hazırlanıyor');
    let connection;
    try {
      connection = await this.resolveConnection();
    } catch (err) {
      this.pushLog(id, { ts: Date.now(), kind: 'error', text: err.message });
      this.setStatus(id, 'error', err.message);
      return;
    }
    if (rt.state !== 'connecting') return; // kopru acilirken durduruldu

    const child = utilityProcess.fork(WORKER, [], { serviceName: `afk-${account.username}` });
    rt.child = child;

    child.on('message', ({ type, payload }) => {
      switch (type) {
        case 'status':
          this.setStatus(id, payload.state, payload.detail);
          break;
        case 'log':
          this.pushLog(id, payload);
          break;
        case 'stats':
          rt.stats = payload;
          this.emit('update', id);
          break;
        case 'inventory':
          rt.inventory = payload;
          this.emit('inventory', id, payload);
          break;
        case 'registered':
          this.store.updateAccount(id, { registered: true });
          this.emit('accounts');
          break;
        default:
      }
    });

    child.on('exit', (code) => {
      if (rt.child !== child) return;
      rt.child = null;
      rt.stats = null;
      rt.inventory = null;
      this.emit('inventory', id, null);
      if (ACTIVE.has(rt.state)) {
        this.pushLog(id, { ts: Date.now(), kind: 'error', text: `Bot süreci kapandı (kod ${code}).` });
        this.setStatus(id, 'error', 'Bot süreci kapandı');
      }
    });

    child.postMessage({
      type: 'start',
      payload: {
        account: {
          id,
          username: account.username,
          password: this.store.password(id),
          email: account.email,
          registered: account.registered,
          gameMode: account.gameMode ?? null,
          afkMode: account.afkMode ?? null,
        },
        settings: this.store.settings,
        connection,
      },
    });
  }

  stop(id) {
    const rt = this.rt(id);
    if (rt.child) rt.child.postMessage({ type: 'stop' });
    else this.setStatus(id, 'idle', '');
    rt.stats = null;
    this.emit('update', id);
  }

  /** Hesaplari art arda baglar: ayni anda giris sunucuda bot korumasina takilabilir. */
  startAll({ onlyAutoStart = false } = {}) {
    this.cancelStagger();
    const stagger = this.store.settings.reconnect.staggerSeconds * 1000;
    const ids = this.store.publicAccounts()
      .filter((a) => !this.isActive(a.id) && (!onlyAutoStart || a.autoStart))
      .map((a) => a.id);
    ids.forEach((id, i) => {
      const t = setTimeout(() => {
        this.staggerTimers.delete(t);
        this.start(id);
      }, stagger * i);
      this.staggerTimers.add(t);
    });
  }

  cancelStagger() {
    for (const t of this.staggerTimers) clearTimeout(t);
    this.staggerTimers.clear();
  }

  stopAll() {
    this.cancelStagger();
    for (const { id } of this.store.publicAccounts()) this.stop(id);
  }

  send(id, type, payload) {
    this.rt(id).child?.postMessage({ type, payload });
  }

  /** Oyun modu / AFK secimini calisan bota iletir; oyun modu secildiyse botu baslatir. */
  applyModes(id, patch) {
    if (this.rt(id).child) this.send(id, 'modes', patch);
    if (patch.gameMode && !this.isActive(id)) this.start(id);
  }

  /** Sabit aralikli otomatik mesaj: tek hesap, tek zamanlayici. */
  configureAutoMessage() {
    clearInterval(this.autoMessageTimer);
    this.autoMessageNext = null;
    const { enabled } = this.store.data.autoMessage;
    if (!enabled) return;
    const interval = defaults.AUTO_MESSAGE_MINUTES * 60000;
    this.autoMessageNext = Date.now() + interval;
    this.autoMessageTimer = setInterval(() => {
      this.autoMessageNext = Date.now() + interval;
      const { accountId, text } = this.store.data.autoMessage;
      if (this.rt(accountId).state === 'online') this.send(accountId, 'chat', text);
      this.emit('autoMessage');
    }, interval);
  }

  autoMessageStatus() {
    return { ...this.store.data.autoMessage, nextAt: this.autoMessageNext ?? null };
  }

  broadcastSettings() {
    for (const { child } of this.runtime.values()) {
      child?.postMessage({ type: 'settings', payload: this.store.settings });
    }
  }

  remove(id) {
    const rt = this.runtime.get(id);
    const child = rt?.child;
    if (rt) rt.child = null;
    child?.kill();
    this.runtime.delete(id);
  }

  shutdown() {
    this.cancelStagger();
    clearInterval(this.autoMessageTimer);
    for (const { child } of this.runtime.values()) child?.kill();
    this.bridge.stop();
  }
}

module.exports = { BotManager };
