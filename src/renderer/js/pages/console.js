import { h, renderMinecraftText, toast } from '../ui.js';
import {
  bot, isActive, state, subscribe,
} from '../state.js';
import { accountTabs, noAccounts, resolveAccount } from './shared.js';

const FILTERS = [
  { id: 'all', label: 'Tümü', kinds: null },
  { id: 'chat', label: 'Sohbet', kinds: ['chat', 'server', 'sent', 'actionbar'] },
  { id: 'system', label: 'Sistem', kinds: ['system', 'debug'] },
  { id: 'error', label: 'Hatalar', kinds: ['error'] },
];

let rememberedAccount = null;
let rememberedFilter = 'all';
const histories = new Map();

function time(ts) {
  return new Date(ts).toLocaleTimeString('tr-TR');
}

export function consolePage(root, nav) {
  let accountId = resolveAccount(nav.account, rememberedAccount);
  let unsubscribeLog = null;
  let entries = [];
  let historyIndex = -1;

  const tabsSlot = h('div');
  const log = h('div', { class: 'console-log' });
  const input = h('input', { type: 'text', placeholder: 'Mesaj veya /komut yaz', spellcheck: false, maxLength: 256 });
  const sendBtn = h('button', { class: 'btn primary' }, 'Gönder');
  const filterBar = h('div', { class: 'console-filters' });

  const visible = (entry) => {
    const cfg = state.settings.console;
    if (entry.kind === 'debug' && !cfg.showDebug) return false;
    const filter = FILTERS.find((f) => f.id === rememberedFilter);
    return !filter.kinds || filter.kinds.includes(entry.kind);
  };

  const lineEl = (entry) => h('div', { class: `log-line ${entry.kind}` },
    h('time', {}, time(entry.ts)),
    renderMinecraftText(entry.text, state.settings.console.colors));

  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 40;

  const renderAll = () => {
    log.replaceChildren(...entries.filter(visible).map(lineEl));
    log.scrollTop = log.scrollHeight;
  };

  const renderFilters = () => {
    filterBar.replaceChildren(...FILTERS.map((f) => h('button', {
      class: `tab${f.id === rememberedFilter ? ' active' : ''}`,
      onclick: () => {
        rememberedFilter = f.id;
        renderFilters();
        renderAll();
      },
    }, f.label)));
  };

  const renderTabs = () => {
    tabsSlot.replaceChildren(accountTabs(accountId, selectAccount));
    const connected = accountId && isActive(accountId) && bot(accountId).state !== 'waiting';
    input.disabled = !connected;
    sendBtn.disabled = !connected;
    input.placeholder = connected ? 'Mesaj veya /komut yaz' : 'Komut göndermek için hesabı başlat';
  };

  async function selectAccount(id) {
    accountId = id;
    rememberedAccount = id;
    historyIndex = -1;
    renderTabs();
    entries = await window.api.bots.logs(id);
    if (accountId === id) renderAll();
  }

  const send = () => {
    const text = input.value.trim();
    if (!text || !accountId) return;
    const history = histories.get(accountId) ?? [];
    history.unshift(text);
    histories.set(accountId, history.slice(0, 50));
    historyIndex = -1;
    window.api.bots.chat(accountId, text);
    input.value = '';
  };

  input.addEventListener('keydown', (e) => {
    const history = histories.get(accountId) ?? [];
    if (e.key === 'Enter') send();
    else if (e.key === 'ArrowUp' && historyIndex < history.length - 1) {
      historyIndex += 1;
      input.value = history[historyIndex];
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      historyIndex = Math.max(-1, historyIndex - 1);
      input.value = historyIndex < 0 ? '' : history[historyIndex];
      e.preventDefault();
    }
  });
  sendBtn.addEventListener('click', send);

  if (!accountId) {
    root.append(h('div', { class: 'fill-page' }, noAccounts(nav)));
    return subscribe((kind) => {
      if (kind === 'accounts' && state.accounts.length) nav.navigate('console');
    });
  }

  log.classList.toggle('hide-time', !state.settings.console.timestamps);

  root.append(h('div', { class: 'fill-page' },
    h('div', { class: 'page-head', style: 'margin-bottom:12px' },
      h('div', {}, h('h1', {}, 'Oyun Konsolu'), h('p', {}, 'Her hesabın kendi konsolu vardır.'))),
    tabsSlot,
    h('div', { class: 'console-toolbar' },
      filterBar,
      h('div', { class: 'console-tools' },
        h('button', {
          class: 'btn small',
          onclick: async () => {
            await navigator.clipboard.writeText(log.innerText);
            toast('Konsol kopyalandı.');
          },
        }, 'Kopyala'),
        h('button', {
          class: 'btn small',
          onclick: async () => {
            await window.api.bots.clearLogs(accountId);
            entries = [];
            renderAll();
          },
        }, 'Temizle'))),
    log,
    h('div', { class: 'console-input' }, input, sendBtn)));

  renderFilters();
  selectAccount(accountId);

  unsubscribeLog = window.api.events.botLog((id, entry) => {
    if (id !== accountId) return;
    entries.push(entry);
    const max = state.settings.console.maxLines;
    if (entries.length > max) entries.splice(0, entries.length - max);
    if (!visible(entry)) return;
    const stick = nearBottom();
    log.append(lineEl(entry));
    while (log.childElementCount > max) log.firstElementChild.remove();
    if (stick) log.scrollTop = log.scrollHeight;
  });

  const unsubscribe = subscribe((kind) => {
    if (kind === 'bot' || kind === 'accounts') renderTabs();
  });

  return () => {
    unsubscribeLog?.();
    unsubscribe();
  };
}
