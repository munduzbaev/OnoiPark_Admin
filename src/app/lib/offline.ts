import { OfflineSession } from './types';

export const OFFLINE_KEYS = {
  sessions: 'offline_sessions',
  bookings: 'offline_bookings',
  log: 'offline_log',
};

export function getOfflineSessions(): OfflineSession[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_KEYS.sessions) || '[]');
  } catch {
    return [];
  }
}

export function saveOfflineSession(session: OfflineSession): void {
  const sessions = getOfflineSessions();
  sessions.push(session);
  localStorage.setItem(OFFLINE_KEYS.sessions, JSON.stringify(sessions));
}

export function updateOfflineSession(id: string, updates: Partial<OfflineSession>): void {
  const sessions = getOfflineSessions().map(s =>
    s.id === id ? { ...s, ...updates } : s
  );
  localStorage.setItem(OFFLINE_KEYS.sessions, JSON.stringify(sessions));
}

export function deleteOfflineSession(id: string): void {
  const sessions = getOfflineSessions().filter(s => s.id !== id);
  localStorage.setItem(OFFLINE_KEYS.sessions, JSON.stringify(sessions));
}

export function getUnsyncedSessions(): OfflineSession[] {
  return getOfflineSessions().filter(s => !s.synced);
}

export function markSessionsSynced(ids: string[]): void {
  const sessions = getOfflineSessions().map(s =>
    ids.includes(s.id) ? { ...s, synced: true } : s
  );
  localStorage.setItem(OFFLINE_KEYS.sessions, JSON.stringify(sessions));
}

export function clearOfflineData(): void {
  Object.values(OFFLINE_KEYS).forEach(k => localStorage.removeItem(k));
}

export function generateOfflineId(): string {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function calcCost(startTime: string, pricePerHour: number, freeMins = 60): number {
  const diffMs = Date.now() - new Date(startTime).getTime();
  const diffMins = diffMs / 60000;
  if (diffMins <= freeMins) return 0;
  return Math.round(((diffMins - freeMins) / 60) * pricePerHour);
}

export function formatDuration(startTime: string, endTime?: string): string {
  const end = endTime ? new Date(endTime) : new Date();
  const diff = Math.floor((end.getTime() - new Date(startTime).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
