'use strict';

const { EventEmitter } = require('events');
const mineflayer = require('mineflayer');
const {
  REGISTER_COMMAND, EMAIL_TEMPLATE, LOBBY_ITEM_PATTERN, GAME_MODES, AFK_COMMANDS,
} = require('./defaults');

const STATS_INTERVAL_MS = 2000;
const INVENTORY_THROTTLE_MS = 250;
const AUTH_CONFIRM_MS = 8000;
const AUTH_RESEND_GAP_MS = 3000;
const STABLE_ONLINE_MS = 60000;
const MENU_TIMEOUT_MS = 15000; // Lobi yogunken menu birkac saniye gec acilabiliyor
const JOIN_DELAY_MS = 3000;
const JOIN_CHECK_MS = 20000;
const JOIN_MAX_ATTEMPTS = 5;
const AFK_COMMAND_DELAY_MS = 3000;
const LOCATION_LABELS = { lobby: 'Lobi', survival: 'Survival Gard' };

function regex(source) {
  try {
    return source ? new RegExp(source, 'iu') : null;
  } catch {
    return null;
  }
}

/** Sohbet bileseni (string, JSON, NBT'den cozulmus nesne) -> duz metin. */
function flatten(value) {
  if (value == null) return '';
  if (typeof value === 'string') {
    const s = value.trim();
    if (s.startsWith('{') || s.startsWith('[') || s.startsWith('"')) {
      try {
        return flatten(JSON.parse(s));
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(flatten).join('');
  if (typeof value === 'object') {
    if (value.type && 'value' in value) return flatten(value.value); // NBT sarmalayici
    const head = value.text ?? value.translate ?? value[''] ?? '';
    const extra = value.extra ? flatten(value.extra) : '';
    return flatten(head) + extra;
  }
  return String(value);
}

function stripCodes(text) {
  return text.replace(/§./g, '');
}

const SMALL_CAPS = {
  ᴀ: 'a', ʙ: 'b', ᴄ: 'c', ᴅ: 'd', ᴇ: 'e', ꜰ: 'f', ɢ: 'g', ʜ: 'h', ɪ: 'i', ᴊ: 'j', ᴋ: 'k', ʟ: 'l', ᴍ: 'm',
  ɴ: 'n', ᴏ: 'o', ᴘ: 'p', ʀ: 'r', ꜱ: 's', ᴛ: 't', ᴜ: 'u', ᴠ: 'v', ᴡ: 'w', ʏ: 'y', ᴢ: 'z',
};

/** Sunucu menulerindeki "ꜱᴜʀᴠɪᴠᴀʟ" gibi susu harfleri duz metne cevirir. */
function plainText(text) {
  return text.replace(/[ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘʀꜱᴛᴜᴠᴡʏᴢ]/g, (c) => SMALL_CAPS[c]);
}

function itemText(item) {
  const s = serializeItem(item, 0);
  return plainText([s.customName, s.displayName, s.name, ...(s.lore ?? [])].filter(Boolean).join(' '));
}

function serializeItem(item, slot) {
  if (!item) return null;
  const out = {
    slot,
    name: item.name,
    displayName: item.displayName || item.name,
    count: item.count,
  };
  try {
    if (item.customName) out.customName = stripCodes(flatten(item.customName));
    if (item.maxDurability) {
      out.maxDurability = item.maxDurability;
      out.durabilityUsed = item.durabilityUsed || 0;
    }
    const lore = item.customLore;
    if (Array.isArray(lore) && lore.length) out.lore = lore.map((l) => stripCodes(flatten(l)));
    const enchants = item.enchants;
    if (Array.isArray(enchants) && enchants.length) {
      out.enchants = enchants.map((e) => ({ name: e.name, level: e.lvl }));
    }
  } catch {
    // Sunucuya ozel bozuk NBT envanteri dusurmemeli; temel bilgiler yeterli.
  }
  return out;
}

/**
 * Tek bir AFK hesabin yasam dongusu: baglanti, otomatik kayit/giris,
 * anti-AFK, yeniden baglanma ve envanter takibi.
 *
 * Olaylar: 'status' {state, detail}, 'log' {ts, kind, text}, 'stats', 'inventory',
 *          'registered'
 */
class BotSession extends EventEmitter {
  constructor({ account, settings, connection }) {
    super();
    this.account = { ...account };
    this.settings = settings;
    this.connection = connection;
    this.bot = null;
    this.state = 'idle';
    this.stopped = true;
    this.noReconnect = null;
    this.attempts = 0;
    this.timers = new Set();
    this.onlineSince = 0;
    this.lastPhysicalAction = 0;
  }

  // --- yardimcilar -----------------------------------------------------

  later(fn, ms) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  cancel(t) {
    if (!t) return;
    clearTimeout(t);
    clearInterval(t);
    this.timers.delete(t);
  }

  clearTimers() {
    for (const t of this.timers) {
      clearTimeout(t);
      clearInterval(t);
    }
    this.timers.clear();
  }

  mask(text) {
    const pw = this.account.password;
    return pw ? text.split(pw).join('••••••') : text;
  }

  log(kind, text) {
    this.emit('log', { ts: Date.now(), kind, text: this.mask(String(text)) });
  }

  setState(state, detail = '') {
    this.state = state;
    this.emit('status', { state, detail });
  }

  // --- yasam dongusu ---------------------------------------------------

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.noReconnect = null;
    this.attempts = 0;
    this.connect();
  }

  stop(detail = 'Durduruldu') {
    this.stopped = true;
    this.clearTimers();
    this.setState('idle', detail);
    const bot = this.bot;
    this.bot = null;
    if (bot) {
      try {
        bot.quit('disconnect');
      } catch {
        bot.end?.();
      }
    }
    this.emit('inventory', null);
  }

  connect() {
    const { host, port, version } = this.connection;
    this.setState('connecting', `${host}:${port}`);
    this.log('system', `Bağlanılıyor: ${host}:${port} (sürüm: ${version || 'otomatik'})`);

    this.auth = { done: false, attempts: 0, lastSent: 0, pending: null, confirm: null };
    this.spawned = false;
    this.authReady = false;
    this.watchedInventory = null;
    this.location = 'lobby';
    this.locationShown = false;
    this.joinClicked = false;
    this.joinAttempts = 0;
    this.afkAfterRespawn = false;

    const behavior = this.settings.behavior;
    let bot;
    try {
      bot = mineflayer.createBot({
        host,
        port,
        username: this.account.username,
        auth: 'offline',
        version: version || false,
        hideErrors: true,
        respawn: true,
        physicsEnabled: behavior.physics,
        viewDistance: behavior.viewDistance,
      });
    } catch (err) {
      this.log('error', `Bot oluşturulamadı: ${err.message}`);
      this.scheduleReconnect(err.message);
      return;
    }
    this.bot = bot;
    this.dedupeConfigReplies(bot);

    const timeout = this.later(() => {
      if (this.bot === bot && !this.spawned) {
        this.log('error', 'Bağlantı zaman aşımına uğradı.');
        bot.end('timeout');
      }
    }, this.settings.server.connectTimeout * 1000);

    bot.once('login', () => {
      if (this.bot !== bot) return;
      this.log('system', `Sunucuya giriş yapıldı (${bot.version}).`);
      this.onLogin();
    });

    bot.on('spawn', () => {
      if (this.bot !== bot) return;
      if (this.spawned) { // dunya degisimi / olum sonrasi yeniden dogma
        this.onRespawn();
        return;
      }
      this.spawned = true;
      this.cancel(timeout);
      this.onSpawn(bot);
    });

    bot.on('message', (msg, position) => {
      if (this.bot !== bot) return;
      this.onMessage(msg, position);
    });

    bot.on('title', (text) => {
      if (this.bot !== bot) return;
      this.handleAuthText(stripCodes(flatten(text)));
    });

    bot.on('kicked', (reason) => {
      if (this.bot !== bot) return;
      const text = stripCodes(flatten(reason)) || 'Bilinmeyen sebep';
      this.lastKick = text;
      this.log('error', `Sunucudan atıldı: ${text}`);
      const stop = regex(this.settings.reconnect.stopKeywords);
      if (stop && stop.test(text)) this.noReconnect = `Atılma sebebi: ${text}`;
    });

    bot.on('error', (err) => {
      if (this.bot !== bot) return;
      this.log('error', `Hata: ${err.message || err}`);
    });

    bot.on('end', (reason) => {
      if (this.bot !== bot) return;
      this.cancel(timeout);
      this.onEnd(reason);
    });

    bot.on('death', () => {
      if (this.bot !== bot) return;
      this.log('system', 'Karakter öldü, yeniden doğuluyor.');
      this.afkAfterRespawn = true;
    });

    bot.on('health', () => {
      if (this.bot !== bot) return;
      this.onHealth(bot);
    });

    bot.on('resourcePack', () => {
      if (this.bot !== bot) return;
      // Yapilandirma asamasinda mineflayer kendisi kabul eder; ikinci cevap gecisi kilitler.
      if (bot._client.state === 'configuration') return;
      if (this.settings.behavior.acceptResourcePack) {
        bot.acceptResourcePack?.();
        this.log('debug', 'Kaynak paketi kabul edildi.');
      } else {
        bot.denyResourcePack?.();
      }
    });

    bot.on('windowOpen', () => this.bot === bot && this.pushInventory());
    bot.on('windowClose', () => this.bot === bot && this.pushInventory());
    bot.on('heldItemChanged', () => this.bot === bot && this.pushInventory());
  }

  /**
   * minecraft-protocol her yapilandirma asamasinda yeni bir `once` dinleyici ekler.
   * Limbo ilk asamada select_known_packs istemezse dinleyici bekler kalir ve Lobi'ye
   * geciste paket iki kez gider; sunucu da "internal server connection error" ile atar.
   * Bu yuzden her asamada bu cevaplarin yalnizca ilki gonderilir.
   *
   * mineflayer kaynak paketi cevabini UUID nesnesiyle yazar, bu da sifir UUID olarak
   * kodlanir; sunucu cevabi eslestiremez ve gecis sonsuza kadar bekler. Metne cevrilir.
   */
  dedupeConfigReplies(bot) {
    const client = bot._client;
    const write = client.write.bind(client);
    const sent = new Set();
    client.on('state', (next) => {
      if (next === 'configuration') sent.clear();
    });
    client.write = (name, params) => {
      if (name === 'select_known_packs' || name === 'accept_code_of_conduct') {
        if (sent.has(name)) return undefined;
        sent.add(name);
      }
      if (name === 'resource_pack_receive' && params.uuid) {
        return write(name, { ...params, uuid: String(params.uuid) });
      }
      return write(name, params);
    };
  }

  /** Giris ekrani limbodaysa sunucu spawn olmadan once sorar; bu yuzden burada baslar. */
  onLogin() {
    const { autoRegister, autoLogin, fallbackSeconds } = this.settings.auth;
    if (!autoRegister && !autoLogin) return;
    this.setState('auth', 'Kayıt / giriş bekleniyor');
    // Sunucu sohbette sormayabilir (ornegin yalnizca ekranda gosterir).
    this.authFallback = this.later(() => {
      if (this.auth.done || this.auth.attempts > 0) return;
      this.log('system', 'Giriş mesajı görülmedi, komut doğrudan gönderiliyor.');
      this.sendAuth(this.account.registered ? 'login' : 'register');
    }, fallbackSeconds * 1000);
  }

  onSpawn(bot) {
    this.log('system', 'Oyuna girildi.');
    this.watchInventory(bot);
    this.pushInventory();
    this.startStats(bot);

    const { autoRegister, autoLogin } = this.settings.auth;
    if (!autoRegister && !autoLogin) this.authReady = true;
    if (this.authReady) this.goOnline();
  }

  /** Sunucu degisiminde mineflayer yeni envanter nesnesi olusturur. */
  watchInventory(bot) {
    if (this.watchedInventory === bot.inventory) return;
    this.watchedInventory = bot.inventory;
    bot.inventory.on('updateSlot', () => this.bot === bot && this.pushInventory());
    this.pushInventory();
  }

  onMessage(msg, position) {
    const plain = msg.toString();
    if (!plain.trim()) return;
    const isActionBar = position === 'game_info';
    if (position !== 'chat') this.handleAuthText(plain);
    if (isActionBar) {
      if (this.settings.console.showActionBar) this.log('actionbar', msg.toMotd());
      return;
    }
    this.log(position === 'chat' ? 'chat' : 'server', msg.toMotd());
  }

  // --- otomatik kayit / giris ------------------------------------------

  handleAuthText(text) {
    const a = this.auth;
    const cfg = this.settings.auth;
    if (!a || a.done || !text || (!cfg.autoRegister && !cfg.autoLogin)) return;

    if (a.pending && regex(cfg.wrongPattern)?.test(text)) {
      this.authFailed('Şifre yanlış. Hesabın şifresini kontrol et.');
      return;
    }
    if (a.pending && regex(cfg.successPattern)?.test(text)) {
      this.authSucceeded();
      return;
    }
    if (regex(cfg.alreadyPattern)?.test(text)) {
      this.sendAuth('login');
      return;
    }
    if (regex(cfg.registerPattern)?.test(text)) {
      this.sendAuth('register');
      return;
    }
    if (regex(cfg.loginPattern)?.test(text)) {
      this.markRegistered();
      this.sendAuth('login');
    }
  }

  sendAuth(kind) {
    const a = this.auth;
    const cfg = this.settings.auth;
    if (a.done || !this.bot) return;
    if (kind === 'register' && !cfg.autoRegister) return;
    if (kind === 'login' && !cfg.autoLogin) return;

    const now = Date.now();
    if (now - a.lastSent < AUTH_RESEND_GAP_MS) return;
    if (a.attempts >= cfg.maxAttempts) {
      this.authFailed(`${cfg.maxAttempts} denemeden sonra giriş yapılamadı.`);
      return;
    }
    a.attempts += 1;
    a.lastSent = now;
    a.pending = kind;
    this.cancel(this.authFallback);

    const template = kind === 'register' ? REGISTER_COMMAND : cfg.loginCommand;
    const username = this.account.username.toLowerCase();
    const command = template
      .replaceAll('{password}', this.account.password)
      .replaceAll('{email}', this.account.email || EMAIL_TEMPLATE.replaceAll('{username}', username))
      .replaceAll('{username}', username);
    this.cancel(a.delay);
    a.delay = this.later(() => {
      if (!this.bot || a.done) return;
      this.log('system', kind === 'register' ? 'Otomatik kayıt yapılıyor…' : 'Otomatik giriş yapılıyor…');
      this.bot.chat(command);
    }, cfg.delayMs);

    // Bircok sunucu basari mesaji gostermez: tekrar sorulmazsa basarili say.
    this.cancel(a.confirm);
    a.confirm = this.later(() => {
      if (a.done) return;
      this.log('debug', 'Onay mesajı görülmedi; sunucu tekrar sormadığı için giriş başarılı sayıldı.');
      this.authSucceeded();
    }, cfg.delayMs + AUTH_CONFIRM_MS);
  }

  markRegistered() {
    if (this.account.registered) return;
    this.account.registered = true;
    this.emit('registered');
  }

  authSucceeded() {
    const a = this.auth;
    if (a.done) return;
    a.done = true;
    this.cancel(a.confirm);
    this.cancel(a.delay);
    this.markRegistered();
    this.log('system', a.pending === 'register' ? 'Kayıt tamamlandı.' : 'Giriş tamamlandı.');
    this.onAuthenticated();
  }

  authFailed(message) {
    const a = this.auth;
    a.done = true;
    this.cancel(a.confirm);
    this.cancel(a.delay);
    this.log('error', message);
    this.noReconnect = message;
    this.bot?.quit('auth failed');
  }

  onAuthenticated() {
    this.authReady = true;
    if (this.spawned) this.goOnline();
    else this.setState('auth', 'Lobiye geçiliyor');
  }

  goOnline() {
    if (this.state === 'online') return;
    this.onlineSince = Date.now();
    this.setState('online');
    this.runPostLogin();
    this.scheduleAntiAfk();
    this.schedulePeriodic();
    this.scheduleServerJoin();
  }

  /** Survival'da AFK yeri secilene kadar bot kimildamaz. */
  holdStill() {
    return this.location === 'survival' && !this.account.afkMode;
  }

  /** Sunucu degisimi sirasinda oyun paketi gondermek baglantiyi dusurur. */
  inPlay() {
    return this.bot?._client.state === 'play';
  }

  // --- Lobi'den oyun sunucusuna gecis ----------------------------------

  lobbyItem(bot) {
    const itemRe = regex(LOBBY_ITEM_PATTERN);
    return bot.inventory.slots.find((i) => i && itemRe.test(itemText(i)));
  }

  /** Secili oyun moduna girer; Lobi'ye dusulurse tekrar dener. */
  scheduleServerJoin(delay = JOIN_DELAY_MS) {
    this.cancel(this.joinTimer);
    if (!this.account.gameMode) return;
    this.joinTimer = this.later(() => this.serverJoinTick(), delay);
  }

  async serverJoinTick() {
    const bot = this.bot;
    if (!bot || this.state !== 'online' || !this.account.gameMode) return;

    const item = this.inPlay() ? this.lobbyItem(bot) : null;
    if (this.inPlay() && !item) {
      this.joinAttempts = 0;
    } else if (item && this.joinAttempts >= JOIN_MAX_ATTEMPTS) {
      this.log('error', `${JOIN_MAX_ATTEMPTS} denemeden sonra oyun moduna girilemedi, Lobi'de kalınıyor.`);
      return;
    } else if (item) {
      this.joinAttempts += 1;
      await this.useServerMenu(bot, item);
    }
    if (this.bot === bot) this.scheduleServerJoin(JOIN_CHECK_MS);
  }

  /** Lobi pusulasi envanterdeyse Lobi'dedir; pusula gidince oyun modundadir. */
  updateLocation(bot) {
    if (this.state !== 'online' || !this.inPlay()) return;
    const next = this.lobbyItem(bot) || !this.joinClicked ? 'lobby' : 'survival';
    if (next === this.location && this.locationShown) return;
    const arrived = next === 'survival' && this.location !== 'survival';
    this.location = next;
    this.locationShown = true;
    this.setState('online', LOCATION_LABELS[next]);
    if (arrived) {
      this.log('system', `${GAME_MODES.survival.name} oyununa girildi.`);
      // Yalnizca onceden secili mod tekrarlanir; sonradan secilen zaten aninda gonderilir.
      if (this.account.afkMode) this.later(() => this.sendAfk(), AFK_COMMAND_DELAY_MS);
    }
  }

  /** Secili AFK komutunu gonderir; yalnizca oyun modundayken gecerlidir. */
  sendAfk() {
    const command = AFK_COMMANDS[this.account.afkMode];
    if (command && this.location === 'survival' && this.inPlay()) this.sendChat(command);
  }

  onRespawn() {
    if (!this.afkAfterRespawn) return;
    this.afkAfterRespawn = false;
    this.log('system', 'Yeniden doğuldu.');
    this.later(() => this.sendAfk(), AFK_COMMAND_DELAY_MS);
  }

  /** Arayuzden gelen oyun modu / AFK secimi. */
  setModes({ gameMode, afkMode }) {
    if (gameMode !== undefined) {
      this.account.gameMode = gameMode;
      this.joinAttempts = 0;
      if (this.state === 'online') this.scheduleServerJoin(0);
    }
    if (afkMode !== undefined) {
      this.account.afkMode = afkMode;
      this.sendAfk();
    }
  }

  async useServerMenu(bot, item) {
    const menuRe = regex(GAME_MODES[this.account.gameMode].menuPattern);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    this.log('system', `${GAME_MODES[this.account.gameMode].name} oyununa giriliyor (deneme ${this.joinAttempts}).`);
    try {
      // Onceki denemede gec acilan menu hala aciksa dogrudan kullanilir.
      if (!bot.currentWindow) {
        await bot.equip(item, 'hand');
        await sleep(300);
        const opened = new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), MENU_TIMEOUT_MS);
          bot.once('windowOpen', () => {
            clearTimeout(timer);
            resolve(true);
          });
        });
        bot.activateItem();
        await sleep(100);
        bot.deactivateItem();
        if (!(await opened) || this.bot !== bot) {
          this.log('error', 'Sunucu menüsü açılmadı.');
          return;
        }
      }

      // Menu icerigi pencereden hemen sonra gelir.
      let slot = -1;
      for (let i = 0; i < 20 && slot < 0 && bot.currentWindow; i += 1) {
        const w = bot.currentWindow;
        slot = w.slots.slice(0, w.inventoryStart).findIndex((s) => s && menuRe?.test(itemText(s)));
        if (slot < 0) await sleep(100);
      }
      if (slot < 0) {
        this.log('error', 'Menüde oyun sunucusu bulunamadı.');
        if (bot.currentWindow) bot.closeWindow(bot.currentWindow);
        return;
      }
      this.joinClicked = true;
      await Promise.race([bot.clickWindow(slot, 0, 0), sleep(3000)]);
    } catch (err) {
      this.log('error', `Sunucu menüsü kullanılamadı: ${err.message}`);
    }
  }

  runPostLogin() {
    const { postLoginCommands, postLoginDelayMs } = this.settings.auth;
    const lines = postLoginCommands.split('\n').map((l) => l.trim()).filter(Boolean);
    lines.forEach((line, i) => {
      this.later(() => this.sendChat(line), postLoginDelayMs * (i + 1));
    });
  }

  schedulePeriodic() {
    const { periodicCommands, periodicMinutes } = this.settings.behavior;
    const lines = periodicCommands.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length || periodicMinutes <= 0) return;
    const t = setInterval(() => lines.forEach((l) => this.sendChat(l)), periodicMinutes * 60000);
    this.timers.add(t);
  }

  // --- anti-AFK --------------------------------------------------------

  scheduleAntiAfk() {
    const cfg = this.settings.antiAfk;
    const min = Math.max(1, cfg.minSeconds);
    const max = Math.max(min, cfg.maxSeconds);
    const wait = (min + Math.random() * (max - min)) * 1000;
    this.later(() => {
      if (!this.bot || this.state !== 'online') return;
      if (this.settings.antiAfk.enabled && this.inPlay() && !this.holdStill()) this.antiAfkTick();
      this.scheduleAntiAfk();
    }, wait);
  }

  antiAfkTick() {
    const cfg = this.settings.antiAfk;
    const bot = this.bot;
    const actions = ['jump', 'sneak', 'swing', 'look', 'walk'].filter((a) => cfg[a]);
    if (!actions.length) return;
    const action = actions[Math.floor(Math.random() * actions.length)];
    this.log('debug', `Anti-AFK: ${action}`);
    this.lastPhysicalAction = Date.now();

    const hold = (control, ms, then) => {
      bot.setControlState(control, true);
      this.later(() => {
        if (this.bot !== bot) return;
        bot.setControlState(control, false);
        then?.();
      }, ms);
    };

    switch (action) {
      case 'jump':
        hold('jump', 300);
        break;
      case 'sneak':
        hold('sneak', 800);
        break;
      case 'swing':
        bot.swingArm();
        break;
      case 'look':
        bot.look(Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.8, true).catch(() => {});
        break;
      case 'walk':
        // Ileri-geri: hesap zamanla bulundugu yerden uzaklasmaz.
        hold('forward', 400, () => hold('back', 400));
        break;
      default:
    }
  }

  // --- saglik / yemek --------------------------------------------------

  onHealth(bot) {
    const cfg = this.settings.behavior;
    if (cfg.lowHealthDisconnect > 0 && bot.health > 0 && bot.health <= cfg.lowHealthDisconnect) {
      this.log('error', `Can ${Math.ceil(bot.health)} seviyesine düştü, bağlantı kesiliyor.`);
      this.stop('Düşük can nedeniyle kesildi');
      return;
    }
    if (cfg.autoEat && this.state === 'online' && bot.food <= cfg.eatThreshold) this.tryEat(bot);
  }

  async tryEat(bot) {
    if (this.eating) return;
    const foods = bot.registry.foodsByName;
    if (!foods) return;
    const food = bot.inventory.items().find((i) => foods[i.name]);
    if (!food) return;
    this.eating = true;
    try {
      await bot.equip(food, 'hand');
      await bot.consume();
      this.log('system', `${food.displayName} yendi.`);
    } catch (err) {
      this.log('debug', `Yemek yenemedi: ${err.message}`);
    } finally {
      this.eating = false;
    }
  }

  // --- baglanti kopmasi ------------------------------------------------

  onEnd(reason) {
    const wasStable = this.onlineSince && Date.now() - this.onlineSince > STABLE_ONLINE_MS;
    this.bot = null;
    this.onlineSince = 0;
    this.clearTimers();
    this.emit('inventory', null);
    this.log('system', `Bağlantı kapandı${reason ? `: ${reason}` : ''}.`);
    if (this.stopped) return;
    if (wasStable) this.attempts = 0;
    this.scheduleReconnect(this.lastKick || reason);
    this.lastKick = null;
  }

  scheduleReconnect(detail) {
    const cfg = this.settings.reconnect;
    if (this.noReconnect) {
      this.stopped = true;
      this.setState('error', this.noReconnect);
      return;
    }
    if (!cfg.enabled) {
      this.stopped = true;
      this.setState('idle', detail || 'Bağlantı kesildi');
      return;
    }
    if (cfg.maxAttempts > 0 && this.attempts >= cfg.maxAttempts) {
      this.stopped = true;
      this.setState('error', `${cfg.maxAttempts} denemeden sonra bağlanılamadı`);
      return;
    }
    this.attempts += 1;
    this.setState('waiting', `${cfg.delaySeconds} sn sonra tekrar denenecek`);
    this.log('system', `${cfg.delaySeconds} sn sonra yeniden bağlanılacak (deneme ${this.attempts}).`);
    this.later(() => {
      if (!this.stopped) this.connect();
    }, cfg.delaySeconds * 1000);
  }

  // --- durum yayini ----------------------------------------------------

  startStats(bot) {
    const send = () => {
      if (this.bot !== bot || !bot.entity) return;
      this.watchInventory(bot);
      this.updateLocation(bot);
      const p = bot.entity.position;
      this.emit('stats', {
        health: bot.health,
        food: bot.food,
        level: bot.experience?.level ?? 0,
        ping: bot.player?.ping ?? 0,
        position: { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) },
        dimension: String(bot.game?.dimension ?? '').replace('minecraft:', ''),
        gameMode: bot.game?.gameMode ?? '',
        players: Object.keys(bot.players ?? {}).length,
        version: bot.version,
        location: this.location,
        onlineSince: this.onlineSince,
      });
    };
    send();
    const t = setInterval(send, STATS_INTERVAL_MS);
    this.timers.add(t);
  }

  pushInventory() {
    if (this.inventoryTimer) return;
    this.inventoryTimer = setTimeout(() => {
      this.inventoryTimer = null;
      if (this.bot) this.emit('inventory', this.snapshotInventory());
    }, INVENTORY_THROTTLE_MS);
  }

  snapshotInventory() {
    const bot = this.bot;
    const slots = bot.inventory.slots.map((item, i) => serializeItem(item, i));
    let window = null;
    const w = bot.currentWindow;
    if (w) {
      window = {
        title: stripCodes(flatten(w.title)) || 'Menü',
        size: w.inventoryStart,
        slots: w.slots.slice(0, w.inventoryStart).map((item, i) => serializeItem(item, i)),
      };
    }
    return { slots, heldSlot: bot.quickBarSlot, window };
  }

  // --- kullanici komutlari ---------------------------------------------

  sendChat(text) {
    if (!this.bot) {
      this.log('error', 'Hesap bağlı değil, mesaj gönderilemedi.');
      return;
    }
    if (!this.inPlay()) {
      this.log('error', 'Sunucu değiştiriliyor, mesaj gönderilemedi.');
      return;
    }
    this.log('sent', text);
    this.bot.chat(text);
  }

  async inventoryAction({ action, slot }) {
    const bot = this.bot;
    if (!bot) return;
    try {
      switch (action) {
        case 'select':
          bot.setQuickBarSlot(slot);
          break;
        case 'toss': {
          const item = bot.inventory.slots[slot];
          if (item) await bot.tossStack(item);
          break;
        }
        case 'use':
          bot.activateItem();
          this.later(() => this.bot === bot && bot.deactivateItem(), 100);
          break;
        case 'click-window':
          if (bot.currentWindow) await bot.clickWindow(slot, 0, 0);
          break;
        case 'close-window':
          if (bot.currentWindow) bot.closeWindow(bot.currentWindow);
          break;
        default:
      }
    } catch (err) {
      this.log('error', `Envanter işlemi başarısız: ${err.message}`);
    }
    this.pushInventory();
  }
}

module.exports = { BotSession, flatten, stripCodes };
