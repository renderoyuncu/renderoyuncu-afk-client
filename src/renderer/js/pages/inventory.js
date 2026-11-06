import { bodyUrl, confirmModal, h } from '../ui.js';
import { bot, state, subscribe } from '../state.js';
import { accountTabs, noAccounts, resolveAccount } from './shared.js';

// Oyuncu envanteri slot duzeni (Minecraft 1.21)
const ARMOR = [
  { slot: 5, label: 'Kask' }, { slot: 6, label: 'Zırh' }, { slot: 7, label: 'Pantolon' }, { slot: 8, label: 'Bot' },
];
const OFFHAND = 45;
const MAIN_START = 9;
const HOTBAR_START = 36;

const iconCache = new Map();
let rememberedAccount = null;

async function ensureIcons(names) {
  const missing = [...new Set(names)].filter((n) => !iconCache.has(n));
  if (!missing.length) return;
  const icons = await window.api.icons(missing);
  for (const [name, url] of Object.entries(icons)) iconCache.set(name, url);
}

function allItems(inventory) {
  return [...inventory.slots, ...(inventory.window?.slots ?? [])].filter(Boolean);
}

function itemTitle(item) {
  return item.customName || item.displayName;
}

function initials(name) {
  return name.split('_').map((w) => w[0]).join('').slice(0, 3).toUpperCase();
}

function slotEl(item, { selected, held, label, onClick }) {
  const el = h('button', {
    class: `slot${selected ? ' selected' : ''}${held ? ' held' : ''}${!item && label ? ' placeholder' : ''}`,
    title: item ? `${itemTitle(item)} ×${item.count}` : undefined,
    'aria-label': item ? `${itemTitle(item)}, ${item.count} adet` : (label ?? 'Boş yuva'),
    onclick: onClick,
  });
  if (label) el.dataset.label = label;
  if (!item) return el;

  const icon = iconCache.get(item.name);
  el.append(icon ? h('img', { src: icon, alt: '' }) : h('span', { class: 'initials' }, initials(item.name)));
  if (item.count > 1) el.append(h('span', { class: 'count' }, String(item.count)));
  if (item.maxDurability && item.durabilityUsed > 0) {
    const ratio = 1 - item.durabilityUsed / item.maxDurability;
    const bar = h('i');
    bar.style.width = `${ratio * 100}%`;
    bar.style.background = `hsl(${ratio * 120}, 90%, 50%)`;
    el.append(h('span', { class: 'durability' }, bar));
  }
  return el;
}

export function inventoryPage(root, nav) {
  let accountId = resolveAccount(nav.account, rememberedAccount);
  let selectedSlot = null;

  if (!accountId) {
    root.append(h('div', { class: 'fill-page' }, noAccounts(nav)));
    return subscribe((kind) => {
      if (kind === 'accounts' && state.accounts.length) nav.navigate('inventory');
    });
  }

  const tabsSlot = h('div');
  const body = h('div', { class: 'inventory-layout' });
  const emptySlot = h('div', { style: 'flex:1;display:flex;min-height:0' });

  const act = (action) => window.api.bots.inventoryAction(accountId, action);

  const detailPanel = (inventory) => {
    const panel = h('aside', { class: 'item-detail' });
    const item = selectedSlot === null ? null : inventory.slots[selectedSlot];
    if (!item) {
      panel.append(h('p', { class: 'muted' }, 'Ayrıntıları görmek için bir eşya seç.'));
      const heldItem = inventory.slots[HOTBAR_START + inventory.heldSlot];
      panel.append(h('div', { class: 'item-actions' },
        h('button', {
          class: 'btn',
          disabled: !heldItem,
          onclick: () => act({ action: 'use' }),
        }, 'Elimdekini kullan (sağ tık)')));
      return panel;
    }

    const icon = iconCache.get(item.name);
    if (icon) panel.append(h('img', { class: 'big', src: icon, alt: '' }));
    panel.append(h('h3', {}, itemTitle(item)));
    panel.append(h('p', { class: 'muted' }, `${item.name} · ${item.count} adet`));
    if (item.maxDurability) {
      panel.append(h('p', { class: 'muted' },
        `Dayanıklılık: ${item.maxDurability - item.durabilityUsed} / ${item.maxDurability}`));
    }
    if (item.enchants?.length) {
      panel.append(h('ul', {}, item.enchants.map((e) => h('li', {}, `${e.name} ${e.level}`))));
    }
    if (item.lore?.length) panel.append(h('ul', {}, item.lore.map((l) => h('li', {}, l))));

    const isHotbar = selectedSlot >= HOTBAR_START && selectedSlot < HOTBAR_START + 9;
    const hotbarIndex = selectedSlot - HOTBAR_START;
    panel.append(h('div', { class: 'item-actions' },
      isHotbar && h('button', {
        class: 'btn',
        onclick: () => act({ action: 'select', slot: hotbarIndex }),
      }, 'Eline al'),
      isHotbar && h('button', {
        class: 'btn',
        disabled: inventory.heldSlot !== hotbarIndex,
        onclick: () => act({ action: 'use' }),
      }, 'Kullan (sağ tık)'),
      h('button', {
        class: 'btn danger',
        onclick: () => confirmModal({
          title: 'Eşyayı yere at',
          message: `${itemTitle(item)} ×${item.count} yere atılacak. Başka oyuncular alabilir.`,
          action: 'Yere at',
          danger: true,
          onConfirm: () => {
            act({ action: 'toss', slot: selectedSlot });
            selectedSlot = null;
          },
        }),
      }, 'Yere at')));
    return panel;
  };

  const windowPanel = (inventory) => {
    const w = inventory.window;
    if (!w) return null;
    return h('section', { class: 'inv-panel' },
      h('div', { class: 'inv-panel-head' },
        h('span', { class: 'inv-title' }, w.title.toUpperCase()),
        h('button', { class: 'btn small', onclick: () => act({ action: 'close-window' }) }, 'Menüyü kapat')),
      h('div', { class: 'inv-grid' }, w.slots.map((item, i) => slotEl(item, {
        onClick: () => act({ action: 'click-window', slot: i }),
      }))));
  };

  const render = async () => {
    tabsSlot.replaceChildren(accountTabs(accountId, (id) => {
      accountId = id;
      rememberedAccount = id;
      selectedSlot = null;
      render();
    }));

    const name = state.accounts.find((a) => a.id === accountId)?.username;
    const b = bot(accountId);
    const inventory = b.inventory;

    if (!inventory) {
      body.remove();
      emptySlot.replaceChildren(h('div', { class: 'empty' },
        h('img', { src: 'assets/logo.png', alt: '' }),
        h('h3', {}, `${name} oyunda değil`),
        h('p', {}, 'Envanteri görmek için hesabı başlat.'),
        h('button', {
          class: 'btn primary',
          onclick: () => window.api.bots.start(accountId),
        }, 'Başlat')));
      if (!emptySlot.isConnected) root.firstElementChild.append(emptySlot);
      return;
    }

    emptySlot.remove();
    await ensureIcons(allItems(inventory).map((i) => i.name));

    const pick = (slot) => () => {
      selectedSlot = selectedSlot === slot ? null : slot;
      render();
    };
    const playerSlot = (slot, extra = {}) => slotEl(inventory.slots[slot], {
      selected: selectedSlot === slot,
      onClick: pick(slot),
      ...extra,
    });

    const s = b.stats;
    const main = h('div', { class: 'inventory-main' },
      windowPanel(inventory),
      h('section', { class: 'inv-panel' },
        h('div', { class: 'inv-top' },
          h('div', { class: 'inv-col' }, ARMOR.map((a) => playerSlot(a.slot, { label: a.label }))),
          h('img', {
            class: 'inv-body',
            src: bodyUrl(name),
            alt: '',
            onerror: (e) => { e.target.style.visibility = 'hidden'; },
          }),
          h('div', { class: 'inv-col' }, playerSlot(OFFHAND, { label: 'Sol el' })),
          h('div', { class: 'inv-stats' },
            h('span', {}, 'Can ', h('b', {}, s ? `${Math.ceil(s.health ?? 0)} / 20` : '—')),
            h('span', {}, 'Açlık ', h('b', {}, s ? `${s.food ?? 0} / 20` : '—')),
            h('span', {}, 'Seviye ', h('b', {}, s ? String(s.level) : '—')))),
        h('div', { class: 'inv-title', style: 'margin-bottom:8px' }, 'ENVANTER'),
        h('div', { class: 'inv-grid' }, Array.from({ length: 27 }, (_, i) => playerSlot(MAIN_START + i))),
        h('div', { class: 'inv-grid' }, Array.from({ length: 9 }, (_, i) => playerSlot(HOTBAR_START + i, {
          held: inventory.heldSlot === i,
        })))));

    body.replaceChildren(main, detailPanel(inventory));
    if (!body.isConnected) root.firstElementChild.append(body);
  };

  root.append(h('div', { class: 'fill-page' },
    h('div', { class: 'page-head', style: 'margin-bottom:12px' },
      h('div', {}, h('h1', {}, 'Envanter'), h('p', {}, 'AFK hesabın envanteri canlı olarak güncellenir.'))),
    tabsSlot));

  render();

  return subscribe((kind, id) => {
    if (kind === 'accounts') {
      accountId = resolveAccount(accountId, rememberedAccount);
      if (accountId) render();
      else nav.navigate('inventory');
    } else if (kind === 'inventory' && id === accountId) render();
    else if (kind === 'bot') {
      tabsSlot.replaceChildren(accountTabs(accountId, (next) => {
        accountId = next;
        rememberedAccount = next;
        selectedSlot = null;
        render();
      }));
    }
  });
}
