// src/utils/api.js
import { auth } from '../firebase/config';

const BASE_URL = process.env.REACT_APP_API_URL || '/api';

// Busca o token JWT do Firebase e injeta no header Authorization
async function getAuthHeaders() {
  const user = auth.currentUser;
  if (!user) return { 'Content-Type': 'application/json' };
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

async function request(method, path, body) {
  const headers = await getAuthHeaders();

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Usuários
  createUser: (data) => request('POST', '/users', data),
  getUser: (id) => request('GET', `/users/${id}`),

  // Buscas
  getSearches: (userId) => request('GET', `/searches${userId ? `?userId=${userId}` : ''}`),
  createSearch: (data) => request('POST', '/searches', data),
  updateSearch: (id, data) => request('PATCH', `/searches/${id}`, data),
  deleteSearch: (id, userId) => request('DELETE', `/searches/${id}?userId=${userId}`),
  getSearchHistory: (id, days = 30) => request('GET', `/searches/${id}/history?days=${days}`),

  // Alertas
  getAlerts: (userId) => request('GET', `/alerts${userId ? `?userId=${userId}` : ''}`),

  // Ferramentas
  interpretInput: (input) => request('POST', '/interpret', { input }),
  searchNow: (data) => request('POST', '/search-now', data),
  getDiscovery: (origin, limit = 5) => request('GET', `/discovery?origin=${origin}&limit=${limit}`),
  triggerCheck: () => request('POST', '/trigger-check'),
  getHealth: () => request('GET', '/health'),
};
