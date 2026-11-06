'use strict';

const { spawnSync } = require('child_process');

/**
 * Oracle'in javapath\java.exe kisayolu gercek JVM'i alt surec olarak baslatir;
 * process.kill yalnizca kisayolu kapatir ve JVM acik kalir. Bu yuzden agacin tamami kapatilir.
 */
function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try {
      process.kill(pid);
    } catch {
      // zaten kapanmis
    }
  }
}

module.exports = { killTree };
