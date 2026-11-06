import {
  ICONS, avatar, h, statusTag, toast,
} from './ui.js';
import { bot, notify, state, subscribe } from './state.js';

/** Sagdaki Sohbet paneli: hesaplar ve tek hesapla sabit aralikli otomatik mesaj. */
export function initChatPanel() {
  const toggleBtn = document.getElementById('chat-toggle');
  const panel = document.getElementById('chat-panel');

  toggleBtn.innerHTML = ICONS.chat; // yalnizca kod icindeki sabit SVG
  toggleBtn.append(h('span', {}, 'Sohbet'));

  let chosen = state.autoMessage.accountId;
  const list = h('div', { class: 'chat-accounts', role: 'radiogroup', 'aria-label': 'Otomatik mesaj yazacak hesap' });
  const input = h('textarea', {
    placeholder: 'Otomatik gönderilecek mesajı yaz',
    maxLength: state.autoMessageMaxLength,
    value: state.autoMessage.text,
    spellcheck: false,
    'aria-label': 'Otomatik mesaj',
  });
  const action = h('button', { class: 'btn primary' });
  const status = h('p', { class: 'chat-status' });

  const save = async (enabled) => {
    try {
      state.autoMessage = await window.api.autoMessage.set({ accountId: chosen, text: input.value, enabled });
      notify('autoMessage');
    } catch (err) {
      toast(err.message.replace(/^.*Error: /, ''), 'error');
    }
  };

  action.addEventListener('click', () => save(!state.autoMessage.enabled));

  const render = () => {
    const { enabled, nextAt } = state.autoMessage;
    if (enabled) chosen = state.autoMessage.accountId;
    if (!state.accounts.some((a) => a.id === chosen)) chosen = null;

    list.replaceChildren(...state.accounts.map((a) => {
      const row = h('button', {
        class: `chat-account${a.id === chosen ? ' active' : ''}`,
        role: 'radio',
        disabled: enabled,
        onclick: () => {
          chosen = a.id;
          render();
        },
      }, avatar(a.username), h('div', {}, h('b', {}, a.username), statusTag(bot(a.id).state)));
      row.setAttribute('aria-checked', String(a.id === chosen));
      return row;
    }));
    if (!state.accounts.length) list.append(h('p', { class: 'chat-status' }, 'Henüz hesap yok.'));

    input.disabled = enabled;
    action.textContent = enabled ? 'Otomatik mesajı durdur' : 'Otomatik mesajı başlat';
    action.className = enabled ? 'btn' : 'btn primary';
    const account = state.accounts.find((a) => a.id === chosen);
    if (enabled && nextAt) {
      const time = new Date(nextAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      status.textContent = `${account?.username} yazıyor. Sonraki mesaj: ${time}`;
    } else {
      status.textContent = 'Aynı anda yalnızca 1 hesap otomatik mesaj yazabilir.';
    }
  };

  panel.append(
    h('h2', {}, 'Sohbet'),
    h('div', { class: 'inv-title' }, 'HESAPLAR'),
    list,
    h('div', { class: 'inv-title' }, 'OTOMATİK MESAJ'),
    h('p', { class: 'chat-status' }, `Seçili hesap ${state.autoMessageMinutes} dakikada bir yazar. Bu süre sabittir.`),
    input,
    action,
    status,
  );

  toggleBtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggleBtn.classList.toggle('active', !panel.hidden);
    toggleBtn.setAttribute('aria-expanded', String(!panel.hidden));
  });

  render();
  subscribe((kind) => {
    if (kind === 'accounts' || kind === 'autoMessage' || kind === 'bot') render();
  });
}
