import { h } from '../ui.js';
import { state, subscribe } from '../state.js';
import { updateText } from '../update-banner.js';

const LINKS = [
  { title: 'Discord', text: 'Toplulukla konuş ve duyuruları takip et.', url: 'https://discord.gg/WyTZBmKgKw' },
  { title: 'Destek talebi', text: 'Sitedeki destek sistemi üzerinden yardım al.', url: 'https://renderoyuncu.net/support/tickets' },
  { title: 'Web sitesi', text: 'Haberler, mağaza ve hesap işlemleri.', url: 'https://renderoyuncu.net/' },
];

export function supportPage(root) {
  const updateStatus = h('span');
  const checkBtn = h('button', { class: 'btn small', onclick: () => window.api.update.check() }, 'Güncellemeleri kontrol et');

  const refresh = () => {
    updateStatus.textContent = updateText(state.update);
    checkBtn.hidden = state.update.state === 'disabled';
  };

  root.append(
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Destek'), h('p', {}, 'Bir sorun mu var? Buradan ulaşabilirsin.'))),
    h('div', { class: 'support-grid' }, LINKS.map((link) => h('button', {
      class: 'support-card',
      onclick: () => window.api.openExternal(link.url),
    }, h('h3', {}, link.title), h('p', {}, link.text)))),
    h('div', { class: 'setting', style: 'margin-top:18px' },
      h('div', { class: 'setting-label' },
        h('b', {}, `RenderOyuncu AFK Client v${state.appVersion}`),
        updateStatus),
      checkBtn),
  );

  refresh();
  return subscribe((kind) => {
    if (kind === 'update') refresh();
  });
}
