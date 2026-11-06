import { h } from '../ui.js';
import { bot, state } from '../state.js';

/** Konsol ve Envanter sayfalarindaki hesap sekmeleri. */
export function accountTabs(activeId, onSelect) {
  return h('div', { class: 'tabs' }, state.accounts.map((a) => h('button', {
    class: `tab${a.id === activeId ? ' active' : ''}`,
    onclick: () => onSelect(a.id),
  }, h('i', { class: `dot ${bot(a.id).state}` }), a.username)));
}

export function noAccounts(nav) {
  return h('div', { class: 'empty' },
    h('img', { src: 'assets/logo.png', alt: '' }),
    h('h3', {}, 'Henüz hesap yok'),
    h('p', {}, `En fazla ${state.maxAccounts} AFK hesap ekleyebilirsin.`),
    h('button', { class: 'btn primary', onclick: () => nav.navigate('accounts') }, 'Hesaplara git'));
}

/** Son secilen sekmeyi sayfa degisiminde korumak icin. */
export function resolveAccount(requested, remembered) {
  const ids = state.accounts.map((a) => a.id);
  if (ids.includes(requested)) return requested;
  if (ids.includes(remembered)) return remembered;
  if (ids.includes(state.selected)) return state.selected;
  return ids[0] ?? null;
}
