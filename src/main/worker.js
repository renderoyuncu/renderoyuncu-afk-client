'use strict';

// Her hesap kendi utility process'inde calisir: bir botun cokmesi
// arayuzu ve diger hesaplari etkilemez.
const { BotSession } = require('../core/session');

let session = null;
const send = (type, payload) => process.parentPort.postMessage({ type, payload });

process.parentPort.on('message', ({ data }) => {
  const { type, payload } = data;
  switch (type) {
    case 'start':
      session = new BotSession(payload);
      session.on('status', (p) => send('status', p));
      session.on('log', (p) => send('log', p));
      session.on('stats', (p) => send('stats', p));
      session.on('inventory', (p) => send('inventory', p));
      session.on('registered', () => send('registered'));
      session.start();
      break;
    case 'stop':
      session?.stop();
      setTimeout(() => process.exit(0), 500);
      break;
    case 'chat':
      session?.sendChat(payload);
      break;
    case 'inventory':
      session?.inventoryAction(payload);
      break;
    case 'modes':
      session?.setModes(payload);
      break;
    case 'settings':
      if (session) session.settings = payload;
      break;
    default:
  }
});

process.on('uncaughtException', (err) => {
  send('log', { ts: Date.now(), kind: 'error', text: `Beklenmeyen hata: ${err.message}` });
});
process.on('unhandledRejection', (err) => {
  send('log', { ts: Date.now(), kind: 'error', text: `Beklenmeyen hata: ${err?.message ?? err}` });
});
