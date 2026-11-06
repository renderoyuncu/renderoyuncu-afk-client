import {
  confirmModal, h, toast, toggle,
} from '../ui.js';
import { notify, state } from '../state.js';

const VIEW_DISTANCES = [
  ['tiny', 'Çok kısa (önerilen)'], ['short', 'Kısa'], ['normal', 'Normal'], ['far', 'Uzak'],
];

const pattern = (key, label, hint) => ({ key, label, hint, type: 'text', stack: true, regex: true });

const SECTIONS = [
  {
    id: 'server',
    label: 'Sunucu',
    fields: [
      {
        key: 'server.version',
        label: 'Minecraft sürümü',
        hint: 'Otomatik seçenek, Velocity gibi proxy arkasındaki sunucularda yanlış sürüm seçebilir.',
        type: 'select',
        options: () => [['auto', 'Otomatik'], ...[...state.versions].reverse().map((v) => [v, v])],
      },
      { key: 'server.connectTimeout', label: 'Bağlantı zaman aşımı (sn)', type: 'number', min: 5, max: 120 },
    ],
  },
  {
    id: 'auth',
    label: 'Kayıt ve Giriş',
    fields: [
      { key: 'auth.autoRegister', label: 'Otomatik kayıt', hint: 'Sunucu kayıt isteyince komutu kendisi gönderir. E-posta girmen gerekmez.', type: 'toggle' },
      { key: 'auth.autoLogin', label: 'Otomatik giriş', hint: 'Her bağlantıda şifreyle giriş yapar.', type: 'toggle' },
      { key: 'auth.loginCommand', label: 'Giriş komutu', type: 'text', stack: true },
      { key: 'auth.delayMs', label: 'Komut gecikmesi (ms)', type: 'number', min: 0, max: 15000 },
      { key: 'auth.fallbackSeconds', label: 'Mesaj gelmezse bekleme (sn)', hint: 'Sunucu sohbette sormazsa bu süre sonunda komut gönderilir.', type: 'number', min: 1, max: 60 },
      { key: 'auth.maxAttempts', label: 'En fazla deneme', type: 'number', min: 1, max: 10 },
      { key: 'auth.postLoginCommands', label: 'Giriş sonrası komutlar', hint: 'Her satıra bir komut. Örnek: /survival', type: 'textarea' },
      { key: 'auth.postLoginDelayMs', label: 'Komutlar arası bekleme (ms)', type: 'number', min: 0, max: 60000 },
      pattern('auth.registerPattern', 'Kayıt mesajı deseni', 'Sunucu mesajını tanımak için kullanılan düzenli ifade.'),
      pattern('auth.loginPattern', 'Giriş mesajı deseni'),
      pattern('auth.successPattern', 'Başarı mesajı deseni'),
      pattern('auth.alreadyPattern', 'Zaten kayıtlı mesajı deseni'),
      pattern('auth.wrongPattern', 'Yanlış şifre mesajı deseni'),
    ],
  },
  {
    id: 'reconnect',
    label: 'Yeniden Bağlanma',
    fields: [
      { key: 'reconnect.enabled', label: 'Otomatik yeniden bağlan', hint: 'Bağlantı koparsa hesabı tekrar sokar.', type: 'toggle' },
      { key: 'reconnect.delaySeconds', label: 'Bekleme süresi (sn)', type: 'number', min: 3, max: 3600 },
      { key: 'reconnect.maxAttempts', label: 'En fazla deneme', hint: '0 sınırsız demektir.', type: 'number', min: 0, max: 1000 },
      { key: 'reconnect.staggerSeconds', label: 'Hesaplar arası bekleme (sn)', hint: 'Toplu başlatmada hesaplar art arda bağlanır.', type: 'number', min: 0, max: 120 },
      pattern('reconnect.stopKeywords', 'Durdurma kelimeleri', 'Atılma sebebinde geçerse yeniden bağlanmaz.'),
    ],
  },
  {
    id: 'antiAfk',
    label: 'Anti-AFK',
    fields: [
      { key: 'antiAfk.enabled', label: 'Anti-AFK', hint: 'Sunucunun AFK atmasını önlemek için rastgele hareket yapar.', type: 'toggle' },
      { key: 'antiAfk.minSeconds', label: 'En kısa aralık (sn)', type: 'number', min: 1, max: 3600 },
      { key: 'antiAfk.maxSeconds', label: 'En uzun aralık (sn)', type: 'number', min: 1, max: 3600 },
      { key: 'antiAfk.jump', label: 'Zıplama', type: 'toggle' },
      { key: 'antiAfk.sneak', label: 'Eğilme', type: 'toggle' },
      { key: 'antiAfk.swing', label: 'Kol sallama', type: 'toggle' },
      { key: 'antiAfk.look', label: 'Etrafa bakma', type: 'toggle' },
      { key: 'antiAfk.walk', label: 'İleri geri yürüme', hint: 'Yüksek yerlerde düşme riski vardır.', type: 'toggle' },
    ],
  },
  {
    id: 'behavior',
    label: 'Davranış',
    fields: [
      { key: 'behavior.autoEat', label: 'Otomatik yemek', hint: 'Envanterdeki yiyecekleri kullanır.', type: 'toggle' },
      { key: 'behavior.eatThreshold', label: 'Yemek eşiği (açlık)', type: 'number', min: 1, max: 19 },
      { key: 'behavior.lowHealthDisconnect', label: 'Düşük canda çık', hint: 'Can bu değere inerse hesap çıkar. 0 kapalıdır.', type: 'number', min: 0, max: 19 },
      { key: 'behavior.acceptResourcePack', label: 'Kaynak paketini kabul et', hint: 'Bazı sunucular reddedeni atar.', type: 'toggle' },
      { key: 'behavior.physics', label: 'Fizik motoru', hint: 'Kapatmak işlemciyi rahatlatır ama anti-AFK hareketleri çalışmaz.', type: 'toggle' },
      { key: 'behavior.viewDistance', label: 'Görüş mesafesi', type: 'select', options: () => VIEW_DISTANCES },
      { key: 'behavior.periodicCommands', label: 'Periyodik komutlar', hint: 'Her satıra bir komut.', type: 'textarea' },
      { key: 'behavior.periodicMinutes', label: 'Periyot (dk)', type: 'number', min: 1, max: 1440 },
    ],
  },
  {
    id: 'console',
    label: 'Konsol',
    fields: [
      { key: 'console.maxLines', label: 'Satır sınırı', hint: 'Hesap başına saklanan satır sayısı.', type: 'number', min: 100, max: 10000 },
      { key: 'console.timestamps', label: 'Saat göster', type: 'toggle' },
      { key: 'console.colors', label: 'Renkli yazı', type: 'toggle' },
      { key: 'console.showActionBar', label: 'Action bar mesajlarını göster', type: 'toggle' },
      { key: 'console.showDebug', label: 'Ayrıntılı kayıtlar', hint: 'Anti-AFK gibi arka plan işlemlerini de gösterir.', type: 'toggle' },
    ],
  },
  {
    id: 'app',
    label: 'Uygulama',
    fields: [
      { key: 'app.autoStartBots', label: 'Sunucuya otomatik gir', hint: 'Hesaplar uygulama açılınca, yeni hesap ise eklenince bağlanır.', type: 'toggle' },
      { key: 'app.launchOnBoot', label: 'Windows ile başlat', hint: 'Yalnızca kurulu sürümde çalışır.', type: 'toggle' },
      { key: 'app.startMinimized', label: 'Simge durumunda başlat', type: 'toggle' },
      { key: 'app.closeToTray', label: 'Kapatınca arka planda çalış', hint: 'Hesaplar bağlı kalır, uygulama görev çubuğu simgesine iner.', type: 'toggle' },
      { key: 'app.confirmQuit', label: 'Çıkarken sor', type: 'toggle' },
      { key: 'app.notifications', label: 'Bağlantı kopunca bildir', type: 'toggle' },
    ],
  },
];

const BRIDGE_FIELDS = [
  { key: 'bridge.enabled', label: 'Sürüm köprüsünü kullan', hint: 'Hesaplar sunucuya ViaProxy üzerinden bağlanır.', type: 'toggle' },
  { key: 'bridge.targetVersion', label: 'Sunucu sürümü', hint: 'Örnek: 26.3. Boş bırakılırsa ViaProxy algılar.', type: 'text' },
  {
    key: 'bridge.clientVersion',
    label: 'Bot sürümü',
    type: 'select',
    options: () => [...state.versions].reverse().map((v) => [v, v]),
  },
  { key: 'bridge.port', label: 'Yerel port', type: 'number', min: 1024, max: 65535 },
];

function getValue(settings, key) {
  const [group, name] = key.split('.');
  return settings[group][name];
}

function setValue(settings, key, value) {
  const [group, name] = key.split('.');
  settings[group][name] = value;
}

function isValidRegex(source) {
  try {
    RegExp(source, 'iu');
    return true;
  } catch {
    return false;
  }
}

export function settingsPage(root) {
  let active = 'server';
  let saveTimer = null;
  const nav = h('div', { class: 'settings-nav' });
  const body = h('div', { class: 'settings-body' });

  const flush = async () => {
    saveTimer = null;
    state.settings = await window.api.settings.save(state.settings);
    notify('settings');
  };
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 350);
  };

  const fieldEl = (field) => {
    const value = getValue(state.settings, field.key);
    const update = (v) => {
      setValue(state.settings, field.key, v);
      scheduleSave();
    };
    const error = h('div', { class: 'setting-error' });
    let control;

    if (field.type === 'toggle') {
      control = toggle(value, update, field.label);
    } else if (field.type === 'select') {
      control = h('select', { 'aria-label': field.label, onchange: (e) => update(e.target.value) },
        field.options().map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
    } else if (field.type === 'number') {
      control = h('input', {
        type: 'number',
        min: field.min,
        max: field.max,
        value,
        'aria-label': field.label,
        onchange: (e) => {
          const parsed = Number(e.target.value);
          const clamped = Number.isFinite(parsed)
            ? Math.min(field.max, Math.max(field.min, Math.round(parsed)))
            : value;
          e.target.value = clamped;
          update(clamped);
        },
      });
    } else {
      const tag = field.type === 'textarea' ? 'textarea' : 'input';
      control = h(tag, {
        value,
        spellcheck: false,
        'aria-label': field.label,
        oninput: (e) => {
          const ok = !field.regex || isValidRegex(e.target.value);
          e.target.classList.toggle('invalid', !ok);
          error.textContent = ok ? '' : 'Geçersiz düzenli ifade, kaydedilmedi.';
          if (ok) update(e.target.value);
        },
      });
      if (tag === 'input') control.type = 'text';
    }

    const stacked = field.stack || field.type === 'textarea';
    return h('div', { class: `setting${stacked ? ' stack' : ''}` },
      h('div', { class: 'setting-label' }, h('b', {}, field.label), field.hint && h('span', {}, field.hint)),
      control,
      field.regex && error);
  };

  const bridgeStatus = async (slot) => {
    const status = await window.api.bridge.status();
    const java = status.java.found
      ? `Java ${status.java.version}${status.java.ok ? '' : ' (en az 17 gerekir)'}`
      : 'Java bulunamadı';
    const progress = h('span');
    const button = h('button', {
      class: 'btn primary small',
      onclick: async () => {
        button.disabled = true;
        const off = window.api.events.bridgeProgress((p) => {
          progress.textContent = ` %${Math.round(p * 100)}`;
        });
        try {
          const result = await window.api.bridge.download();
          toast(`ViaProxy ${result.version} indirildi.`);
        } catch (err) {
          toast(`İndirilemedi: ${err.message.replace(/^.*Error: /, '')}`, 'error');
        }
        off();
        bridgeStatus(slot);
      },
    }, status.jarInstalled ? 'Güncelle' : 'ViaProxy indir (~47 MB)');
    slot.replaceChildren(h('div', { class: 'setting' },
      h('div', { class: 'setting-label' },
        h('b', {}, java),
        h('span', {}, status.jarInstalled ? 'ViaProxy kurulu.' : 'ViaProxy henüz indirilmedi.', progress)),
      button));
  };

  const renderBody = () => {
    if (active === 'bridge') {
      const slot = h('div');
      body.replaceChildren(
        h('p', { style: 'color:var(--muted);font-size:13px;margin-bottom:12px' },
          'Listede olmayan daha yeni bir sunucu sürümü için kullanılır. Java ile yerelde çalışır; 1.21.x için gerekmez.'),
        slot,
        ...BRIDGE_FIELDS.map(fieldEl),
      );
      bridgeStatus(slot);
      return;
    }
    const section = SECTIONS.find((s) => s.id === active);
    body.replaceChildren(...section.fields.map(fieldEl));
    body.scrollTop = 0;
  };

  const renderNav = () => {
    const items = [...SECTIONS, { id: 'bridge', label: 'Sürüm Köprüsü' }];
    nav.replaceChildren(...items.map((s) => h('button', {
      class: s.id === active ? 'active' : '',
      onclick: () => {
        active = s.id;
        renderNav();
        renderBody();
      },
    }, s.label)));
  };

  root.append(h('div', { class: 'fill-page' },
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Ayarlar'), h('p', {}, 'Değişiklikler otomatik kaydedilir. Bağlantı ayarları bir sonraki bağlantıda uygulanır.')),
      h('button', {
        class: 'btn danger',
        onclick: () => confirmModal({
          title: 'Ayarları sıfırla',
          message: 'Tüm ayarlar varsayılana döner. Hesaplar silinmez.',
          action: 'Sıfırla',
          danger: true,
          onConfirm: async () => {
            state.settings = await window.api.settings.reset();
            renderBody();
            notify('settings');
          },
        }),
      }, 'Varsayılana dön')),
    h('div', { class: 'settings-layout' }, nav, body)));

  renderNav();
  renderBody();

  return () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      flush();
    }
  };
}
