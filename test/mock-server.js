'use strict';

// Gercek sunucuya dokunmadan protokolu dogrulamak icin AuthMe benzeri sahte sunucu.
// limbo: true -> gercek sunucu gibi: giris ekraninda saglik paketi yok (spawn olmaz),
// giristen sonra yeniden yapilandirma ile Lobi'ye aktarir.
const mc = require('minecraft-protocol');
const nbt = require('prismarine-nbt');

const PACK_UUID = '12345678-1234-5678-9abc-def012345678';

function startMockServer({
  version, port, password, registered = false, limbo = false, hub = false,
}) {
  const data = require('minecraft-data')(version);
  const Item = require('prismarine-item')(version);
  const server = mc.createServer({
    'online-mode': false,
    host: '127.0.0.1',
    port,
    version,
    motd: 'mock',
    maxPlayers: 10,
    // Varsayilan isleyici Error nesnesiyle atmaya calisir, sert kopmada baglanti kilitli kalir.
    errorHandler: (client) => client.socket?.destroy(),
  });

  const state = {
    registered, commands: [], chats: [], kick: null, clients: new Set(), knownPacks: 0, packReplies: 0, inLobby: false, inSurvival: false, respawns: 0,
  };

  const say = (client, text, isActionBar = false) => {
    client.write('system_chat', { content: nbt.comp({ text: nbt.string(text) }), isActionBar });
  };

  const giveItems = (client) => {
    const slot = (index, name, count) => {
      const item = new Item(data.itemsByName[name].id, count);
      client.write('set_slot', { windowId: 0, stateId: 1, slot: index, item: Item.toNotch(item) });
    };
    slot(36, 'diamond_sword', 1);
    slot(37, 'bread', 12);
    slot(9, 'cobblestone', 64);
  };

  const joinWorld = (client, withHealth) => {
    client.write('login', {
      ...data.loginPacket,
      entityId: client.id,
      isHardcore: false,
      maxPlayers: 10,
      enforcesSecureChat: false,
    });
    const spec = JSON.stringify(data.protocol.play.toClient.types.packet_position);
    client.write('position', {
      teleportId: 1, x: 0, y: 80, z: 0, dx: 0, dy: 0, dz: 0, yaw: 0, pitch: 0,
      flags: spec.includes('bitflags') ? {} : 0,
    });
    if (withHealth) client.write('update_health', { health: 20, food: 20, foodSaturation: 5 });
  };

  /** Velocity'nin limbodan Lobi'ye aktarimi. Fazladan paket gelirse gercekteki gibi atar. */
  const transferToLobby = (client, afterJoin = giveItems) => {
    // Sayaclar her gecis icin ayridir; yeniden baglanan oyuncu etkilenmemeli.
    state.knownPacks = 0;
    state.packReplies = 0;
    client.write('start_configuration', {});
    client.once('configuration_acknowledged', () => {
      client.state = 'configuration';
      client.on('select_known_packs', () => {
        state.knownPacks += 1;
      });
      client.write('select_known_packs', { packs: [] });
      setTimeout(() => {
        if (state.knownPacks > 1) {
          client.end('An internal server connection error occurred.');
          return;
        }
        // Gercek Survival gibi: dogru UUID ile "yuklendi" gelmeden gecis bitmez.
        client.on('resource_pack_receive', ({ uuid, result }) => {
          state.packReplies += 1;
          if (uuid === PACK_UUID && result === 0) client.write('finish_configuration', {});
        });
        client.write('add_resource_pack', {
          uuid: PACK_UUID, url: 'https://example.test/pack.zip', hash: '', forced: true,
        });
      }, 150);
      client.once('finish_configuration', () => {
        client.state = 'play';
        state.inLobby = true;
        joinWorld(client, true);
        afterJoin(client);
      });
    });
  };

  const namedItem = (name, customName) => ({
    itemCount: 1,
    itemId: data.itemsByName[name].id,
    addedComponentCount: 1,
    removedComponentCount: 0,
    components: [{ type: 'custom_name', data: nbt.comp({ text: nbt.string(customName) }) }],
    removeComponents: [],
  });

  /** Lobi: Oyun Menusu pusulasi; sag tik menu acar, tiklama Survival'a aktarir. */
  const giveLobbyMenu = (client) => {
    client.write('set_slot', { windowId: 0, stateId: 1, slot: 36, item: namedItem('compass', 'Oyun Menüsü') });
    client.on('use_item', () => {
      const items = Array.from({ length: 63 }, () => Item.toNotch(null));
      items[13] = namedItem('spyglass', 'ꜱᴜʀᴠɪᴠᴀʟ ɢᴀʀᴅ');
      client.write('open_window', { windowId: 1, inventoryType: 2, windowTitle: nbt.comp({ text: nbt.string('Menü') }) });
      client.write('window_items', { windowId: 1, stateId: 1, items, carriedItem: Item.toNotch(null) });
    });
    client.once('window_click', () => {
      transferToLobby(client, () => {
        state.inSurvival = true;
        client.write('set_slot', { windowId: 0, stateId: 2, slot: 36, item: Item.toNotch(null) });
      });
    });
    client.on('client_command', () => {
      client.write('update_health', { health: 20, food: 20, foodSaturation: 5 });
      state.respawns += 1;
    });
  };

  const authenticated = (client) => {
    if (hub) giveLobbyMenu(client);
    else if (limbo) transferToLobby(client);
    else giveItems(client);
  };

  server.on('playerJoin', (client) => {
    state.clients.add(client);
    client.on('end', () => state.clients.delete(client));
    client.on('error', (err) => {
      if (process.env.MOCK_DEBUG) console.log('[mock]', err.message);
    });

    joinWorld(client, !limbo);

    setTimeout(() => {
      if (state.registered) say(client, 'Lütfen giriş yap: /login <şifre>');
      else say(client, 'Lütfen kayıt ol: /register <şifre> <e-posta>');
    }, 200);

    client.on('chat_command', ({ command }) => handle(client, command));
    client.on('chat_command_signed', ({ command }) => handle(client, command));
    client.on('chat_message', ({ message }) => state.chats.push(message));
  });

  function handle(client, command) {
    state.commands.push(command);
    const [name, a, b] = command.split(' ');
    if (name === 'register') {
      state.registered = true;
      // Gercek sunucu gibi: /register <sifre> <e-posta>
      say(client, a === password && /^\S+@\S+\.\S+$/.test(b ?? '') ? 'Başarıyla kayıt oldun!' : 'Hata');
      authenticated(client);
    } else if (name === 'login') {
      if (a === password) {
        say(client, 'Başarıyla giriş yaptınız!');
        authenticated(client);
      } else {
        say(client, 'Yanlış şifre!');
      }
    }
  }

  return {
    state,
    killAll: () => {
      for (const c of state.clients) c.write('update_health', { health: 0, food: 20, foodSaturation: 5 });
    },
    kickAll: (reason) => {
      for (const c of state.clients) c.end(reason);
    },
    close: () => new Promise((resolve) => {
      server.once('close', resolve);
      server.close();
      setTimeout(resolve, 500);
    }),
  };
}

module.exports = { startMockServer };
