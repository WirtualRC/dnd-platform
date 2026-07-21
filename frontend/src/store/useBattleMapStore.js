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

  async loadBattleMap(roomId) {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get(`/rooms/${roomId}/battle-map`);
      const tokens = {};
      data.objects.forEach((t) => { tokens[t.id] = t; });
      set({
        mapId: data.id, gridSize: data.grid_size, width: data.width, height: data.height,
        tokens, templates: data.templates, isLoading: false,
      });
    } catch (e) {
      set({ error: e.message, isLoading: false });
    }
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
  },
}));
