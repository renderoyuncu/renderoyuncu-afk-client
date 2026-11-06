'use strict';

// minecraft-assets 135 MB; uygulamaya yalnizca ihtiyac duyulan ikonlari tek dosya olarak aliyoruz.
// Kullanim: node scripts/build-icons.js
const fs = require('fs');
const path = require('path');
const assets = require('minecraft-assets');

const VERSIONS = ['26.1', '1.21.8'];
const icons = {};
for (const version of VERSIONS) {
  for (const entry of assets(version).textureContentArray) {
    if (entry.texture && !icons[entry.name]) icons[entry.name] = entry.texture;
  }
}

const out = path.join(__dirname, '..', 'src', 'main', 'item-icons.json');
fs.writeFileSync(out, JSON.stringify(icons));
console.log(`${Object.keys(icons).length} ikon -> ${out} (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);
