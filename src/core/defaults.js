'use strict';

const MAX_ACCOUNTS = 3;

/** Botlar yalnizca bu sunucuya baglanir; adres bilerek ayarlarda yer almaz. */
const SERVER = { host: 'play.renderoyuncu.net', port: 25565 };

// Sunucuya ozel sabitler: ayarlardan degistirilemez.
const REGISTER_COMMAND = '/register {password} {email}';
const EMAIL_TEMPLATE = '{username}@renderoyuncu.net';

/** Lobi'deki pusula menusunden girilen oyun modlari. */
const LOBBY_ITEM_PATTERN = 'Oyun Menüsü';
const GAME_MODES = {
  survival: { name: 'Survival Gard', versions: '1.21.4 - 1.21.11', menuPattern: 'survival' },
};

const AFK_COMMANDS = { vip: '/vipafk', player: '/oyuncuafk' };

/** Guncellemelerin indirildigi GitHub deposu. */
const UPDATE_FEED = { provider: 'github', owner: 'renderoyuncu', repo: 'renderoyuncu-afk-client' };
const UPDATE_CHECK_MINUTES = 60;
const UPDATE_INSTALL_SECONDS = 60;

const AUTO_MESSAGE_MINUTES = 20;
const AUTO_MESSAGE_MAX_LENGTH = 256;

/** mineflayer'in dogrudan bagilanabildigi surumler. Daha yenileri ViaProxy koprusu ile calisir. */
const VERSIONS = [
  '1.21', '1.21.1', '1.21.2', '1.21.3', '1.21.4', '1.21.5', '1.21.6',
  '1.21.7', '1.21.8', '1.21.9', '1.21.10', '1.21.11', '26.1',
];

const DEFAULT_SETTINGS = {
  server: {
    // Sunucu Velocity arkasinda ve ping'e istemcinin protokolunu yansitiyor,
    // bu yuzden "auto" yerine launcher ile ayni surum varsayilan.
    version: '1.21.8',
    connectTimeout: 30,
  },
  bridge: {
    enabled: false,
    targetVersion: '',
    clientVersion: '1.21.11',
    port: 25599,
  },
  auth: {
    autoRegister: true,
    autoLogin: true,
    loginCommand: '/login {password}',
    delayMs: 1500,
    fallbackSeconds: 6,
    maxAttempts: 3,
    registerPattern: '/register|/kay[ıi]t|/reg\\b',
    loginPattern: '/login|/giri[şs]|/l\\b',
    successPattern: 'ba[şs]ar[ıi]|success|giri[şs] yap[ıi]ld[ıi]|logged in|kay[ıi]t oldun|registered',
    alreadyPattern: 'zaten kay[ıi]tl[ıi]|already registered',
    wrongPattern: 'yanl[ıi][şs]|hatal[ıi]|wrong|incorrect',
    postLoginCommands: '',
    postLoginDelayMs: 2000,
  },
  reconnect: {
    enabled: true,
    delaySeconds: 15,
    maxAttempts: 0,
    staggerSeconds: 5,
    stopKeywords: 'ban|yasak|whitelist',
  },
  antiAfk: {
    enabled: true,
    minSeconds: 20,
    maxSeconds: 60,
    jump: true,
    sneak: true,
    swing: true,
    look: true,
    walk: false,
  },
  behavior: {
    autoEat: true,
    eatThreshold: 14,
    lowHealthDisconnect: 0,
    acceptResourcePack: true,
    physics: true,
    viewDistance: 'tiny',
    periodicCommands: '',
    periodicMinutes: 10,
  },
  console: {
    maxLines: 1000,
    timestamps: true,
    colors: true,
    showActionBar: false,
    showDebug: false,
  },
  app: {
    autoStartBots: true,
    launchOnBoot: false,
    closeToTray: true,
    startMinimized: false,
    notifications: true,
    confirmQuit: true,
  },
};

function isObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/** Kayitli ayarlari varsayilanlarin ustune yazar; bilinmeyen anahtarlari atar. */
function mergeSettings(base, patch) {
  const out = {};
  for (const key of Object.keys(base)) {
    const b = base[key];
    const p = patch ? patch[key] : undefined;
    if (isObject(b)) out[key] = mergeSettings(b, isObject(p) ? p : {});
    else out[key] = p === undefined || typeof p !== typeof b ? b : p;
  }
  return out;
}

module.exports = {
  MAX_ACCOUNTS,
  SERVER,
  REGISTER_COMMAND,
  EMAIL_TEMPLATE,
  LOBBY_ITEM_PATTERN,
  GAME_MODES,
  AFK_COMMANDS,
  UPDATE_FEED,
  UPDATE_CHECK_MINUTES,
  UPDATE_INSTALL_SECONDS,
  AUTO_MESSAGE_MINUTES,
  AUTO_MESSAGE_MAX_LENGTH,
  VERSIONS,
  DEFAULT_SETTINGS,
  mergeSettings,
};
