import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { io } from 'socket.io-client';
import RoomView from '../pages/RoomView';
import CharacterSheetPage from '../pages/CharacterSheetPage';
import { api } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuthStore } from '../store/useAuthStore';
import { useRoomStore } from '../store/useRoomStore';
import { theme } from '../theme';

const uniq = Date.now();

function renderWithProviders(ui) {
  return render(<MantineProvider theme={theme}>{ui}</MantineProvider>);
}

// Полностью независимая от React "сырая" сессия — свои куки (вручную, в
// обход общей cookie-обёртки на global.fetch, которая обслуживает
// React-рендер), свой сокет. Так можно по-настоящему проверить: видит ли
// один браузер (GM, отрисованный ниже) то, что сделал СОВСЕМ ДРУГОЙ
// пользователь, а не подделать это в рамках одной сессии.
async function createRawSession(username, password) {
  let cookie = '';
  async function request(path, options = {}) {
    const resp = await global.__rawFetch(`http://127.0.0.1:5000/api/v1${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options.headers || {}),
      },
    });
    const setCookie = resp.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return resp;
  }
  await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email: `${username}@t.com`, password }),
  });
  return { request, getCookie: () => cookie };
}

describe('комната: реальный мультиплеерный поток против настоящего бэкенда', () => {
  it('GM видит выбор активного персонажа и бросок кубика второго игрока в реальном времени по сокету', async () => {
    // GM — через тот же клиент, что использует React (общая cookie-обёртка
    // на global.fetch), чтобы дальнейший рендер комнаты был от его имени
    const gmUser = await api.post('/auth/register', {
      username: `gm${uniq}`, email: `gm${uniq}@t.com`, password: 'password123',
    });
    useAuthStore.setState({ user: gmUser, status: 'authenticated' });
    const gmCookie = await global.fetch.cookieJar.getCookieString('http://127.0.0.1:5000');
    const gmSocket = getSocket();
    gmSocket.io.opts.extraHeaders = { Cookie: gmCookie }; // withCredentials не работает в jsdom — тут нет настоящих браузерных кук
    gmSocket.connect();
    await new Promise((resolve) => {
      if (gmSocket.connected) resolve();
      else gmSocket.once('connect', resolve);
    });

    const room = await api.post('/rooms', { name: 'Тестовая таверна' });

    // второй игрок — полностью в обход React
    const player = await createRawSession(`player${uniq}`, 'password123');
    await player.request('/rooms/join', {
      method: 'POST', body: JSON.stringify({ invite_code: room.invite_code }),
    });

    const charResp = await player.request('/characters', {
      method: 'POST',
      body: JSON.stringify({ name: 'Феетест', sheet_data: { vitality: { hp_current: 12, hp_max: 20, ac: 15 } } }),
    });
    const playerCharId = (await charResp.json()).character.id;

    const playerSocket = io('http://127.0.0.1:5000', {
      extraHeaders: { Cookie: player.getCookie() },
      transports: ['polling'],
    });
    await new Promise((resolve) => playerSocket.on('connect', resolve));
    playerSocket.emit('join_room', { room_id: room.id });
    await new Promise((r) => setTimeout(r, 300));

    // теперь рендерим комнату от лица GM
    renderWithProviders(
      <MemoryRouter initialEntries={[`/room/${room.id}`]}>
        <Routes>
          <Route path="/room/:id" element={<RoomView />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Тестовая таверна')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(`player${uniq}`)).toBeInTheDocument());
    const playerCard = screen.getByText(`player${uniq}`).closest('.card');
    expect(within(playerCard).getByText('нет активного персонажа')).toBeInTheDocument();

    // игрок Б (вне React) выбирает активного персонажа через REST
    await player.request(`/rooms/${room.id}/active-character`, {
      method: 'PUT', body: JSON.stringify({ character_id: playerCharId }),
    });

    // GM должен увидеть это без перезагрузки — чисто по сокет-рассылке
    await waitFor(() => {
      expect(within(playerCard).getByText(/Феетест/)).toBeInTheDocument();
    }, { timeout: 5000 });

    // игрок Б кидает кубик напрямую по сокету — GM должен увидеть в логе
    playerSocket.emit('dice_roll', { room_id: room.id, formula: '1d20+3', character_id: playerCharId });
    await waitFor(() => {
      expect(screen.getByText(new RegExp(`player${uniq}`))).toBeInTheDocument();
    });

    playerSocket.disconnect();
    getSocket().disconnect();
  }, 20000);

  it('открытие своего персонажа (не в режиме просмотра) делает его активным и уводит броски на сервер', async () => {
    const user = userEvent.setup();

    const gmUser = await api.post('/auth/register', {
      username: `gm2${uniq}`, email: `gm2${uniq}@t.com`, password: 'password123',
    });
    useAuthStore.setState({ user: gmUser, status: 'authenticated' });
    const gmCookie = await global.fetch.cookieJar.getCookieString('http://127.0.0.1:5000');
    const gmSocket = getSocket();
    if (gmSocket.connected) gmSocket.disconnect(); // мог остаться подключён под другим пользователем из предыдущего теста
    gmSocket.io.opts.extraHeaders = { Cookie: gmCookie };
    gmSocket.connect();
    await new Promise((resolve) => gmSocket.once('connect', resolve));

    const room = await api.post('/rooms', { name: 'Автопереключение' });
    useRoomStore.getState().attachSocketListeners();
    await useRoomStore.getState().loadRoom(room.id);
    await new Promise((r) => setTimeout(r, 300));

    const charResp = await api.post('/characters', {
      name: 'ГМ-герой', sheet_data: { stats: { str: { score: 18, score_bonus: 0 } } },
    });
    const charId = charResp.character.id;

    // рендерим лист персонажа НЕ в режиме просмотра — обычное открытие карточки
    renderWithProviders(
      <MemoryRouter initialEntries={[`/characters/${charId}`]}>
        <Routes>
          <Route path="/characters/:id" element={<CharacterSheetPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByDisplayValue('ГМ-герой')).toBeInTheDocument());
    await waitFor(() => {
      expect(screen.getByText(/Играешь этим персонажем в «Автопереключение»/)).toBeInTheDocument();
    });

    // и это реально долетело до сервера как active_character_id, не только на экран
    await waitFor(async () => {
      const roomCheck = await api.get(`/rooms/${room.id}`);
      const myMember = roomCheck.members.find((m) => m.user_id === gmUser.id);
      expect(myMember.active_character?.id).toBe(charId);
    });

    // клик по "Проверка" Силы (мод +4, prof не влияет на голую проверку)
    // должен уйти на сервер, а не посчитаться локальным Math.random()
    const block = screen.getByRole('button', { name: 'открыть Сила' }).closest('[class*="Paper"]');
    const checkRow = within(block).getByText('Проверка').closest('[class*="Group"]');
    const rollButton = within(checkRow).getByText('+4').closest('button');
    await user.click(rollButton);

    await waitFor(async () => {
      const history = await api.get(`/rooms/${room.id}/dice-history`);
      const entry = history.rolls?.[0] || history[0];
      expect(entry).toBeDefined();
      expect(entry.character_id).toBe(charId);
      expect(entry.formula).toBe('1d20+4');
    }, { timeout: 5000 });

    gmSocket.disconnect();
  }, 20000);

  it('история бросков переживает повторную загрузку комнаты и показывает имя персонажа, а не логин', async () => {
    const gmUser = await api.post('/auth/register', {
      username: `gm3${uniq}`, email: `gm3${uniq}@t.com`, password: 'password123',
    });
    useAuthStore.setState({ user: gmUser, status: 'authenticated' });
    const gmCookie = await global.fetch.cookieJar.getCookieString('http://127.0.0.1:5000');
    const gmSocket = getSocket();
    if (gmSocket.connected) gmSocket.disconnect();
    gmSocket.io.opts.extraHeaders = { Cookie: gmCookie };
    gmSocket.connect();
    await new Promise((resolve) => gmSocket.once('connect', resolve));

    const room = await api.post('/rooms', { name: 'Тест истории фронт' });
    const charResp = await api.post('/characters', { name: 'Летописец', sheet_data: {} });
    await api.put(`/rooms/${room.id}/active-character`, { character_id: charResp.character.id });

    useRoomStore.getState().attachSocketListeners();
    await useRoomStore.getState().loadRoom(room.id);
    await new Promise((r) => setTimeout(r, 300));

    // бросок ДО рендера — та самая история, которая раньше терялась
    useRoomStore.getState().rollDice('1d20+2', charResp.character.id);
    await waitFor(() => expect(useRoomStore.getState().diceLog.length).toBe(1));
    expect(useRoomStore.getState().diceLog[0].character_name).toBe('Летописец');

    // имитируем "обновление страницы" — стор пересоздаёт diceLog с нуля,
    // а не просто продолжает копить его в памяти
    await useRoomStore.getState().loadRoom(room.id);

    renderWithProviders(
      <MemoryRouter initialEntries={[`/room/${room.id}`]}>
        <Routes>
          <Route path="/room/:id" element={<RoomView />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Тест истории фронт')).toBeInTheDocument());
    // на экране должно быть имя персонажа, а не логин gm3... — оно
    // встречается и в ростере, и в логе бросков, поэтому getAllByText
    await waitFor(() => expect(screen.getAllByText(/Летописец/).length).toBeGreaterThan(0));
    expect(screen.queryByText(new RegExp(`gm3${uniq}:`))).not.toBeInTheDocument();

    gmSocket.disconnect();
  }, 20000);

  it('открепление лога кубиков рендерит его в отдельный документ и получает живые обновления', async () => {
    const user = userEvent.setup();

    // jsdom не реализует сам Document PiP API — эмулируем минимально
    // достаточным моком: реальный отдельный document (createHTMLDocument
    // даёт полноценный DOM, с которым React работает как обычно) плюс
    // те методы окна, которые реально использует наш хук
    const pipListeners = {};
    const pipDoc = document.implementation.createHTMLDocument('PiP');
    const fakeWindow = {
      document: pipDoc,
      addEventListener: (type, cb) => { pipListeners[type] = cb; },
      removeEventListener: () => {},
      close: () => { pipListeners.pagehide?.(); },
    };
    window.documentPictureInPicture = { requestWindow: async () => fakeWindow };

    const gmUser = await api.post('/auth/register', {
      username: `gm4${uniq}`, email: `gm4${uniq}@t.com`, password: 'password123',
    });
    useAuthStore.setState({ user: gmUser, status: 'authenticated' });
    const gmCookie = await global.fetch.cookieJar.getCookieString('http://127.0.0.1:5000');
    const gmSocket = getSocket();
    if (gmSocket.connected) gmSocket.disconnect();
    gmSocket.io.opts.extraHeaders = { Cookie: gmCookie };
    gmSocket.connect();
    await new Promise((resolve) => gmSocket.once('connect', resolve));

    const room = await api.post('/rooms', { name: 'Тест открепления' });
    useRoomStore.getState().attachSocketListeners();
    await useRoomStore.getState().loadRoom(room.id);
    await new Promise((r) => setTimeout(r, 300));

    renderWithProviders(
      <MemoryRouter initialEntries={[`/room/${room.id}`]}>
        <Routes>
          <Route path="/room/:id" element={<RoomView />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Тест открепления')).toBeInTheDocument());

    await user.click(screen.getByText('⧉ открепить лог'));

    // лог должен пропасть со страницы и появиться в "отдельном" документе
    await waitFor(() => {
      expect(screen.getByText('Лог сейчас в отдельном окне.')).toBeInTheDocument();
      expect(pipDoc.body.textContent).toContain('Пока пусто');
    });

    // бросок ПОСЛЕ открепления должен появиться именно в открепленном
    // документе — тот же стор, то же соединение, без ручной синхронизации
    useRoomStore.getState().rollDice('1d20+1', null);
    await waitFor(() => {
      expect(pipDoc.body.textContent).toContain('1d20+1');
    });

    // закрытие окна должно вернуть лог обратно на страницу
    fakeWindow.close();
    await waitFor(() => {
      expect(screen.getByText('⧉ открепить лог')).toBeInTheDocument();
      expect(screen.getByText(/1d20\+1/)).toBeInTheDocument();
    });

    delete window.documentPictureInPicture;
    gmSocket.disconnect();
  }, 20000);
});
