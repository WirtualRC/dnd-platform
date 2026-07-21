import { create } from 'zustand';
import { api } from '../api/client';
import { getSocket } from '../api/socket';

export const useAuthStore = create((set) => ({
  user: null,
  status: 'idle', // idle | loading | authenticated | anonymous
  error: null,

  async checkSession() {
    set({ status: 'loading' });
    try {
      const me = await api.get('/auth/me');
      set({ user: me, status: 'authenticated', error: null });
      getSocket().connect();
    } catch {
      set({ user: null, status: 'anonymous' });
    }
  },

  async login(username, password) {
    set({ error: null });
    try {
      const user = await api.post('/auth/login', { username, password });
      set({ user, status: 'authenticated' });
      getSocket().connect();
      return true;
    } catch (e) {
      set({ error: e.message });
      return false;
    }
  },

  async register(username, email, password) {
    set({ error: null });
    try {
      const user = await api.post('/auth/register', { username, email, password });
      set({ user, status: 'authenticated' });
      getSocket().connect();
      return true;
    } catch (e) {
      set({ error: e.message });
      return false;
    }
  },

  async logout() {
    try { await api.post('/auth/logout'); } catch { /* всё равно разлогиниваем локально */ }
    getSocket().disconnect();
    set({ user: null, status: 'anonymous' });
  },

  clearError() { set({ error: null }); },
}));
