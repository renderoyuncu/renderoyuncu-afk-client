/** Kucuk DOM yardimcilari. Disaridan gelen metin her zaman textContent ile yazilir. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in el && key !== 'list') el[key] = value;
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

export const STATE_LABELS = {
  idle: 'Çevrimdışı',
  connecting: 'Bağlanıyor',
  auth: 'Giriş yapılıyor',
  online: 'AFK',
  waiting: 'Yeniden bağlanacak',
  error: 'Hata',
};

export const avatarUrl = (name) => `https://minotar.net/helm/${encodeURIComponent(name)}/128.png`;
export const bodyUrl = (name) => `https://minotar.net/armor/body/${encodeURIComponent(name)}/100.png`;

export function avatar(name) {
  return h('img', {
    src: avatarUrl(name),
    alt: '',
    onerror: (e) => { e.target.src = 'assets/logo.png'; },
  });
}

export function statusTag(state) {
  return h('span', { class: 'status-tag' }, h('i', { class: `dot ${state}` }), STATE_LABELS[state] ?? state);
}

export function toggle(checked, onChange, label) {
  const el = h('button', {
    class: 'switch',
    role: 'switch',
    'aria-label': label,
    onclick: () => {
      const next = el.getAttribute('aria-checked') !== 'true';
      el.setAttribute('aria-checked', String(next));
      onChange(next);
    },
  });
  el.setAttribute('aria-checked', String(Boolean(checked)));
  return el;
}

export function toast(message, kind = '') {
  const el = h('div', { class: `toast ${kind}` }, message);
  document.getElementById('toast-root').append(el);
  setTimeout(() => el.remove(), 3500);
}

export function openModal(build) {
  const root = document.getElementById('modal-root');
  const close = () => {
    root.replaceChildren();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  const backdrop = h('div', {
    class: 'modal-backdrop',
    onmousedown: (e) => {
      if (e.target === backdrop) close();
    },
  }, h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, build(close)));
  document.addEventListener('keydown', onKey);
  root.replaceChildren(backdrop);
  backdrop.querySelector('input, button')?.focus();
}

export function confirmModal({ title, message, action, danger = false, onConfirm }) {
  openModal((close) => [
    h('h2', {}, title),
    h('p', {}, message),
    h('div', { class: 'modal-actions', style: 'margin-top:18px' },
      h('button', { class: 'btn', onclick: close }, 'Vazgeç'),
      h('button', {
        class: danger ? 'btn danger' : 'btn primary',
        onclick: () => {
          close();
          onConfirm();
        },
      }, action)),
  ]);
}

export function formatDuration(since) {
  if (!since) return '—';
  const total = Math.floor((Date.now() - since) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${hours} sa ${minutes} dk`;
  if (minutes) return `${minutes} dk ${total % 60} sn`;
  return `${total} sn`;
}

const COLORS = {
  0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa', 4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff',
};

/** "§6Merhaba" bicimindeki Minecraft metnini renkli span'lara cevirir. */
export function renderMinecraftText(text, useColors = true) {
  const parts = text.split(/(§(?:#[0-9a-f]{6}|[0-9a-fk-or]))/i);
  if (!useColors) return [parts.filter((p, i) => i % 2 === 0).join('')];
  const out = [];
  let style = {};
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      const code = part.slice(1).toLowerCase();
      if (code.startsWith('#')) style = { color: code };
      else if (COLORS[code]) style = { color: COLORS[code] };
      else if (code === 'r') style = {};
      else if (code === 'l') style = { ...style, fontWeight: '700' };
      else if (code === 'o') style = { ...style, fontStyle: 'italic' };
      else if (code === 'n') style = { ...style, textDecoration: 'underline' };
      else if (code === 'm') style = { ...style, textDecoration: 'line-through' };
      return;
    }
    if (!part) return;
    const span = document.createElement('span');
    Object.assign(span.style, style);
    span.textContent = part;
    out.push(span);
  });
  return out;
}

export const ICONS = {
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5.500h16a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H10l-4.500 3.500V17H4a1 1 0 0 1-1-1V6.500a1 1 0 0 1 1-1z"/><path d="M8 10h8M8 13h5"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-6h4v6"/></svg>',
  accounts: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.8 3-6 6.5-6s5.9 2.2 6.5 6"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4"/><path d="M18 14.5c1.9.8 3.1 2.6 3.5 5.5"/></svg>',
  console: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="m7 9.5 3 2.5-3 2.5"/><path d="M12.5 15H17"/></svg>',
  inventory: '<svg viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5"/><path d="M12 12v9"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 7.2 19.700l-.1.1a2 2 0 1 1-2.900-2.900l.1-.1a1.700 1.700 0 0 0-1.200-2.800H3a2 2 0 0 1 0-4h.1a1.700 1.700 0 0 0 1.200-2.800l-.1-.1a2 2 0 1 1 2.900-2.900l.1.1a1.700 1.700 0 0 0 2.800-1.200V3a2 2 0 0 1 4 0v.1a1.700 1.700 0 0 0 2.800 1.200l.1-.1a2 2 0 1 1 2.900 2.900l-.1.1a1.700 1.700 0 0 0 1.200 2.800h.1a2 2 0 0 1 0 4h-.1a1.700 1.700 0 0 0-1.500 1z"/></svg>',
  support: '<svg viewBox="0 0 24 24"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.800" y="13.500" width="4.200" height="6.500" rx="1.800"/><rect x="17" y="13.500" width="4.200" height="6.500" rx="1.800"/><path d="M19 20a3 3 0 0 1-3 2h-2"/></svg>',
};
