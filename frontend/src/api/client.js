// Единая точка входа для REST-запросов. credentials:'include' зашито
// внутрь специально — та самая CORS-ловушка с сессионными куками, которую
// легко забыть в одном из десятков разбросанных по компонентам fetch().
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api/v1';

// сервер отдаёт url загруженных файлов как путь от корня ("/uploads/...",
// см. UPLOAD_DIR в backend/app/config.py) — это нужно достраивать до
// корневого origin бэкенда, а не API_BASE (у которого есть /api/v1), и уж
// точно не оставлять как есть: relative url в <img src> резолвится
// относительно текущей страницы, то есть в дев-режиме против vite (5173),
// где никакого /uploads нет
const API_ORIGIN = API_BASE.replace(/\/api\/v1\/?$/, '');

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const resp = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  // 204/no-content — не пытаемся парсить тело
  const data = resp.status === 204 ? null : await resp.json().catch(() => null);

  if (!resp.ok) {
    throw new ApiError(data?.error || `HTTP ${resp.status}`, resp.status);
  }
  return data;
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),

  // multipart — без JSON Content-Type, браузер сам проставит boundary
  postForm: async (path, formData) => {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: 'POST', credentials: 'include', body: formData,
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) throw new ApiError(data?.error || `HTTP ${resp.status}`, resp.status);
    return data;
  },
};

export { ApiError, API_BASE, API_ORIGIN };
