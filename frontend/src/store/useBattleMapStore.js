import { create } from 'zustand';
import { api } from '../api/client';
import { getSocket } from '../api/socket';

let listenersAttached = false;

export const useBattleMapStore = create((set, get) => ({
  mapId: null,
  gridSize: 50,
  width: 4000,
  height: 4000,
  tokens: {}, // { [id]: tokenData } — размещённые токены (template=false)
  templates: [], // представления обеих вкладок, kind различает 'pc'/'npc'
  isLoading: false,
  error: null,

  // список карт комнаты (для переключателя) и id активной — сама комната
  // может иметь несколько подготовленных GM карт, но одновременно у всех
  // участников открыта только одна, общая (см. battle_map_switch)
  maps: [], // [{ id, name }]
  activeMapId: null,

  // токен + персонаж, чей хотбар сейчас показан — выбирается кликом по
  // токену или по иконке в отряде. Токен нужен отдельно от character_id:
  // у двух инстансов одного NPC-представления (два одинаковых гоблина)
  // character_id совпадает, а вот кольцо дальности должно исходить именно
  // от того токена, по которому кликнули, а не от первого тёзки.
  controlledTokenId: null,
  controlledCharacterId: null,
  setControlled(tokenId, characterId) { set({ controlledTokenId: tokenId, controlledCharacterId: characterId }); },

  // действие в режиме прицеливания: { source: 'attack'|'spell'|'item',
  // data: сам объект действия, characterId }. null — прицеливания нет.
  activeAction: null,
  setActiveAction(action) { set({ activeAction: action }); },

  // режим курсора на плавающей панели справа: 'pan' — обычное
  // перемещение камеры (по умолчанию), 'ruler' — линейка, 'pointer' —
  // указатель, видимый остальным участникам комнаты
  activeTool: 'pan',
  setActiveTool(tool) { set({ activeTool: tool }); },

  // указатели ДРУГИХ участников — ключ user_id
  remotePointers: {},

  broadcastPointerMove(roomId, x, y) {
    getSocket().emit('pointer_move', { room_id: roomId, x, y });
  },

  clearPointer(roomId) {
    getSocket().emit('pointer_clear', { room_id: roomId });
  },

  // превью прицеливания ДРУГИХ участников — ключ character_id, чтобы не
  // путать разных кастующих одновременно
  remoteTargetPreviews: {},

  broadcastTargetPreview(roomId, characterId, actionName, x, y, aoe) {
    getSocket().emit('spell_target_preview', {
      room_id: roomId, character_id: characterId, action_name: actionName,
      target_x: x, target_y: y, aoe: aoe || null,
    });
  },

  clearTargetPreview(roomId, characterId) {
    getSocket().emit('spell_target_clear', { room_id: roomId, character_id: characterId });
  },

  async loadMaps(roomId) {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get(`/rooms/${roomId}/battle-maps`);
      set({ maps: data.maps, activeMapId: data.active_battle_map_id });
      if (data.active_battle_map_id) {
        await get().loadBattleMap(roomId, data.active_battle_map_id);
      } else {
        set({ isLoading: false });
      }
    } catch (e) {
      set({ error: e.message, isLoading: false });
    }
  },

  async loadBattleMap(roomId, mapId) {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get(`/rooms/${roomId}/battle-maps/${mapId}`);
      const tokens = {};
      data.objects.forEach((t) => { tokens[t.id] = t; });
      set({
        mapId: data.id, gridSize: data.grid_size, width: data.width, height: data.height,
        tokens, templates: data.templates, isLoading: false,
        // сбрасываем контроль/прицеливание/курсоры с прошлой карты — они
        // ссылаются на токены/персонажей, которых на новой карте может не быть
        controlledTokenId: null, controlledCharacterId: null, activeAction: null,
        remoteTargetPreviews: {}, remotePointers: {},
      });
    } catch (e) {
      set({ error: e.message, isLoading: false });
    }
  },

  async createMap(roomId, name) {
    await api.post(`/rooms/${roomId}/battle-maps`, { name });
    // локальный список maps обновится через сокет-эхо battle_map_created,
    // не трогаем стейт руками — тот же принцип, что и у остальных сущностей
  },

  async renameMap(roomId, mapId, name) {
    await api.put(`/rooms/${roomId}/battle-maps/${mapId}`, { name });
  },

  async deleteMap(roomId, mapId) {
    await api.delete(`/rooms/${roomId}/battle-maps/${mapId}`);
  },

  switchMap(roomId, mapId) {
    // без оптимистичного обновления — ждём battle_map_switched с сервера,
    // тот же принцип, что и у mode_change (не менять локальный стейт до
    // подтверждения)
    getSocket().emit('battle_map_switch', { room_id: roomId, battle_map_id: mapId });
  },

  createTemplate(roomId, { kind, characterId, label, imageUrl }) {
    getSocket().emit('template_create', {
      room_id: roomId, battle_map_id: get().mapId, kind,
      character_id: characterId || null, label: label || null, image_url: imageUrl || null,
    });
  },

  deleteTemplate(roomId, templateId) {
    getSocket().emit('template_delete', { room_id: roomId, template_id: templateId });
  },

  placeTemplate(roomId, templateId, x, y) {
    getSocket().emit('place_template', { room_id: roomId, template_id: templateId, pos_x: x, pos_y: y });
  },

  // оптимистично обновляем локально сразу — не ждём эха с сервера, чтобы
  // собственное перетаскивание не запаздывало на сетевой round-trip
  moveTokenLive(roomId, tokenId, x, y) {
    getSocket().emit('token_transform_live', { room_id: roomId, token_id: tokenId, pos_x: x, pos_y: y });
    set((state) => (
      state.tokens[tokenId]
        ? { tokens: { ...state.tokens, [tokenId]: { ...state.tokens[tokenId], pos_x: x, pos_y: y } } }
        : state
    ));
  },

  commitTokenTransform(roomId, tokenId, patch) {
    getSocket().emit('token_transform_commit', { room_id: roomId, token_id: tokenId, ...patch });
  },

  removeToken(roomId, tokenId) {
    getSocket().emit('token_remove', { room_id: roomId, token_id: tokenId });
  },

  setTokenLocked(roomId, tokenId, locked) {
    getSocket().emit('token_update_props', { room_id: roomId, token_id: tokenId, locked });
  },

  setTokenLayer(roomId, tokenId, layer) {
    getSocket().emit('token_update_props', { room_id: roomId, token_id: tokenId, layer });
  },

  attachSocketListeners() {
    if (listenersAttached) return;
    listenersAttached = true;
    const socket = getSocket();

    socket.on('token_added', (data) => {
      set((state) => ({ tokens: { ...state.tokens, [data.id]: data } }));
    });

    socket.on('token_removed', (data) => {
      set((state) => {
        const tokens = { ...state.tokens };
        delete tokens[data.token_id];
        const wasControlled = state.controlledTokenId === data.token_id;
        return {
          tokens,
          ...(wasControlled ? { controlledTokenId: null, controlledCharacterId: null } : {}),
        };
      });
    });

    socket.on('token_moved_live', (data) => {
      set((state) => (
        state.tokens[data.token_id]
          ? { tokens: { ...state.tokens, [data.token_id]: { ...state.tokens[data.token_id], pos_x: data.pos_x, pos_y: data.pos_y } } }
          : state
      ));
    });

    socket.on('token_moved_committed', (data) => {
      set((state) => (
        state.tokens[data.token_id]
          ? { tokens: { ...state.tokens, [data.token_id]: { ...state.tokens[data.token_id], ...data } } }
          : state
      ));
    });

    socket.on('token_props_updated', (data) => {
      set((state) => (
        state.tokens[data.token_id]
          ? { tokens: { ...state.tokens, [data.token_id]: { ...state.tokens[data.token_id], ...data } } }
          : state
      ));
    });

    // PUT /characters/<id> (например, правка листа в соседней вкладке)
    // рассылает это же событие всем комнатам, где персонаж активен — здесь
    // подхватываем его для токенов отряда на карте. hp_current/hp_max/ac
    // у не-instance токена и так вычисляются на бэке заново из
    // character.sheet_data при каждой загрузке карты (см. rooms/routes.py),
    // то есть это не боевое состояние токена, а просто отражение листа —
    // синхронизировать его живьём безопасно. instance-токены (клоны/призывы)
    // намеренно не трогаем: у них своя снятая копия sheet_data.
    socket.on('character_updated', (data) => {
      set((state) => {
        let changed = false;
        const tokens = { ...state.tokens };
        Object.keys(tokens).forEach((id) => {
          const t = tokens[id];
          if (t.character_id === data.character_id && !t.is_instance) {
            changed = true;
            tokens[id] = {
              ...t,
              character_name: data.name,
              hp_current: data.hp_current,
              hp_max: data.hp_max,
              ac: data.ac,
            };
          }
        });
        return changed ? { tokens } : state;
      });
    });

    socket.on('template_created', (data) => {
      set((state) => (
        state.templates.some((t) => t.id === data.id)
          ? state
          : { templates: [...state.templates, data] }
      ));
    });

    socket.on('template_deleted', (data) => {
      set((state) => ({ templates: state.templates.filter((t) => t.id !== data.template_id) }));
    });

    socket.on('spell_target_preview', (data) => {
      set((state) => ({
        remoteTargetPreviews: {
          ...state.remoteTargetPreviews,
          [data.character_id]: { actionName: data.action_name, targetX: data.target_x, targetY: data.target_y, aoe: data.aoe },
        },
      }));
    });

    socket.on('spell_target_clear', (data) => {
      set((state) => {
        const remoteTargetPreviews = { ...state.remoteTargetPreviews };
        delete remoteTargetPreviews[data.character_id];
        return { remoteTargetPreviews };
      });
    });

    socket.on('pointer_moved', (data) => {
      set((state) => ({
        remotePointers: {
          ...state.remotePointers,
          [data.user_id]: { x: data.x, y: data.y, username: data.username },
        },
      }));
    });

    socket.on('pointer_cleared', (data) => {
      set((state) => {
        const remotePointers = { ...state.remotePointers };
        delete remotePointers[data.user_id];
        return { remotePointers };
      });
    });

    socket.on('battle_map_created', (data) => {
      set((state) => (
        state.maps.some((m) => m.id === data.id)
          ? state
          : { maps: [...state.maps, { id: data.id, name: data.name }] }
      ));
    });

    socket.on('battle_map_renamed', (data) => {
      set((state) => ({
        maps: state.maps.map((m) => (m.id === data.id ? { ...m, name: data.name } : m)),
      }));
    });

    socket.on('battle_map_deleted', (data) => {
      set((state) => ({ maps: state.maps.filter((m) => m.id !== data.id) }));
      // если удалённая карта была активной, сервер уже переназначил
      // активную — подхватываем её, иначе просто чистим список выше
      if (get().activeMapId === data.id || get().activeMapId !== data.active_battle_map_id) {
        set({ activeMapId: data.active_battle_map_id });
        get().loadBattleMap(data.room_id, data.active_battle_map_id);
      }
    });

    socket.on('battle_map_switched', (data) => {
      set({ activeMapId: data.battle_map_id });
      get().loadBattleMap(data.room_id, data.battle_map_id);
    });
  },
}));
