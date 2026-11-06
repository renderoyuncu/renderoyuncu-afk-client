import { h } from '../ui.js';
import { state, subscribe } from '../state.js';

const SITE_BLOG = 'https://renderoyuncu.net/blog/';

function serverPill() {
  const s = state.server;
  if (!s) return h('span', { class: 'pill' }, h('i'), 'Sunucu kontrol ediliyor');
  if (!s.online) return h('span', { class: 'pill offline' }, h('i'), 'Sunucuya ulaşılamıyor');
  return h('span', { class: 'pill online' }, h('i'), `${s.players} / ${s.max} oyuncu çevrimiçi`);
}

function newsCard(item) {
  return h('button', { class: 'news-card', onclick: () => window.api.openExternal(item.url) },
    h('img', {
      src: item.image ?? 'assets/logo.png',
      alt: '',
      onerror: (e) => { e.target.src = 'assets/logo.png'; },
    }),
    h('div', { class: 'news-body' },
      h('div', { class: 'news-meta' }, h('b', {}, item.category), h('span', {}, item.date)),
      h('h3', {}, item.title),
      h('p', {}, item.excerpt)));
}

async function loadNews(grid) {
  grid.replaceChildren(...[0, 1, 2].map(() => h('div', { class: 'news-card skeleton' })));
  const { items } = await window.api.news();
  if (!items.length) {
    grid.replaceChildren(h('div', { class: 'empty', style: 'grid-column:1/-1' },
      h('h3', {}, 'Haberler alınamadı'),
      h('p', {}, 'İnternet bağlantını kontrol edip tekrar dene.'),
      h('button', { class: 'btn', onclick: () => loadNews(grid) }, 'Tekrar dene')));
    return;
  }
  grid.replaceChildren(...items.map(newsCard));
}

export function homePage(root) {
  const pillSlot = h('div');
  const subtitle = h('p');
  const title = h('h1');
  const grid = h('div', { class: 'news-grid' });

  const refresh = () => {
    const { server, bridge } = state.settings;
    pillSlot.replaceChildren(serverPill());
    title.textContent = state.serverHost;
    const version = bridge.enabled
      ? (bridge.targetVersion || 'otomatik')
      : (server.version === 'auto' ? 'otomatik sürüm' : server.version);
    subtitle.textContent = `Minecraft ${version} · RenderOyuncu AFK Client`;
  };

  root.append(
    h('section', { class: 'hero' }, pillSlot, title, subtitle, h('img', { src: 'assets/logo.png', alt: '' })),
    h('div', { class: 'section-head' },
      h('h2', {}, 'DUYURULAR'),
      h('button', { class: 'link', onclick: () => window.api.openExternal(SITE_BLOG) }, 'Tümü sitede →')),
    grid,
  );

  refresh();
  loadNews(grid);
  return subscribe((kind) => {
    if (kind === 'server') refresh();
  });
}
