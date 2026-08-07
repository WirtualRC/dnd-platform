import { create } from 'zustand';
import { notifications } from '@mantine/notifications';
import { api } from '../api/client';
import { getSocket } from '../api/socket';
import { useAuthStore } from './useAuthStore';
import { shiftPendingRollLabel } from '../utils/pendingRollLabels';
import { shiftPendingRollEffect } from '../utils/pendingRollEffects';
import { wrapCritLabel } from '../utils/critLabel';

let listenersAttached = false;

export const useRoomStore = create((set, get) => ({
  myRooms: [],
  current: null, // { id, name, invite_code, mode, gm_id, members }
  diceLog: [],
  isLoading: false,
  error: null,

  // персонаж, чьи броски с листа персонажа сейчас транслируются в
  // комнату — выставляется страницей листа персонажа (см. CharacterSheetPage),
  // не самим стором комнаты
  broadcastCharacterId: null,
  setBroadcastCharacter(characterId) { set({ broadcastCharacterId: characterId }); },

  async loadMyRooms() {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get('/rooms');
      set({ myRooms: data.rooms, isLoading: false });
    } catch (e) {
      set({ error: e.message, isLoading: false });
    }
  },

  async createRoom(name) {
    const room = await api.post('/rooms', { name });
    await get().loadMyRooms();
    return room.id;
  },

  async joinRoom(inviteCode) {
    const room = await api.post('/rooms/join', { invite_code: inviteCode });
    await get().loadMyRooms();
    return room.id;
  },

  async loadRoom(roomId) {
    set({ isLoading: true, error: null, current: null, diceLog: [] });
    try {
      const [room, history] = await Promise.all([
        api.get(`/rooms/${roomId}`),
        api.get(`/rooms/${roomId}/dice-history`),
      ]);
      // бэкенд отдаёт от старых к новым, у нас лог новые сверху — разворачиваем
      set({ current: room, diceLog: [...history.rolls].reverse(), isLoading: false });
      getSocket().emit('join_room', { room_id: roomId });
    } catch (e) {
      set({ error: e.message, isLoading: false });
    }
  },

  async setActiveCharacter(characterId) {
    const room = get().current;
    if (!room) return;
    try {
      await api.put(`/rooms/${room.id}/active-character`, { character_id: characterId });
      // сервер сам разошлёт active_character_changed по сокету всем,
      // включая нас — локально стейт руками не трогаем
    } catch (e) {
      set({ error: e.message });
    }
  },

  setMode(mode) {
    const room = get().current;
    if (!room) return;
    getSocket().emit('mode_change', { room_id: room.id, mode });
  },

  rollDice(formula, characterId, label) {
    const room = get().current;
    if (!room) return;
    getSocket().emit('dice_roll', { room_id: room.id, formula, character_id: characterId || null, label });
  },

  clearError() { set({ error: null }); },

  // --- сокет-слушатели: комнатное состояние живёт независимо от того,
  // какой конкретно компонент сейчас смонтирован, поэтому подписка/отписка
  // на уровне стора, а не отдельного React-компонента ---
  attachSocketListeners() {
    if (listenersAttached) return;
    listenersAttached = true;
    const socket = getSocket();

    socket.on('dice_roll', (data) => {
      set((state) => ({ diceLog: [data, ...state.diceLog].slice(0, 50) }));

      // это мой собственный бросок, реально подтверждённый сервером —
      // если он пришёл из broadcast-контекста листа персонажа (см.
      // utils/roll.js), там был подписан лейбл, покажем тост с ним.
      // Если лейбла нет — это бросок из собственного кубика комнаты,
      // он и так уже виден в логе, отдельный тост был бы просто шумом.
      const me = useAuthStore.getState().user;
      if (me && data.user === me.username) {
        // очередь эффектов (например, лечение зельем) проверяется первой —
        // такие броски не должны ещё и всплывать генерическим тостом лейбла
        const effect = shiftPendingRollEffect();
        if (effect) {
          effect(data.result, data.breakdown);
        } else {
          const label = shiftPendingRollLabel();
          if (label) {
            notifications.show({
              title: wrapCritLabel(label, data.result, data.natural),
              message: `${data.breakdown} = ${data.result}`,
              color: 'lssBlue',
              autoClose: 4000,
            });
          }
        }
      }
    });

    socket.on('mode_changed', (data) => {
      set((state) => (
        state.current && state.current.id === data.room_id
          ? { current: { ...state.current, mode: data.mode } }
          : state
      ));
    });

    // новый участник вошёл в комнату — добавляем его в ростер на месте,
    // без этого он появлялся бы у остальных только после перезагрузки
    socket.on('room_joined', (data) => {
      set((state) => {
        if (!state.current || state.current.id !== data.room_id) return state;
        const exists = state.current.members.some((m) => m.user_id === data.user_id);
        const members = exists
          ? state.current.members.map((m) => (m.user_id === data.user_id ? { ...m, ...data } : m))
          : [...state.current.members, { user_id: data.user_id, username: data.username, role: data.role, active_character: data.active_character }];
        return { current: { ...state.current, members } };
      });
    });

    socket.on('active_character_changed', (data) => {
      set((state) => {
        if (!state.current || state.current.id !== data.room_id) return state;
        const members = state.current.members.map((m) => (
          m.user_id === data.user_id ? { ...m, active_character: data.active_character } : m
        ));
        return { current: { ...state.current, members } };
      });
    });

    // обычный PUT /characters/<id> (например, из редактора листа в другой
    // вкладке) рассылает это же событие — ростер обновляется, даже если
    // правка пришла не из этой комнаты
    socket.on('character_updated', (data) => {
      set((state) => {
        if (!state.current) return state;
        const members = state.current.members.map((m) => (
          m.active_character?.id === data.character_id
            ? { ...m, active_character: { ...m.active_character, ...data } }
            : m
        ));
        return { current: { ...state.current, members } };
      });
    });

    socket.on('character_state_changed', (data) => {
      set((state) => {
        if (!state.current) return state;
        const members = state.current.members.map((m) => (
          m.active_character?.id === data.character_id
            ? { ...m, active_character: { ...m.active_character, ...data.vitality_patch } }
            : m
        ));
        return { current: { ...state.current, members } };
      });
    });
  },
}));
