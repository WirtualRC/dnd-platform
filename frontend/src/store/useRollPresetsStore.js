import { create } from 'zustand';
import { api } from '../api/client';

export const useRollPresetsStore = create((set) => ({
  presets: [],
  isLoading: false,
  error: null,

  async loadPresets(characterId) {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get(`/characters/${characterId}/roll-presets`);
      set({ presets: data.presets, isLoading: false });
    } catch (e) {
      set({ error: e.message, isLoading: false });
    }
  },

  async createPreset(characterId, { name, color, webhook_url }) {
    const data = await api.post(`/characters/${characterId}/roll-presets`, { name, color, webhook_url });
    set((state) => ({ presets: [...state.presets, data.preset] }));
    return data.preset;
  },

  async updatePreset(presetId, { name, color, webhook_url }) {
    const data = await api.put(`/characters/roll-presets/${presetId}`, { name, color, webhook_url });
    set((state) => ({
      presets: state.presets.map((p) => (p.id === presetId ? { ...p, ...data.preset } : p)),
    }));
    return data.preset;
  },

  async deletePreset(presetId) {
    await api.delete(`/characters/roll-presets/${presetId}`);
    set((state) => ({ presets: state.presets.filter((p) => p.id !== presetId) }));
  },

  async togglePreset(characterId, presetId, enabled) {
    // оптимистично обновляем локально — сервер подтвердит тем же значением
    set((state) => ({
      presets: state.presets.map((p) => (p.id === presetId ? { ...p, enabled } : p)),
    }));
    try {
      await api.put(`/characters/${characterId}/roll-presets/${presetId}/toggle`, { enabled });
    } catch (e) {
      // откатываем при ошибке
      set((state) => ({
        presets: state.presets.map((p) => (p.id === presetId ? { ...p, enabled: !enabled } : p)),
      }));
      throw e;
    }
  },

  async testPreset({ webhook_url, color }) {
    await api.post('/characters/roll-presets/test', { webhook_url, color });
  },

  clearError() { set({ error: null }); },
}));
