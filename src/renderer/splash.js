'use strict';

window.splash.onProgress((percent, text) => {
  document.getElementById('fill').style.width = `${percent}%`;
  document.getElementById('percent').textContent = `${percent}%`;
  document.getElementById('text').textContent = text;
});
