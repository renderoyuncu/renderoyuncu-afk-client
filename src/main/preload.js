'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel) => (fn) => {
  const handler = (_event, ...args) => fn(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('api', {
  init: invoke('app:init'),
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    close: () => ipcRenderer.send('window:close'),
  },
  openExternal: (url) => ipcRenderer.send('open-external', url),
  news: invoke('news:get'),
  serverStatus: invoke('server:status'),
  accounts: {
    add: invoke('accounts:add'),
    update: invoke('accounts:update'),
    remove: invoke('accounts:remove'),
    select: invoke('accounts:select'),
    revealPassword: invoke('accounts:reveal'),
    setModes: invoke('accounts:setModes'),
  },
  autoMessage: {
    set: invoke('autoMessage:set'),
  },
  update: {
    check: invoke('update:check'),
    install: invoke('update:install'),
    postpone: invoke('update:postpone'),
  },
  bots: {
    start: invoke('bots:start'),
    stop: invoke('bots:stop'),
    startAll: invoke('bots:startAll'),
    stopAll: invoke('bots:stopAll'),
    chat: invoke('bots:chat'),
    logs: invoke('bots:logs'),
    clearLogs: invoke('bots:clearLogs'),
    inventoryAction: invoke('bots:inventoryAction'),
  },
  icons: invoke('icons:get'),
  settings: {
    save: invoke('settings:save'),
    reset: invoke('settings:reset'),
  },
  bridge: {
    status: invoke('bridge:status'),
    download: invoke('bridge:download'),
  },
  events: {
    botUpdate: on('bot:update'),
    botLog: on('bot:log'),
    botInventory: on('bot:inventory'),
    accounts: on('accounts:changed'),
    bridgeProgress: on('bridge:progress'),
    autoMessage: on('autoMessage:changed'),
    update: on('update:status'),
  },
});

contextBridge.exposeInMainWorld('splash', {
  onProgress: on('splash:progress'),
});
