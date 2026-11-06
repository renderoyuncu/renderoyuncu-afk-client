import { h } from './ui.js';
import { state, subscribe } from './state.js';

export function updateText(update) {
  switch (update.state) {
    case 'checking': return 'Güncelleme kontrol ediliyor.';
    case 'latest': return 'Uygulama güncel.';
    case 'downloading': return `Yeni sürüm v${update.version} indiriliyor: %${update.percent}`;
    case 'ready': return `Yeni sürüm v${update.version} hazır.`;
    case 'error': return `Güncelleme kontrol edilemedi: ${update.message}`;
    default: return 'Otomatik güncelleme yalnızca kurulu sürümde çalışır.';
  }
}

/** Indirilen surum icin geri sayim ve kurma / erteleme secenekleri. */
export function initUpdateBanner() {
  const banner = document.getElementById('update-banner');

  const render = () => {
    const { state: status, version, percent, installAt } = state.update;
    banner.hidden = status !== 'downloading' && status !== 'ready';
    if (banner.hidden) return;

    if (status === 'downloading') {
      banner.replaceChildren(h('span', {}, `Yeni sürüm v${version} indiriliyor: %${percent}`));
      return;
    }
    const seconds = installAt ? Math.max(0, Math.ceil((installAt - Date.now()) / 1000)) : null;
    banner.replaceChildren(
      h('span', {}, seconds === null
        ? `Yeni sürüm v${version} uygulama kapanınca kurulacak.`
        : `Yeni sürüm v${version} indirildi. ${seconds} sn sonra kurulup uygulama yeniden başlayacak.`),
      h('div', { class: 'update-actions' },
        h('button', { class: 'btn small primary', onclick: () => window.api.update.install() }, 'Şimdi kur'),
        seconds !== null && h('button', { class: 'btn small', onclick: () => window.api.update.postpone() }, 'Ertele')),
    );
  };

  render();
  subscribe((kind) => {
    if (kind === 'update') render();
  });
  setInterval(() => {
    if (state.update.state === 'ready' && state.update.installAt) render();
  }, 1000);
}
