import { create } from 'zustand';
import { api, API_ORIGIN } from '../api/client';

let saveTimeout = null;

export const useCharacterStore = create((set, get) => ({
  characters: [],
  current: null,
  // комната, в контексте которой открыт чужой лист (GM редактирует
  // персонажа игрока) — null для обычной личной библиотеки. Нужна отдельно
  // от current, чтобы saveCurrent мог подставить тот же ?room_id, иначе
  // бэкенд не даст сохранить (см. characters/routes.py: _can_edit_character)
  editRoomId: null,
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

  async loadCharacter(id, roomId = null) {
    set({ isLoading: true, error: null, current: null, editRoomId: roomId });
    try {
      const query = roomId ? `?room_id=${roomId}` : '';
      const data = await api.get(`/characters/${id}${query}`);
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
  // без него сохраняется текущее состояние current как есть (для автосейва,
  // единственного реального вызывающего — все updateX ниже дебаунсят
  // saveCurrent() без аргументов, так что avatar_url обязан иметь тот же
  // фоллбэк на current.avatar_url, что и name/sheet_data, иначе он никогда
  // не попадёт в тело запроса и просто не сохранится)
  async saveCurrent(patch = {}) {
    const current = get().current;
    if (!current) return;
    set({ isSaving: true });
    try {
      const body = {
        name: patch.name ?? current.name,
        avatar_url: patch.avatar_url ?? current.avatar_url,
        sheet_data: patch.sheet_data ?? current.sheet_data,
      };
      const editRoomId = get().editRoomId;
      const query = editRoomId ? `?room_id=${editRoomId}` : '';
      const res = await api.put(`/characters/${current.id}${query}`, body);
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
    get().updateSheetFieldLocal(path, value);
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => { get().saveCurrent(); }, 800);
  },

  // То же самое, но без сохранения — для полей, которые сохраняются
  // по blur (см. flushSave), а не по дебаунсу на каждое нажатие клавиши
  // (длинные текстовые поля вроде описания снаряжения/предыстории:
  // дебаунс там гонял запрос на сервер за каждой паузой в наборе текста)
  updateSheetFieldLocal(path, value) {
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
  },

  // Отменяет отложенный автосейв и сохраняет немедленно — вызывается по
  // blur текстовых полей, которые копят изменения через updateSheetFieldLocal
  flushSave() {
    clearTimeout(saveTimeout);
    saveTimeout = null;
    get().saveCurrent();
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

  // загрузка картинки (аватар персонажа или иконка действия/предмета для
  // хотбара) — сам файл кладётся сервером в uploads/characters/<id>/,
  // здесь только получаем url; куда его записать (avatar_url или поле
  // внутри sheet_data) решает вызывающий компонент через onChange
  async uploadImage(file) {
    const { current, editRoomId } = get();
    if (!current) throw new Error('Нет открытого персонажа');
    const formData = new FormData();
    formData.append('file', file);
    const query = editRoomId ? `?room_id=${editRoomId}` : '';
    const { url } = await api.postForm(`/characters/${current.id}/images${query}`, formData);
    return `${API_ORIGIN}${url}`;
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

  // payload — уже разобранный объект {version, name, avatar_url, sheet_data};
  // разбор файла (и, для чужих форматов, конвертация в этот вид) — на вызывающей стороне
  async importCharacter(payload) {
    await api.post('/characters/import', payload);
    await get().loadCharacters();
  },

  clearError() { set({ error: null }); },
}));
