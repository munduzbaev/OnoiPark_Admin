const BASE_URL = (import.meta as any).env?.VITE_API_URL || 'https://onoipark-api.vercel.app/api';

let _token: string | null = null;

export const setToken = (token: string | null) => { _token = token; };
export const getToken = () => _token;

const buildHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  return headers;
};

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...buildHeaders(), ...(options.headers as Record<string, string> || {}) },
  });
  if (!res.ok) {
    let parsed: any = null;
    try { parsed = await res.json(); } catch { /* ignore */ }
    const detail = parsed?.detail;
    const message =
      (typeof detail === 'object' && detail?.message) ||
      (typeof detail === 'string' && detail) ||
      `HTTP ${res.status}: ${res.statusText}`;
    const err: any = new Error(message);
    err.status = res.status;
    err.code = (typeof detail === 'object' && detail?.code) || null;
    throw err;
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json() as Promise<T>;
  return {} as T;
}

export const api = {
  // Parkings
  getParkings: () =>
    apiFetch<{ parkings: any[] }>('/parkings').then(r =>
      Array.isArray((r as any).parkings) ? (r as any).parkings : (r as any)
    ),
  getParkingSpots: (id: string) =>
    apiFetch<{ spots: any[] }>(`/parkings/${id}/spots`).then(r =>
      Array.isArray((r as any).spots) ? (r as any).spots : (r as any)
    ),

  // Sessions
  getActiveSessions: () => apiFetch<any[]>('/sessions/all'),
  getAllSessions: () => apiFetch<any[]>('/sessions/all'),
  startSession: (data: object) =>
    apiFetch<any>('/sessions/start', { method: 'POST', body: JSON.stringify(data) }),
  endSession: (data: object) =>
    apiFetch<any>('/sessions/end', { method: 'POST', body: JSON.stringify(data) }),

  // Admin manual session control
  manualStart: (data: object) =>
    apiFetch<any>('/admin/sessions/manual-start', { method: 'POST', body: JSON.stringify(data) }),
  manualEnd: (data: object) =>
    apiFetch<any>('/admin/sessions/manual-end', { method: 'POST', body: JSON.stringify(data) }),

  // Bookings
  getBookings: () =>
    apiFetch<{ bookings: any[] }>('/bookings/list').then(r =>
      Array.isArray((r as any).bookings) ? (r as any).bookings : (r as any)
    ),
  createBooking: (data: object) =>
    apiFetch<any>('/bookings/create', { method: 'POST', body: JSON.stringify(data) }),
  cancelBooking: (data: object) =>
    apiFetch<any>('/bookings/cancel', { method: 'POST', body: JSON.stringify(data) }),

  // History
  getHistory: (params?: string) =>
    apiFetch<{ history: any[] }>(`/history${params ? '?' + params : ''}`).then(r =>
      Array.isArray((r as any).history) ? (r as any).history : (r as any)
    ),
  getAllUsers: () => apiFetch<any[]>('/history/all'),

  // User
  getUserProfile: () => apiFetch<any>('/user/profile'),
  updateSettings: (data: object) =>
    apiFetch<any>('/user/update-settings', { method: 'POST', body: JSON.stringify(data) }),
  deleteAccount: () =>
    apiFetch<any>('/user/delete-account', { method: 'DELETE' }),

  // QR
  generateQR: () =>
    apiFetch<{ token: string; expiresAt: string }>('/qr/generate'),
  validateQR: (data: { token: string; parkingId: string; spotNumber?: number }) =>
    apiFetch<{ action: 'entry' | 'exit'; sessionId: string; cost?: number; message: string }>(
      '/qr/validate',
      { method: 'POST', body: JSON.stringify(data) }
    ),
};
