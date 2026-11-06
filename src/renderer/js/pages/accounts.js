import {
  avatar, confirmModal, formatDuration, h, openModal, statusTag, toast, toggle,
} from '../ui.js';
import {
  applyAccounts, bot, isActive, state, subscribe,
} from '../state.js';

function addAccountModal() {
  openModal((close) => {
    const username = h('input', { type: 'text', maxLength: 16, placeholder: 'Örnek: Oyuncuafk1', spellcheck: false });
    const password = h('input', { type: 'password', placeholder: 'Boş bırakırsan otomatik oluşturulur' });
    const email = h('input', { type: 'text', placeholder: 'Boş bırakırsan otomatik oluşturulur', spellcheck: false });
    const error = h('div', { class: 'modal-error' });

    const submit = async (e) => {
      e.preventDefault();
      try {
        const result = await window.api.accounts.add({
          username: username.value,
          password: password.value,
          email: email.value,
        });
        applyAccounts(result);
        close();
        toast(`${username.value} eklendi. İlk girişte otomatik kayıt olacak.`);
      } catch (err) {
        error.textContent = err.message.replace(/^.*Error: /, '');
      }
    };

    return h('form', { onsubmit: submit },
      h('h2', {}, 'Hesap ekle'),
      h('p', { style: 'margin-top:4px;color:var(--muted);font-size:13px' },
        'Hesap sunucuda kayıtlı değilse ilk girişte otomatik kayıt olur.'),
      h('label', { class: 'field' }, 'Kullanıcı adı', username,
        h('small', {}, 'Sonu afk1, afk2 veya afk3 olmalı.')),
      h('label', { class: 'field' }, 'Şifre', password,
        h('small', {}, 'Sunucuda zaten kayıtlıysan oradaki şifreni yaz.')),
      h('label', { class: 'field' }, 'E-posta (isteğe bağlı)', email,
        h('small', {}, 'Kayıt komutunda kullanılır.')),
      error,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', type: 'button', onclick: close }, 'Vazgeç'),
        h('button', { class: 'btn primary', type: 'submit' }, 'Ekle')));
  });
}

function changePasswordModal(account) {
  openModal((close) => {
    const password = h('input', { type: 'password', placeholder: 'Yeni şifre' });
    const error = h('div', { class: 'modal-error' });
    const submit = async (e) => {
      e.preventDefault();
      try {
        applyAccounts(await window.api.accounts.update(account.id, { password: password.value }));
        close();
        toast('Şifre güncellendi.');
      } catch (err) {
        error.textContent = err.message.replace(/^.*Error: /, '');
      }
    };
    return h('form', { onsubmit: submit },
      h('h2', {}, `${account.username} şifresi`),
      h('p', { style: 'margin-top:4px;color:var(--muted);font-size:13px' },
        'Bu yalnızca uygulamadaki kaydı değiştirir, sunucudaki şifreyi değiştirmez.'),
      h('label', { class: 'field' }, 'Şifre', password),
      error,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', type: 'button', onclick: close }, 'Vazgeç'),
        h('button', { class: 'btn primary', type: 'submit' }, 'Kaydet')));
  });
}

function changeEmailModal(account) {
  openModal((close) => {
    const email = h('input', {
      type: 'text', value: account.email ?? '', placeholder: 'Boş bırakırsan otomatik oluşturulur', spellcheck: false,
    });
    const error = h('div', { class: 'modal-error' });
    const submit = async (e) => {
      e.preventDefault();
      try {
        applyAccounts(await window.api.accounts.update(account.id, { email: email.value }));
        close();
        toast('E-posta güncellendi.');
      } catch (err) {
        error.textContent = err.message.replace(/^.*Error: /, '');
      }
    };
    return h('form', { onsubmit: submit },
      h('h2', {}, `${account.username} e-postası`),
      h('p', { style: 'margin-top:4px;color:var(--muted);font-size:13px' },
        'Yalnızca kayıt sırasında kullanılır. Sunucuda kayıtlı hesabın e-postasını değiştirmez.'),
      h('label', { class: 'field' }, 'E-posta', email),
      error,
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn', type: 'button', onclick: close }, 'Vazgeç'),
        h('button', { class: 'btn primary', type: 'submit' }, 'Kaydet')));
  });
}

function showPasswordModal(account) {
  window.api.accounts.revealPassword(account.id).then((password) => {
    openModal((close) => [
      h('h2', {}, `${account.username} şifresi`),
      h('p', { style: 'margin-top:12px;font-family:Consolas,monospace;font-size:16px;user-select:text;color:var(--text)' }, password),
      h('div', { class: 'modal-actions', style: 'margin-top:18px' },
        h('button', { class: 'btn primary', onclick: close }, 'Kapat')),
    ]);
  });
}

const VIP_WARNING = 'Eğer VIP ve üstü değilsen bu komut çalışmaz.';

function setModes(account, patch) {
  return window.api.accounts.setModes(account.id, patch).then(applyAccounts);
}

function gameModesModal(account) {
  openModal((close) => [
    h('h2', {}, 'Oyun Modları'),
    h('p', {}, `${account.username} hangi oyuna girsin?`),
    h('div', { class: 'mode-list' }, Object.entries(state.gameModes).map(([id, mode]) => {
      const selected = account.gameMode === id;
      return h('button', {
        class: `mode-card${selected ? ' active' : ''}`,
        onclick: async () => {
          close();
          await setModes(account, { gameMode: id });
          toast(`${account.username} ${mode.name} oyununa giriyor.`);
        },
      }, h('b', {}, mode.name), h('span', {}, selected ? 'Seçili' : mode.versions));
    })),
    h('div', { class: 'modal-actions', style: 'margin-top:16px' },
      account.gameMode && h('button', {
        class: 'btn',
        onclick: () => {
          close();
          setModes(account, { gameMode: null, afkMode: null });
        },
      }, 'Seçimi kaldır'),
      h('button', { class: 'btn', onclick: close }, 'Kapat')),
  ]);
}

function afkButton(account, mode, label, tip) {
  return h('button', {
    class: `btn${account.afkMode === mode ? ' selected' : ''}${tip ? ' has-tip' : ''}`,
    dataset: tip ? { tip } : {},
    'aria-pressed': String(account.afkMode === mode),
    onclick: () => setModes(account, { afkMode: account.afkMode === mode ? null : mode }),
  }, label);
}

function accountCard(account, nav) {
  const statusSlot = h('div');
  const detail = h('div', { class: 'account-detail' });
  const fields = {};
  const stat = (key, label) => {
    fields[key] = h('b', {}, '—');
    return h('div', { class: 'stat' }, h('span', {}, label), fields[key]);
  };
  const power = h('button', { class: 'btn primary' });
  const afkSection = h('div', { class: 'afk-section', hidden: true },
    h('span', { class: 'inv-title' }, 'AFK MODU'),
    h('div', { class: 'afk-buttons' },
      afkButton(account, 'vip', 'VIP AFK', VIP_WARNING),
      afkButton(account, 'player', 'Oyuncu AFK')),
    !account.afkMode && h('p', { class: 'chat-status' }, 'AFK yeri seçilmedi. Bot seçim yapılana kadar yerinde bekler.'));
  const afkLabels = { vip: 'VIP AFK', player: 'Oyuncu AFK' };
  const savedChoice = account.gameMode && h('p', { class: 'chat-status' },
    `Kayıtlı seçim: ${[state.gameModes[account.gameMode]?.name, afkLabels[account.afkMode]].filter(Boolean).join(' · ')}`);

  const card = h('article', { class: 'account-card' },
    h('div', { class: 'account-top' },
      avatar(account.username),
      h('div', { style: 'min-width:0' }, h('h3', {}, account.username), statusSlot)),
    h('div', { class: 'account-detail-wrap' }, detail),
    h('div', { class: 'stat-grid' },
      stat('health', 'Can'), stat('food', 'Açlık'), stat('ping', 'Ping'),
      stat('uptime', 'AFK süresi'), stat('position', 'Konum'), stat('world', 'Dünya')),
    h('div', { class: 'account-actions' },
      power,
      h('button', { class: 'btn', onclick: () => nav.navigate('console', { account: account.id }) }, 'Konsol'),
      h('button', { class: 'btn', onclick: () => nav.navigate('inventory', { account: account.id }) }, 'Envanter')),
    h('button', { class: 'btn', onclick: () => gameModesModal(account) }, 'Oyun Modları'),
    savedChoice,
    afkSection,
    h('div', { class: 'account-options' },
      h('div', { class: 'account-option' }, 'Toplu başlatmaya dahil',
        toggle(account.autoStart, (v) => window.api.accounts.update(account.id, { autoStart: v }).then(applyAccounts), 'Toplu başlatmaya dahil')),
      h('div', { class: 'account-option' }, 'Sunucuda kayıtlı',
        toggle(account.registered, (v) => window.api.accounts.update(account.id, { registered: v }).then(applyAccounts), 'Sunucuda kayıtlı')),
      h('div', { class: 'account-actions' },
        h('button', { class: 'btn small', onclick: () => showPasswordModal(account) }, 'Şifreyi gör'),
        h('button', { class: 'btn small', onclick: () => changePasswordModal(account) }, 'Şifre değiştir'),
        h('button', { class: 'btn small', onclick: () => changeEmailModal(account) }, 'E-posta'),
        h('button', {
          class: 'btn small danger',
          onclick: () => confirmModal({
            title: 'Hesabı sil',
            message: `${account.username} bu uygulamadan silinecek. Sunucudaki hesabına dokunulmaz.`,
            action: 'Sil',
            danger: true,
            onConfirm: async () => applyAccounts(await window.api.accounts.remove(account.id)),
          }),
        }, 'Sil'))));

  power.addEventListener('click', () => {
    if (isActive(account.id)) window.api.bots.stop(account.id);
    else window.api.bots.start(account.id);
  });

  card.refresh = () => {
    const b = bot(account.id);
    const s = b.stats;
    card.classList.toggle('online', b.state === 'online');
    statusSlot.replaceChildren(statusTag(b.state));
    afkSection.hidden = s?.location !== 'survival';
    detail.textContent = b.detail || '';
    power.textContent = isActive(account.id) ? 'Durdur' : 'Başlat';
    power.className = isActive(account.id) ? 'btn' : 'btn primary';
    fields.health.textContent = s ? `${Math.ceil(s.health ?? 0)} / 20` : '—';
    fields.food.textContent = s ? `${s.food ?? 0} / 20` : '—';
    fields.ping.textContent = s ? `${s.ping} ms` : '—';
    fields.uptime.textContent = s ? formatDuration(s.onlineSince) : '—';
    fields.position.textContent = s ? `${s.position.x}, ${s.position.y}, ${s.position.z}` : '—';
    fields.world.textContent = s?.dimension || '—';
  };
  card.refresh();
  return card;
}

export function accountsPage(root, nav) {
  const count = h('p');
  const grid = h('div', { class: 'account-grid' });
  const addBtn = h('button', { class: 'btn primary', onclick: addAccountModal }, 'Hesap ekle');
  const cards = new Map();

  const rebuild = () => {
    cards.clear();
    count.textContent = `${state.accounts.length} / ${state.maxAccounts} hesap kullanılıyor`;
    addBtn.disabled = state.accounts.length >= state.maxAccounts;
    const items = state.accounts.map((account) => {
      const card = accountCard(account, nav);
      cards.set(account.id, card);
      return card;
    });
    for (let i = state.accounts.length; i < state.maxAccounts; i += 1) {
      items.push(h('button', { class: 'slot-empty', onclick: addAccountModal }, h('b', {}, '+'), 'Hesap ekle'));
    }
    grid.replaceChildren(...items);
  };

  root.append(
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Hesaplar'), count),
      addBtn),
    grid,
  );
  rebuild();

  const ticker = setInterval(() => cards.forEach((c) => c.refresh()), 1000);
  const unsubscribe = subscribe((kind, id) => {
    if (kind === 'accounts') rebuild();
    else if (kind === 'bot') cards.get(id)?.refresh();
  });
  return () => {
    clearInterval(ticker);
    unsubscribe();
  };
}
