import { describe, it, expect } from 'vitest';
import { waitFor } from '@testing-library/react';
import { io } from 'socket.io-client';
import { api } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuthStore } from '../store/useAuthStore';
import { useBattleMapStore } from '../store/useBattleMapStore';

const uniq = Date.now();

// та же независимая "сырая" сессия, что и в room.integration.test.jsx —
// свои куки в обход общей cookie-обёртки на global.fetch, свой сокет
async function createRawSession(username, password) {
  let cookie = '';
  async function request(path, options = {}) {
    const resp = await global.__rawFetch(`http://127.0.0.1:5000/api/v1${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(options.headers || {}) },
    });
    const setCookie = resp.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return resp;
  }
  await request('/auth/register', { method: 'POST', body: JSON.stringify({ username, email: `${username}@t.com`, password }) });
  return { request, getCookie: () => cookie };
}

describe('боевая карта: представления и размещение токенов (стор, без рендера Konva)', () => {
  it('представления не расходуются при размещении, приватны для посторонних, но размещённый токен видят все', async () => {
    const gmUser = await api.post('/auth/register', {
      username: `gmmap${uniq}`, email: `gmmap${uniq}@t.com`, password: 'password123',
    });
    useAuthStore.setState({ user: gmUser, status: 'authenticated' });
    const gmCookie = await global.fetch.cookieJar.getCookieString('http://127.0.0.1:5000');
    const gmSocket = getSocket();
    if (gmSocket.connected) gmSocket.disconnect();
    gmSocket.io.opts.extraHeaders = { Cookie: gmCookie };
    gmSocket.connect();
    await new Promise((resolve) => gmSocket.once('connect', resolve));

    const room = await api.post('/rooms', { name: 'Тест карты' });
    gmSocket.emit('join_room', { room_id: room.id });
    await new Promise((r) => setTimeout(r, 200));

    const goblinChar = await api.post('/characters', {
      name: 'Гоблин-стор', sheet_data: { vitality: { hp_current: 7, hp_max: 7, ac: 12 } },
    });

    useBattleMapStore.getState().attachSocketListeners();
    await useBattleMapStore.getState().loadMaps(room.id);
    const mapId = useBattleMapStore.getState().mapId;
    expect(mapId).toBeTruthy();

    // второй, полностью независимый клиент (другой пользователь, другой
    // сокет) — проверяем, что события реально расходятся по комнате,
    // а не просто эхо в рамках одной сессии
    const player = await createRawSession(`playermap${uniq}`, 'password123');
    await player.request('/rooms/join', { method: 'POST', body: JSON.stringify({ invite_code: room.invite_code }) });
    const playerSocket = io('http://127.0.0.1:5000', { extraHeaders: { Cookie: player.getCookie() }, transports: ['polling'] });
    await new Promise((resolve) => playerSocket.on('connect', resolve));
    playerSocket.emit('join_room', { room_id: room.id });
    const playerEvents = [];
    playerSocket.on('template_created', (d) => playerEvents.push(d));
    playerSocket.on('token_added', (d) => playerEvents.push(d));
    await new Promise((r) => setTimeout(r, 300));

    // GM создаёт представление гоблина (вкладка npc, с привязкой листа)
    useBattleMapStore.getState().createTemplate(room.id, {
      kind: 'npc', characterId: goblinChar.character.id, label: 'Гоблин',
    });
    await waitFor(() => expect(useBattleMapStore.getState().templates.length).toBe(1));
    const template = useBattleMapStore.getState().templates[0];
    expect(template.kind).toBe('npc');

    // представление приватно — раз его создал GM, посторонний игрок НЕ
    // должен получить событие вообще (не просто скрыть в интерфейсе)
    await new Promise((r) => setTimeout(r, 400));
    expect(playerEvents.some((e) => e.kind === 'npc')).toBe(false);

    // размещаем ДВАЖДЫ — представление не должно расходоваться
    useBattleMapStore.getState().placeTemplate(room.id, template.id, 100, 100);
    await waitFor(() => expect(Object.keys(useBattleMapStore.getState().tokens).length).toBe(1));
    useBattleMapStore.getState().placeTemplate(room.id, template.id, 200, 200);
    await waitFor(() => expect(Object.keys(useBattleMapStore.getState().tokens).length).toBe(2));

    expect(useBattleMapStore.getState().templates.length).toBe(1); // представление осталось

    const placedTokens = Object.values(useBattleMapStore.getState().tokens);
    // npc-вкладка + привязанный персонаж -> ВСЕГДА независимый инстанс
    expect(placedTokens.every((t) => t.is_instance === true)).toBe(true);
    expect(placedTokens[0].id).not.toBe(placedTokens[1].id);

    // независимый клиент должен увидеть оба размещённых токена тоже
    await waitFor(() => {
      const tokenEvents = playerEvents.filter((e) => e.character_id === goblinChar.character.id && 'pos_x' in e);
      expect(tokenEvents.length).toBe(2);
    });

    playerSocket.disconnect();
    gmSocket.disconnect();
  }, 20000);

  it('прицеливание транслируется другим участникам и очищается по отмене', async () => {
    const gmUser = await api.post('/auth/register', {
      username: `gmaim${uniq}`, email: `gmaim${uniq}@t.com`, password: 'password123',
    });
    useAuthStore.setState({ user: gmUser, status: 'authenticated' });
    const gmCookie = await global.fetch.cookieJar.getCookieString('http://127.0.0.1:5000');
    const gmSocket = getSocket();
    if (gmSocket.connected) gmSocket.disconnect();
    gmSocket.io.opts.extraHeaders = { Cookie: gmCookie };
    gmSocket.connect();
    await new Promise((resolve) => gmSocket.once('connect', resolve));

    const room = await api.post('/rooms', { name: 'Тест прицеливания' });
    gmSocket.emit('join_room', { room_id: room.id });
    await new Promise((r) => setTimeout(r, 200));

    useBattleMapStore.getState().attachSocketListeners();
    await useBattleMapStore.getState().loadMaps(room.id);

    // второй независимый клиент слушает превью
    const player = await createRawSession(`playeraim${uniq}`, 'password123');
    await player.request('/rooms/join', { method: 'POST', body: JSON.stringify({ invite_code: room.invite_code }) });
    const playerSocket = io('http://127.0.0.1:5000', { extraHeaders: { Cookie: player.getCookie() }, transports: ['polling'] });
    await new Promise((resolve) => playerSocket.on('connect', resolve));
    playerSocket.emit('join_room', { room_id: room.id });
    const previews = [];
    const clears = [];
    playerSocket.on('spell_target_preview', (d) => previews.push(d));
    playerSocket.on('spell_target_clear', (d) => clears.push(d));
    await new Promise((r) => setTimeout(r, 300));

    // GM целится конусом — превью должно долететь до второго клиента
    // со всеми параметрами формы
    useBattleMapStore.getState().broadcastTargetPreview(
      room.id, 999, 'Огненный конус', 150, 250, { shape: 'cone', length: 30 },
    );
    await waitFor(() => expect(previews.length).toBe(1));
    expect(previews[0]).toMatchObject({
      character_id: 999, action_name: 'Огненный конус',
      target_x: 150, target_y: 250, aoe: { shape: 'cone', length: 30 },
    });

    // отмена прицеливания — очистка тоже должна долететь
    useBattleMapStore.getState().clearTargetPreview(room.id, 999);
    await waitFor(() => expect(clears.length).toBe(1));
    expect(clears[0].character_id).toBe(999);

    playerSocket.disconnect();
    gmSocket.disconnect();
  }, 20000);
});
