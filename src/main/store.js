'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');
const {
  MAX_ACCOUNTS, DEFAULT_SETTINGS, GAME_MODES, AFK_COMMANDS, AUTO_MESSAGE_MAX_LENGTH, mergeSettings,
} = require('../core/defaults');

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const AFK_NAME_RE = /afk[123]$/i;
const EMAIL_RE =/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

/** Bos e-posta gecerlidir: kayitta otomatik adres kullanilir. */
function cleanEmail(value) {
  const email = String(value ?? '').trim();
  if (email && !EMAIL_RE.test(email)) throw new Error('Geçerli bir e-posta yaz ya da boş bırak.');
  return email;
}

function generatePassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 14; i += 1) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

function encrypt(password) {
  if (safeStorage.isEncryptionAvailable()) {
    return { enc: true, value: safeStorage.encryptString(password).toString('base64') };
  }
  return { enc: false, value: password };
}

function decrypt(secret) {
  if (!secret) return '';
  return secret.enc ? safeStorage.decryptString(Buffer.from(secret.value, 'base64')) : secret.value;
}

class Store {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'config.json');
    this.data = {
      settings: mergeSettings(DEFAULT_SETTINGS, {}),
      accounts: [],
      selected: null,
      // Tek kayit: ayni anda yalnizca bir hesap otomatik mesaj yazabilir.
      autoMessage: { accountId: null, text: '', enabled: false },
    };
    this.load();
  }

  load() {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      this.loadError = err.code ?? err.message;
      if (err.code !== 'ENOENT') {
        // Bozuk dosyanin ustune yazmadan once sakla: hesaplar elle kurtarilabilsin.
        fs.copyFileSync(this.file, `${this.file}.bozuk-${Date.now()}`);
      }
      return;
    }
    this.data.settings = mergeSettings(DEFAULT_SETTINGS, raw.settings);
    this.data.autoMessage = { ...this.data.autoMessage, ...raw.autoMessage };
    this.data.accounts = Array.isArray(raw.accounts) ? raw.accounts.slice(0, MAX_ACCOUNTS) : [];
    this.data.selected = raw.selected ?? this.data.accounts[0]?.id ?? null;
  }

  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  get settings() {
    return this.data.settings;
  }

  updateSettings(patch) {
    this.data.settings = mergeSettings(DEFAULT_SETTINGS, patch);
    this.save();
    return this.data.settings;
  }

  resetSettings() {
    return this.updateSettings({});
  }

  /** Arayuze giden hesap bilgisi: sifre asla dahil edilmez. */
  publicAccounts() {
    return this.data.accounts.map(({ secret, ...rest }) => rest);
  }

  find(id) {
    return this.data.accounts.find((a) => a.id === id);
  }

  password(id) {
    return decrypt(this.find(id)?.secret);
  }

  addAccount({ username, password, email }) {
    const name = String(username ?? '').trim();
    if (this.data.accounts.length >= MAX_ACCOUNTS) {
      throw new Error(`En fazla ${MAX_ACCOUNTS} hesap eklenebilir.`);
    }
    if (!USERNAME_RE.test(name)) {
      throw new Error('Kullanıcı adı 3-16 karakter olmalı; yalnızca harf, rakam ve _ kullanılabilir.');
    }
    if (!AFK_NAME_RE.test(name)) {
      throw new Error('Kullanıcı adının sonu afk1, afk2 veya afk3 olmalı. Örnek: Oyuncuafk1');
    }
    if (this.data.accounts.some((a) => a.username.toLowerCase() === name.toLowerCase())) {
      throw new Error('Bu kullanıcı adı zaten ekli.');
    }
    const pw = password || generatePassword();
    if (pw.length < MIN_PASSWORD) throw new Error(`Şifre en az ${MIN_PASSWORD} karakter olmalı.`);
    if (/\s/.test(pw)) throw new Error('Şifre boşluk içeremez.');

    const account = {
      id: crypto.randomUUID(),
      username: name,
      email: cleanEmail(email),
      secret: encrypt(pw),
      registered: false,
      autoStart: true,
      createdAt: Date.now(),
    };
    this.data.accounts.push(account);
    this.data.selected ??= account.id;
    this.save();
    return account.id;
  }

  setAutoMessage({ accountId, text, enabled }) {
    const message = String(text ?? '').trim().slice(0, AUTO_MESSAGE_MAX_LENGTH);
    if (enabled && !this.find(accountId)) throw new Error('Otomatik mesaj için bir hesap seç.');
    if (enabled && !message) throw new Error('Otomatik mesaj boş olamaz.');
    this.data.autoMessage = { accountId: accountId ?? null, text: message, enabled: Boolean(enabled) };
    this.save();
    return this.data.autoMessage;
  }

  updateAccount(id, {
    password, email, registered, autoStart, gameMode, afkMode,
  }) {
    const account = this.find(id);
    if (!account) throw new Error('Hesap bulunamadı.');
    if (gameMode !== undefined) {
      if (gameMode !== null && !GAME_MODES[gameMode]) throw new Error('Bilinmeyen oyun modu.');
      account.gameMode = gameMode;
    }
    if (afkMode !== undefined) {
      if (afkMode !== null && !AFK_COMMANDS[afkMode]) throw new Error('Bilinmeyen AFK modu.');
      account.afkMode = afkMode;
    }
    if (email !== undefined) account.email = cleanEmail(email);
    if (password !== undefined) {
      if (password.length < MIN_PASSWORD) throw new Error(`Şifre en az ${MIN_PASSWORD} karakter olmalı.`);
      if (/\s/.test(password)) throw new Error('Şifre boşluk içeremez.');
      account.secret = encrypt(password);
    }
    if (registered !== undefined) account.registered = Boolean(registered);
    if (autoStart !== undefined) account.autoStart = Boolean(autoStart);
    this.save();
  }

  removeAccount(id) {
    this.data.accounts = this.data.accounts.filter((a) => a.id !== id);
    if (this.data.selected === id) this.data.selected = this.data.accounts[0]?.id ?? null;
    if (this.data.autoMessage.accountId === id) {
      this.data.autoMessage = { ...this.data.autoMessage, accountId: null, enabled: false };
    }
    this.save();
  }

  select(id) {
    if (!this.find(id)) return;
    this.data.selected = id;
    this.save();
  }
}

module.exports = { Store };
