import { describe, it, expect } from 'vitest';
import { waitFor } from '@testing-library/react';
import { io } from 'socket.io-client';
import { api } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuthStore } from '../store/useAuthStore';
import { useBattleMapStore } from '../store/useBattleMapStore';

const uniq = Date.now();

// та же независимая "сырая" сессия, что и в battlemap.integration.test.jsx —
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

describe('туман войны: создание/редактирование/права доступа (стор, без рендера Konva)', () => {
  it('GM рисует фигуру тумана — она расходится всем, у не-GM мутации отклоняются, удаление и очистка синхронизируются', async () => {
    const gmUser = await api.post('/auth/register', {
      username: `gmfog${uniq}`, email: `gmfog${uniq}@t.com`, password: 'password123',
    });
    useAuthStore.setState({ user: gmUser, status: 'authenticated' });
    const gmCookie = await global.fetch.cookieJar.getCookieString('http://127.0.0.1:5000');
    const gmSocket = getSocket();
    if (gmSocket.connected) gmSocket.disconnect();
    gmSocket.io.opts.extraHeaders = { Cookie: gmCookie };
    gmSocket.connect();
    await new Promise((resolve) => gmSocket.once('connect', resolve));

    const room = await api.post('/rooms', { name: 'Тест тумана войны' });
    gmSocket.emit('join_room', { room_id: room.id });
    await new Promise((r) => setTimeout(r, 200));

    useBattleMapStore.getState().attachSocketListeners();
    await useBattleMapStore.getState().loadMaps(room.id);
    const mapId = useBattleMapStore.getState().mapId;
    expect(mapId).toBeTruthy();

    // независимый игрок в той же комнате — проверяем, что геометрия
    // тумана реально расходится по сокетам, а не просто эхо GM самому себе
    const player = await createRawSession(`playerfog${uniq}`, 'password123');
    await player.request('/rooms/join', { method: 'POST', body: JSON.stringify({ invite_code: room.invite_code }) });
    const playerSocket = io('http://127.0.0.1:5000', { extraHeaders: { Cookie: player.getCookie() }, transports: ['polling'] });
    await new Promise((resolve) => playerSocket.on('connect', resolve));
    playerSocket.emit('join_room', { room_id: room.id });
    const playerEvents = [];
    const playerErrors = [];
    playerSocket.on('fog_shape_added', (d) => playerEvents.push(d));
    playerSocket.on('fog_shape_removed', (d) => playerEvents.push(d));
    playerSocket.on('fog_cleared', (d) => playerEvents.push(d));
    playerSocket.on('error', (d) => playerErrors.push(d));
    await new Promise((r) => setTimeout(r, 300));

    // GM рисует прямоугольник тумана
    useBattleMapStore.getState().addFogShape(room.id, mapId, {
      shapeType: 'rect', x: 100, y: 100, width: 200, height: 150,
    });
    await waitFor(() => expect(Object.keys(useBattleMapStore.getState().fogShapes).length).toBe(1));
    const shape = Object.values(useBattleMapStore.getState().fogShapes)[0];
    expect(shape).toMatchObject({ shape_type: 'rect', pos_x: 100, pos_y: 100, width: 200, height: 150 });

    // независимый игрок должен получить ту же геометрию
    await waitFor(() => expect(playerEvents.some((e) => e.shape_type === 'rect')).toBe(true));

    // игрок пытается сам создать/удалить туман напрямую сокетом — сервер
    // должен отклонить (только GM может рисовать/редактировать туман)
    playerSocket.emit('fog_shape_add', {
      room_id: room.id, battle_map_id: mapId, shape_type: 'circle', pos_x: 0, pos_y: 0, width: 50, height: 50,
    });
    playerSocket.emit('fog_shape_remove', { room_id: room.id, shape_id: shape.id });
    await new Promise((r) => setTimeout(r, 300));
    expect(playerErrors.length).toBeGreaterThanOrEqual(2);
    // фигура не должна была быть удалена посторонним игроком
    expect(Object.keys(useBattleMapStore.getState().fogShapes).length).toBe(1);

    // GM двигает/ресайзит фигуру — коммит пишет в БД
    useBattleMapStore.getState().commitFogShapeTransform(room.id, shape.id, {
      pos_x: 300, pos_y: 300, width: 100, height: 80,
    });
    await waitFor(() => {
      const updated = useBattleMapStore.getState().fogShapes[shape.id];
      expect(updated).toMatchObject({ pos_x: 300, pos_y: 300, width: 100, height: 80 });
    });

    // персистентность — перезагрузка карты через REST должна вернуть тот
    // же туман (fog_shapes теперь часть ответа get_battle_map)
    useBattleMapStore.setState({ fogShapes: {} });
    await useBattleMapStore.getState().loadBattleMap(room.id, mapId);
    await waitFor(() => {
      const reloaded = useBattleMapStore.getState().fogShapes[shape.id];
      expect(reloaded).toMatchObject({ pos_x: 300, pos_y: 300, width: 100, height: 80 });
    });

    // GM удаляет фигуру — исчезает у обоих
    useBattleMapStore.getState().removeFogShape(room.id, shape.id);
    await waitFor(() => expect(Object.keys(useBattleMapStore.getState().fogShapes).length).toBe(0));
    await waitFor(() => expect(playerEvents.some((e) => e.shape_id === shape.id)).toBe(true));

    // "очистить весь туман" — GM рисует ещё две фигуры и чистит одной кнопкой
    useBattleMapStore.getState().addFogShape(room.id, mapId, { shapeType: 'circle', x: 0, y: 0, width: 60, height: 60 });
    useBattleMapStore.getState().addFogShape(room.id, mapId, { shapeType: 'triangle', x: 500, y: 500, width: 60, height: 60 });
    await waitFor(() => expect(Object.keys(useBattleMapStore.getState().fogShapes).length).toBe(2));
    useBattleMapStore.getState().clearAllFog(room.id, mapId);
    await waitFor(() => expect(Object.keys(useBattleMapStore.getState().fogShapes).length).toBe(0));
    await waitFor(() => expect(playerEvents.some((e) => e.battle_map_id === mapId)).toBe(true));

    playerSocket.disconnect();
    gmSocket.disconnect();
  }, 20000);
});
