import { create } from 'zustand';
import { api } from '../api/client';

let saveTimeout = null;

export const useCharacterStore = create((set, get) => ({
  characters: [],
  current: null,
  isLoading: false,
  isSaving: false,
  lastSavedAt: null,
  error: null,

  async loadCharacters() {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get('/characters');
      set({ characters: data.characters, isLoading: false });
    } catch (e) {
      set({ error: e.message, isLoading: false });
    }
  },

  async loadCharacter(id) {
    set({ isLoading: true, error: null, current: null });
    try {
      const data = await api.get(`/characters/${id}`);
      set({ current: data, isLoading: false });
    } catch (e) {
      set({ error: e.message, isLoading: false });
    }
  },

  async createCharacter(name) {
    const data = await api.post('/characters', { name, sheet_data: {} });
    await get().loadCharacters();
    return data.character.id;
  },

  // patch — необязательный частичный override {name?, avatar_url?, sheet_data?};
  // без него сохраняется текущее состояние current как есть (для автосейва)
  async saveCurrent(patch = {}) {
    const current = get().current;
    if (!current) return;
    set({ isSaving: true });
    try {
      const body = {
        name: patch.name ?? current.name,
        sheet_data: patch.sheet_data ?? current.sheet_data,
      };
      if ('avatar_url' in patch) body.avatar_url = patch.avatar_url;
      const res = await api.put(`/characters/${current.id}`, body);
      set((state) => ({
        current: state.current ? { ...state.current, ...body, updated_at: res.character.updated_at } : state.current,
        isSaving: false,
        lastSavedAt: new Date(),
      }));
    } catch (e) {
      set({ error: e.message, isSaving: false });
    }
  },

  // path — массив ключей, например ['vitality', 'hp_current'].
  // Обновляет локально сразу (отзывчивый UI), сохранение на сервер —
  // с дебаунсом в 800мс, чтобы не слать запрос на каждую нажатую клавишу
  updateSheetField(path, value) {
    const current = get().current;
    if (!current) return;
    const sheet_data = structuredClone(current.sheet_data || {});
    let node = sheet_data;
    for (let i = 0; i < path.length - 1; i++) {
      if (node[path[i]] == null) node[path[i]] = {};
      node = node[path[i]];
    }
    node[path[path.length - 1]] = value;
    set({ current: { ...current, sheet_data } });

    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => { get().saveCurrent(); }, 800);
  },

  updateName(name) {
    set((state) => ({ current: state.current ? { ...state.current, name } : state.current }));
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => { get().saveCurrent(); }, 800);
  },

  updateAvatarUrl(avatar_url) {
    set((state) => ({ current: state.current ? { ...state.current, avatar_url } : state.current }));
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => { get().saveCurrent(); }, 800);
  },

  async deleteCharacter(id) {
    await api.delete(`/characters/${id}`);
    await get().loadCharacters();
  },

  async exportCharacter(id, name) {
    const data = await api.get(`/characters/${id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'character'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  async importCharacter(file) {
    const text = await file.text();
    const payload = JSON.parse(text);
    await api.post('/characters/import', payload);
    await get().loadCharacters();
  },

  clearError() { set({ error: null }); },
}));
