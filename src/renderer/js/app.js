import { ICONS, avatar, h } from './ui.js';
import {
  applyAccounts, bot, isActive, notify, selectedAccount, state, subscribe,
} from './state.js';
import { homePage } from './pages/home.js';
import { accountsPage } from './pages/accounts.js';
import { consolePage } from './pages/console.js';
import { inventoryPage } from './pages/inventory.js';
import { settingsPage } from './pages/settings.js';
import { supportPage } from './pages/support.js';
import { initChatPanel } from './chat-panel.js';
import { initUpdateBanner } from './update-banner.js';

const SERVER_POLL_MS = 30000;

const PAGES = [
  { id: 'home', label: 'Ana Sayfa', icon: ICONS.home, page: homePage },
  { id: 'accounts', label: 'Hesaplar', icon: ICONS.accounts, page: accountsPage },
  { id: 'console', label: 'Konsol', icon: ICONS.console, page: consolePage },
  { id: 'inventory', label: 'Envanter', icon: ICONS.inventory, page: inventoryPage },
  { id: 'settings', label: 'Ayarlar', icon: ICONS.settings, page: settingsPage },
  { id: 'support', label: 'Destek', icon: ICONS.support, page: supportPage },
];

const pageEl = document.getElementById('page');
const navEl = document.getElementById('nav');
const profileEl = document.getElementById('profile');
const launchText = document.getElementById('launch-text');
const launchFill = document.getElementById('launch-fill');
const launchBtn = document.getElementById('launch-btn');

let current = null;
let cleanup = null;

export function navigate(id, params = {}) {
  const entry = PAGES.find((p) => p.id === id);
  if (!entry) return;
  cleanup?.();
  current = id;
  for (const btn of navEl.children) btn.classList.toggle('active', btn.dataset.page === id);
  pageEl.replaceChildren();
  cleanup = entry.page(pageEl, { navigate, ...params }) ?? null;
}

function renderNav() {
  navEl.replaceChildren(...PAGES.map((p) => {
    const btn = h('button', { class: 'nav-item', dataset: { page: p.id }, onclick: () => navigate(p.id) });
    btn.innerHTML = p.icon; // yalnizca kod icindeki sabit SVG
    btn.append(h('span', {}, p.label));
    return btn;
  }));
}

function renderProfile() {
  const account = selectedAccount();
  if (!account) {
    profileEl.replaceChildren(
      h('div', { class: 'profile-avatar' }, h('img', { src: 'assets/logo.png', alt: '' })),
      h('span', { class: 'profile-name' }, 'Hesap yok'),
      h('span', { class: 'profile-action' }, 'Hesap ekle'),
    );
    return;
  }
  const { state: botState } = bot(account.id);
  profileEl.replaceChildren(
    h('div', { class: 'profile-avatar' }, avatar(account.username), h('i', { class: `dot ${botState}` })),
    h('span', { class: 'profile-name' }, account.username),
    h('span', { class: 'profile-action' }, isActive(account.id) ? 'Çıkış yap' : 'Giriş yap'),
  );
}

profileEl.addEventListener('click', () => {
  const account = selectedAccount();
  if (!account) navigate('accounts');
  else if (isActive(account.id)) window.api.bots.stop(account.id);
  else window.api.bots.start(account.id);
});

function renderLaunchbar() {
  const total = state.accounts.length;
  const active = state.accounts.filter((a) => isActive(a.id)).length;
  const online = state.accounts.filter((a) => bot(a.id).state === 'online').length;
  const failed = state.accounts.find((a) => bot(a.id).state === 'error');

  launchFill.style.width = total ? `${(online / total) * 100}%` : '0';
  launchBtn.classList.toggle('stop', active > 0);

  if (!total) {
    launchText.textContent = 'Başlamak için hesap ekle';
    launchBtn.textContent = 'HESAP EKLE';
  } else if (active) {
    launchText.textContent = `${online} / ${total} hesap AFK`;
    launchBtn.textContent = 'DURDUR';
  } else {
    launchText.textContent = failed ? `${failed.username}: ${bot(failed.id).detail}` : 'Hazır';
    launchBtn.textContent = 'BAŞLAT';
  }
}

launchBtn.addEventListener('click', () => {
  if (!state.accounts.length) navigate('accounts');
  else if (state.accounts.some((a) => isActive(a.id))) window.api.bots.stopAll();
  else window.api.bots.startAll();
});

async function pollServer() {
  state.server = await window.api.serverStatus();
  notify('server');
}

async function boot() {
  document.getElementById('btn-min').addEventListener('click', window.api.window.minimize);
  document.getElementById('btn-close').addEventListener('click', window.api.window.close);

  const init = await window.api.init();
  Object.assign(state, {
    settings: init.settings,
    serverHost: init.serverHost,
    gameModes: init.gameModes,
    afkCommands: init.afkCommands,
    autoMessage: init.autoMessage,
    update: init.update,
    autoMessageMinutes: init.autoMessageMinutes,
    autoMessageMaxLength: init.autoMessageMaxLength,
    versions: init.versions,
    maxAccounts: init.maxAccounts,
    appVersion: init.appVersion,
  });

  subscribe(() => {
    renderProfile();
    renderLaunchbar();
  });

  window.api.events.botUpdate((id, data) => {
    state.bots[id] = data;
    notify('bot', id);
  });
  window.api.events.botInventory((id, inventory) => {
    if (state.bots[id]) state.bots[id].inventory = inventory;
    notify('inventory', id);
  });
  window.api.events.accounts(applyAccounts);
  window.api.events.autoMessage((status) => {
    state.autoMessage = status;
    notify('autoMessage');
  });

  window.api.events.update((status) => {
    state.update = status;
    notify('update');
  });

  renderNav();
  initChatPanel();
  initUpdateBanner();
  applyAccounts(init);
  navigate('home');

  pollServer();
  setInterval(pollServer, SERVER_POLL_MS);
}

boot();
