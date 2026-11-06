/** Uygulama durumu: tek kaynak, degisiklikler abonelere yayinlanir. */
export const state = {
  accounts: [],
  selected: null,
  bots: {},
  settings: null,
  serverHost: '',
  gameModes: {},
  afkCommands: {},
  autoMessage: { accountId: null, text: '', enabled: false, nextAt: null },
  update: { state: 'disabled' },
  autoMessageMinutes: 20,
  autoMessageMaxLength: 256,
  versions: [],
  maxAccounts: 3,
  appVersion: '',
  server: null,
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** kind: 'accounts' (liste degisti) | 'bot' (durum/istatistik) | 'server' */
export function notify(kind, id) {
  for (const fn of listeners) fn(kind, id);
}

export function applyAccounts({ accounts, selected, bots }) {
  state.accounts = accounts;
  state.selected = selected;
  state.bots = bots;
  notify('accounts');
}

export function bot(id) {
  return state.bots[id] ?? { state: 'idle', detail: '', stats: null, inventory: null };
}

export const isActive = (id) => ['connecting', 'auth', 'online', 'waiting'].includes(bot(id).state);

export const selectedAccount = () => state.accounts.find((a) => a.id === state.selected) ?? null;
