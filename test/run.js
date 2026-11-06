'use strict';

// Kullanim: npm test            -> tum surumler + senaryolar
//           VIAPROXY_JAR=... npm test  -> ViaProxy koprusu dahil
const assert = require('assert');
const { spawn } = require('child_process');
const net = require('net');
const { BotSession } = require('../src/core/session');
const { DEFAULT_SETTINGS, VERSIONS, mergeSettings } = require('../src/core/defaults');
const { startMockServer } = require('./mock-server');
const { killTree } = require('../src/core/kill-tree');

const PASSWORD = 'Gizli-Sifre-123';
const EMAIL = 'testbot@renderoyuncu.net';
let nextPort = 26100;

function settings(patch = {}) {
  const s = mergeSettings(DEFAULT_SETTINGS, {});
  s.auth.delayMs = 50;
  s.auth.fallbackSeconds = 2;
  s.reconnect.delaySeconds = 1;
  s.antiAfk.minSeconds = 1;
  s.antiAfk.maxSeconds = 1;
  for (const [k, v] of Object.entries(patch)) Object.assign(s[k], v);
  return s;
}

function session(version, port, opts = {}) {
  const s = new BotSession({
    account: { id: 'a', username: 'TestBot', password: PASSWORD, registered: false, ...opts.account },
    settings: opts.settings ?? settings(),
    connection: { host: '127.0.0.1', port, version },
  });
  s.logs = [];
  s.on('log', (l) => s.logs.push(l));
  return s;
}

function until(check, ms = 12000, label = 'kosul') {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const t = setInterval(() => {
      const v = check();
      if (v) {
        clearInterval(t);
        resolve(v);
      } else if (Date.now() - started > ms) {
        clearInterval(t);
        reject(new Error(`zaman asimi: ${label}`));
      }
    }, 25);
  });
}

async function testRegisterFlow(version) {
  const port = nextPort++;
  const server = startMockServer({ version, port, password: PASSWORD });
  const s = session(version, port);
  let registered = false;
  let inventory = null;
  s.on('registered', () => { registered = true; });
  s.on('inventory', (i) => { if (i) inventory = i; });
  s.start();
  try {
    await until(() => s.state === 'online', 12000, 'online');
    assert.ok(registered, 'kayit isaretlenmedi');
    assert.strictEqual(server.state.commands[0], `register ${PASSWORD} ${EMAIL}`);
    await until(() => inventory?.slots[37], 5000, 'envanter');
    assert.strictEqual(inventory.slots[36].name, 'diamond_sword');
    assert.strictEqual(inventory.slots[37].count, 12);
    assert.strictEqual(inventory.slots[9].count, 64);
    assert.ok(!s.logs.some((l) => l.text.includes(PASSWORD)), 'sifre loga sizdi');
    s.sendChat('selam');
    await until(() => server.state.chats.includes('selam'), 3000, 'sohbet');
  } finally {
    s.stop();
    await server.close();
  }
}

async function testLoginAndReconnect() {
  const version = '1.21.8';
  const port = nextPort++;
  const server = startMockServer({ version, port, password: PASSWORD, registered: true });
  const s = session(version, port, { account: { registered: true } });
  s.start();
  try {
    await until(() => s.state === 'online', 12000, 'online');
    assert.strictEqual(server.state.commands[0], `login ${PASSWORD}`);
    server.kickAll('Sunucu yeniden baslatiliyor');
    await until(() => s.state === 'waiting', 5000, 'yeniden baglanma bekleniyor');
    await until(() => s.state === 'online', 12000, 'yeniden online');
    assert.strictEqual(server.state.commands.filter((c) => c.startsWith('login')).length, 2);
  } finally {
    s.stop();
    await server.close();
  }
}

async function testWrongPassword() {
  const version = '1.21.8';
  const port = nextPort++;
  const server = startMockServer({ version, port, password: 'baska-sifre', registered: true });
  const s = session(version, port, { account: { registered: true } });
  s.start();
  try {
    await until(() => s.state === 'error', 12000, 'hata durumu');
    await new Promise((r) => setTimeout(r, 1500));
    assert.strictEqual(s.state, 'error', 'yanlis sifrede yeniden baglanmamali');
    assert.strictEqual(server.state.commands.length, 1, 'sifre tekrar denenmemeli');
  } finally {
    s.stop();
    await server.close();
  }
}

async function testBanStopsReconnect() {
  const version = '1.21.8';
  const port = nextPort++;
  const server = startMockServer({ version, port, password: PASSWORD, registered: true });
  const s = session(version, port, { account: { registered: true } });
  s.start();
  try {
    await until(() => s.state === 'online', 12000, 'online');
    server.kickAll('Sunucudan yasaklandin');
    await until(() => s.state === 'error', 5000, 'ban durumu');
  } finally {
    s.stop();
    await server.close();
  }
}

async function testAntiAfk() {
  const version = '1.21.8';
  const port = nextPort++;
  const server = startMockServer({ version, port, password: PASSWORD });
  const s = session(version, port);
  s.start();
  try {
    await until(() => s.state === 'online', 12000, 'online');
    await until(() => s.logs.some((l) => l.text.startsWith('Anti-AFK')), 4000, 'anti-afk');
  } finally {
    s.stop();
    await server.close();
  }
}

/** Gercek sunucudaki gibi: giris limboda, sonra Lobi'ye aktarim. */
async function testLimboTransfer(version) {
  const port = nextPort++;
  const server = startMockServer({
    version, port, password: PASSWORD, registered: true, limbo: true,
  });
  const s = session(version, port, { account: { registered: true } });
  let inventory = null;
  s.on('inventory', (i) => { if (i) inventory = i; });
  s.start();
  try {
    await until(() => s.state === 'online', 12000, 'lobide online');
    assert.ok(server.state.inLobby, 'lobiye gecmedi');
    assert.strictEqual(server.state.knownPacks, 1, 'select_known_packs tek gitmeli');
    assert.strictEqual(server.state.packReplies, 2, 'kaynak paketine kabul + yuklendi gitmeli');
    assert.strictEqual(server.state.commands.filter((c) => c.startsWith('login')).length, 1, 'tek giris olmali');
    await until(() => inventory?.slots[37], 5000, 'lobide envanter');
    await new Promise((r) => setTimeout(r, 1500));
    assert.strictEqual(s.state, 'online', 'lobide kalmali');
  } finally {
    s.stop();
    await server.close();
  }
}

/** Oyun Modlari: secim yokken Lobi'de kalir; secilince gecer, AFK komutunu verir, olunce tekrarlar. */
async function testGameModeAndAfk() {
  const version = '1.21.8';
  const port = nextPort++;
  const server = startMockServer({
    version, port, password: PASSWORD, registered: true, hub: true,
  });
  const s = session(version, port, { account: { registered: true } });
  let stats = null;
  s.on('stats', (x) => { stats = x; });
  s.start();
  try {
    await until(() => s.state === 'online' && stats?.location === 'lobby', 12000, 'lobide online');
    await new Promise((r) => setTimeout(r, 4000));
    assert.ok(!server.state.inSurvival, 'secim yokken Survival\'a gecmemeli');

    s.setModes({ gameMode: 'survival' });
    await until(() => server.state.inSurvival, 8000, 'survivala gecis');
    await until(() => stats?.location === 'survival', 6000, 'konum survival');

    // AFK yeri secilmeden kimildamaz ve komut gondermez.
    const before = s.logs.filter((l) => l.text.startsWith('Anti-AFK')).length;
    await new Promise((r) => setTimeout(r, 3500));
    assert.strictEqual(s.logs.filter((l) => l.text.startsWith('Anti-AFK')).length, before, 'secim yokken hareket etmemeli');
    assert.ok(!server.state.commands.some((c) => c.includes('afk')), 'secim yokken AFK komutu gitmemeli');

    s.setModes({ afkMode: 'player' });
    await until(() => server.state.commands.includes('oyuncuafk'), 3000, '/oyuncuafk');
    await until(() => s.logs.filter((l) => l.text.startsWith('Anti-AFK')).length > before, 4000, 'secim sonrasi anti-afk');

    server.killAll();
    await until(() => server.state.respawns === 1, 5000, 'yeniden dogma');
    await until(() => server.state.commands.filter((c) => c === 'oyuncuafk').length === 2, 7000, 'olumden sonra /oyuncuafk');

    s.setModes({ afkMode: 'vip' });
    await until(() => server.state.commands.includes('vipafk'), 3000, '/vipafk');
    assert.strictEqual(s.state, 'online');
  } finally {
    s.stop();
    await server.close();
  }
}

function waitPort(port, ms = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const c = net.connect(port, '127.0.0.1');
      c.once('connect', () => { c.destroy(); resolve(); });
      c.once('error', () => {
        if (Date.now() - started > ms) reject(new Error('ViaProxy acilmadi'));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

async function testBridge(jar) {
  const serverVersion = '1.21.8';
  const clientVersion = '1.21.11';
  const port = nextPort++;
  const bindPort = nextPort++;
  const server = startMockServer({ version: serverVersion, port, password: PASSWORD });
  const proxy = spawn('java', [
    '-jar', jar, 'cli',
    '--bind-address', `127.0.0.1:${bindPort}`,
    '--target-address', `127.0.0.1:${port}`,
    '--target-version', serverVersion,
    '--auth-method', 'NONE',
  ], { cwd: require('path').dirname(jar), stdio: 'ignore' });
  const s = session(clientVersion, bindPort);
  try {
    await waitPort(bindPort);
    s.start();
    await until(() => s.state === 'online', 25000, 'kopru uzerinden online');
    assert.strictEqual(server.state.commands[0], `register ${PASSWORD} ${EMAIL}`);
  } finally {
    s.stop();
    killTree(proxy.pid);
    await server.close();
  }
}

async function main() {
  const tests = [
    ...VERSIONS.map((v) => [`kayit+envanter+sohbet ${v}`, () => testRegisterFlow(v)]),
    ...VERSIONS.map((v) => [`limbodan lobiye gecis ${v}`, () => testLimboTransfer(v)]),
    ['oyun modu + AFK + olum', testGameModeAndAfk],
    ['giris + yeniden baglanma', testLoginAndReconnect],
    ['yanlis sifre', testWrongPassword],
    ['ban sonrasi durma', testBanStopsReconnect],
    ['anti-afk', testAntiAfk],
  ];
  if (process.env.VIAPROXY_JAR) tests.push(['ViaProxy koprusu', () => testBridge(process.env.VIAPROXY_JAR)]);

  let failed = 0;
  for (const [name, fn] of tests) {
    const started = Date.now();
    try {
      await fn();
      console.log(`GECTI  ${name} (${Date.now() - started} ms)`);
    } catch (err) {
      failed += 1;
      console.log(`KALDI  ${name}: ${err.message}`);
    }
  }
  console.log(failed ? `\n${failed}/${tests.length} test kaldi` : `\n${tests.length} testin hepsi gecti`);
  process.exit(failed ? 1 : 0);
}

main();
