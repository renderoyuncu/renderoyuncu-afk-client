'use strict';

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { app, net: electronNet } = require('electron');
const { killTree } = require('../core/kill-tree');

const MIN_JAVA = 17;
const START_TIMEOUT_MS = 40000;

/** ViaProxy, mineflayer'in dogrudan konusamadigi surumlere Java ile ceviri yapar. */
class Bridge {
  constructor() {
    this.dir = path.join(app.getPath('userData'), 'bridge');
    this.jar = path.join(this.dir, 'ViaProxy.jar');
    this.proc = null;
    this.signature = null;
  }

  detectJava() {
    return new Promise((resolve) => {
      execFile('java', ['-version'], { windowsHide: true, timeout: 10000 }, (err, stdout, stderr) => {
        if (err) {
          resolve({ found: false, version: null, major: 0, ok: false });
          return;
        }
        const match = `${stderr}${stdout}`.match(/version "([^"]+)"/);
        const version = match?.[1] ?? 'bilinmiyor';
        const major = parseInt(version, 10) || 0;
        resolve({ found: true, version, major, ok: major >= MIN_JAVA });
      });
    });
  }

  async status() {
    return {
      jarInstalled: fs.existsSync(this.jar),
      running: Boolean(this.proc),
      java: await this.detectJava(),
    };
  }

  async download(onProgress) {
    const api = await electronNet.fetch('https://api.github.com/repos/ViaVersion/ViaProxy/releases/latest', {
      headers: { 'User-Agent': 'RenderOyuncu-AFK-Client' },
    });
    if (!api.ok) throw new Error(`GitHub yanıtı: ${api.status}`);
    const release = await api.json();
    const asset = release.assets.find((a) => /^ViaProxy-[\d.]+\.jar$/.test(a.name));
    if (!asset) throw new Error('ViaProxy dosyası bulunamadı.');

    const response = await electronNet.fetch(asset.browser_download_url);
    if (!response.ok) throw new Error(`İndirme yanıtı: ${response.status}`);

    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.jar}.part`;
    const file = fs.createWriteStream(tmp);
    let received = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (!file.write(value)) await new Promise((r) => file.once('drain', r));
      onProgress?.(received / asset.size);
    }
    await new Promise((resolve, reject) => {
      file.on('error', reject);
      file.end(resolve);
    });
    if (received !== asset.size) {
      fs.rmSync(tmp, { force: true });
      throw new Error('İndirme yarım kaldı.');
    }
    fs.renameSync(tmp, this.jar);
    return release.tag_name;
  }

  /** Kopruyu acar; ayni hedefe zaten aciksa yeniden baslatmaz. */
  async ensure({ host, port, targetVersion, bindPort }) {
    const signature = JSON.stringify({ host, port, targetVersion, bindPort });
    if (this.proc && this.signature === signature) return;
    this.stop();
    if (!fs.existsSync(this.jar)) throw new Error('Sürüm köprüsü indirilmemiş. Ayarlar > Sürüm Köprüsü bölümünden indir.');

    const java = await this.detectJava();
    if (!java.ok) throw new Error(`Java ${MIN_JAVA}+ bulunamadı.`);

    const args = [
      '-jar', this.jar, 'cli',
      '--bind-address', `127.0.0.1:${bindPort}`,
      '--target-address', `${host}:${port}`,
      '--auth-method', 'NONE',
    ];
    if (targetVersion) args.push('--target-version', targetVersion);

    const proc = spawn('java', args, { cwd: this.dir, stdio: 'ignore', windowsHide: true });
    this.proc = proc;
    this.signature = signature;
    proc.once('exit', () => {
      if (this.proc === proc) {
        this.proc = null;
        this.signature = null;
      }
    });
    await this.waitForPort(bindPort, proc);
  }

  waitForPort(port, proc) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const attempt = () => {
        if (this.proc !== proc) {
          reject(new Error('Sürüm köprüsü kapandı. Hedef sürümü kontrol et.'));
          return;
        }
        const socket = net.connect(port, '127.0.0.1');
        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.once('error', () => {
          if (Date.now() - started > START_TIMEOUT_MS) {
            this.stop();
            reject(new Error('Sürüm köprüsü zamanında açılmadı.'));
          } else {
            setTimeout(attempt, 400);
          }
        });
      };
      attempt();
    });
  }

  stop() {
    const proc = this.proc;
    this.proc = null;
    this.signature = null;
    if (proc) killTree(proc.pid);
  }
}

module.exports = { Bridge };
