/**
 * KPPMonitor.tsx — Monitor screen mounted above the barrier.
 *
 * Primary display: free spots count (large, colour-coded) + clock.
 * Event overlay: on entry (status→active) shows GREEN "ДОСТУП РАЗРЕШЁН" + plate + spot for 5 s,
 *                on exit (status→exiting/completed) shows BLUE "ВЫЕЗД" + plate + spot for 5 s.
 *
 * Plate/name resolution: via API (/admin/sessions/all) — NOT direct Supabase REST (406).
 * Requires the operator to open /monitor in a browser where the admin is logged in.
 * Falls back to spot + direction only when the token is absent or the API returns 401/403.
 *
 * URL: /monitor?parking=<id>   (defaults to parking-1)
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import React from 'react';
import { api } from '../lib/api';

// ── Supabase (realtime + free-spots only) ────────────────────────────────────
const SUPABASE_URL = 'https://rhckohqfbvkeinsqyesh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoY2tvaHFmYnZrZWluc3F5ZXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzNzkxNTAsImV4cCI6MjA3Njk1NTE1MH0.1yDwTdLJV1titZ7V-GzEQb-2e64FxFT-Me3PiqRCfBg';
const PARKING_API = 'https://onoipark-api.vercel.app/api';

const parkingId =
  new URLSearchParams(window.location.search).get('parking') || 'parking-1';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Types ─────────────────────────────────────────────────────────────────────
type EventType = 'entry' | 'exit';

interface ParkingEvent {
  type: EventType;
  plateNumber: string;
  driverName?: string;
  spotNumber?: number;
  cost?: number;
  timestamp: string;
}

interface SpotsInfo {
  free: number;
  total: number;
}

interface CachedSession {
  plate: string;
  name?: string;
  spot?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(date: Date) {
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDate(date: Date) {
  return date.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function KPPMonitor() {
  const [currentEvent, setCurrentEvent] = useState<ParkingEvent | null>(null);
  const [spotsInfo, setSpotsInfo] = useState<SpotsInfo | null>(null);
  const [clock, setClock] = useState(new Date());
  const [isConnected, setIsConnected] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cache plate/name per session id so EXIT can reuse what was fetched at ENTRY
  const sessionCache = useRef<Map<string, CachedSession>>(new Map());

  // ── Clock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch free spots ─────────────────────────────────────────────────────
  const loadSpots = useCallback(async () => {
    try {
      const res = await fetch(`${PARKING_API}/parkings/${parkingId}/spots`);
      const data = await res.json();
      const spots: any[] = data.spots || [];
      setSpotsInfo({
        free: spots.filter((s: any) => s.status === 'available').length,
        total: spots.length,
      });
    } catch {
      // stale display is acceptable
    }
  }, []);

  useEffect(() => {
    loadSpots();
    const id = setInterval(loadSpots, 10000);
    return () => clearInterval(id);
  }, [loadSpots]);

  // ── Show overlay event, reset 5 s timer ──────────────────────────────────
  const showEvent = useCallback((event: ParkingEvent) => {
    setCurrentEvent(event);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setCurrentEvent(null), 5000);
  }, []);

  // ── Resolve plate/name for ENTRY via /admin/sessions/all ─────────────────
  const resolveEntry = useCallback(async (sessionId: string, fallbackSpot?: number): Promise<CachedSession | null> => {
    try {
      const sessions: any[] = await api.getActiveSessions();
      const match = sessions.find((s: any) => s.id === sessionId);
      if (match) {
        const cached: CachedSession = {
          plate: match.plateNumber || '',
          name: match.driverName || undefined,
          spot: match.spotNumber ?? fallbackSpot,
        };
        sessionCache.current.set(sessionId, cached);
        return cached;
      }
    } catch (err) {
      console.warn('[Monitor] Could not resolve plate via API (no token / 401?):', err);
    }
    return null;
  }, []);

  // ── Resolve plate/name for EXIT — cache first, then history ──────────────
  const resolveExit = useCallback(async (
    sessionId: string,
    fallbackSpot?: number,
    cost?: number,
  ): Promise<CachedSession | null> => {
    // Try cache from the corresponding ENTRY event
    const cached = sessionCache.current.get(sessionId);
    if (cached) return { ...cached, spot: cached.spot ?? fallbackSpot };

    // Session may no longer be in active list; try history
    try {
      const result: any = await api.getHistory();
      const list: any[] = Array.isArray(result) ? result : result.history || [];
      const match = list.find((s: any) => s.id === sessionId);
      if (match) {
        return {
          plate: match.plateNumber || '',
          name: match.driverName || undefined,
          spot: match.spotNumber ?? fallbackSpot,
        };
      }
    } catch (err) {
      console.warn('[Monitor] Could not resolve exit plate via history:', err);
    }
    return null;
  }, []);

  // ── Realtime: parking_sessions → spots refresh + entry/exit overlay ───────
  useEffect(() => {
    const channel = supabase
      .channel('monitor-sessions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'parking_sessions',
          filter: `parking_id=eq.${parkingId}`,
        },
        async (payload) => {
          loadSpots();

          const ev = payload.eventType;
          const row = payload.new as any;
          if (!row) return;

          const sessionId: string = row.id || '';
          const fallbackSpot: number | undefined = row.spot_number ?? undefined;

          if (row.status === 'active' && (ev === 'INSERT' || ev === 'UPDATE')) {
            const info = await resolveEntry(sessionId, fallbackSpot);
            showEvent({
              type: 'entry',
              plateNumber: info?.plate || '',
              driverName: info?.name,
              spotNumber: info?.spot ?? fallbackSpot,
              timestamp: new Date().toISOString(),
            });
          } else if (
            (row.status === 'exiting' || row.status === 'completed') &&
            ev === 'UPDATE'
          ) {
            const cost: number | undefined =
              row.cost != null ? parseFloat(row.cost) : undefined;
            const info = await resolveExit(sessionId, fallbackSpot, cost);
            showEvent({
              type: 'exit',
              plateNumber: info?.plate || '',
              driverName: info?.name,
              spotNumber: info?.spot ?? fallbackSpot,
              cost,
              timestamp: new Date().toISOString(),
            });
          }
        }
      )
      .subscribe((status) => setIsConnected(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadSpots, showEvent, resolveEntry, resolveExit]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isEntry = currentEvent?.type === 'entry';
  const hasEvent = currentEvent !== null;

  const freeColor =
    spotsInfo === null
      ? '#64748b'
      : spotsInfo.free === 0
        ? '#ef4444'
        : spotsInfo.free <= 2
          ? '#f59e0b'
          : '#10b981';

  const overlayAccent = isEntry ? '#10b981' : '#3b82f6';
  const overlayBg = isEntry ? '#f0fdf4' : '#eff6ff';
  const overlayBgCircle1 = isEntry
    ? 'rgba(16,185,129,0.12)'
    : 'rgba(59,130,246,0.12)';
  const overlayBgCircle2 = isEntry
    ? 'rgba(16,185,129,0.08)'
    : 'rgba(59,130,246,0.08)';

  // Plate display: if empty → show only spot + direction (graceful fallback)
  const hasPlate = Boolean(currentEvent?.plateNumber);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: '100vh',
        background: hasEvent ? overlayBg : '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Syne', 'Inter', sans-serif",
        transition: 'background 0.4s ease',
        position: 'relative',
        overflow: 'hidden',
        padding: '40px',
      }}
    >
      {/* Decorative background circles */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', width: '600px', height: '600px', borderRadius: '50%',
          top: '-200px', left: '-200px',
          background: hasEvent ? overlayBgCircle1 : 'rgba(59,130,246,0.10)',
          transition: 'background 0.4s ease',
        }} />
        <div style={{
          position: 'absolute', width: '400px', height: '400px', borderRadius: '50%',
          bottom: '-100px', right: '-100px',
          background: hasEvent ? overlayBgCircle2 : 'rgba(99,102,241,0.08)',
          transition: 'background 0.4s ease',
        }} />
      </div>

      {/* Connection status */}
      <div style={{ position: 'absolute', top: '24px', right: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: '10px', height: '10px', borderRadius: '50%',
          background: isConnected ? '#10b981' : '#6b7280',
          boxShadow: isConnected ? '0 0 8px #10b981' : 'none',
          animation: isConnected ? 'blink 2s infinite' : 'none',
        }} />
        <span style={{ color: '#4b5563', fontSize: '13px' }}>
          {isConnected ? 'Подключено' : 'Нет связи'}
        </span>
      </div>

      {/* Logo */}
      <div style={{ position: 'absolute', top: '24px', left: '32px' }}>
        <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.5px', color: '#0f172a' }}>
          Onoi<span style={{ color: '#10b981' }}>Park</span>
        </span>
      </div>

      {/* Main content */}
      <div style={{ textAlign: 'center', zIndex: 1 }}>

        {/* ── EVENT OVERLAY ──────────────────────────────────────────────── */}
        {hasEvent && currentEvent ? (
          <div style={{ animation: 'fadeIn 0.35s ease' }}>
            {/* Headline */}
            <div style={{
              fontSize: 'clamp(28px, 5vw, 64px)',
              fontWeight: 900,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: overlayAccent,
              marginBottom: '32px',
              textShadow: `0 0 60px ${overlayAccent}44`,
            }}>
              {isEntry ? 'ДОСТУП РАЗРЕШЁН' : 'ВЫЕЗД'}
            </div>

            {/* Plate number — only if resolved */}
            {hasPlate && (
              <div style={{
                fontSize: 'clamp(40px, 8vw, 100px)',
                fontWeight: 800,
                letterSpacing: '6px',
                fontFamily: 'monospace',
                color: '#0f172a',
                background: 'rgba(255,255,255,0.95)',
                border: `3px solid ${overlayAccent}`,
                borderRadius: '20px',
                padding: '20px 48px',
                display: 'inline-block',
                marginBottom: '28px',
                boxShadow: `0 12px 40px ${overlayAccent}22`,
                animation: isEntry ? 'platePulse 1.5s ease-in-out infinite' : undefined,
              }}>
                {currentEvent.plateNumber}
              </div>
            )}

            {/* Spot number */}
            {currentEvent.spotNumber != null && (
              <div style={{
                fontSize: 'clamp(20px, 3.5vw, 42px)',
                fontWeight: 700,
                color: overlayAccent,
                marginBottom: '16px',
              }}>
                Место №{currentEvent.spotNumber}
              </div>
            )}

            {/* Driver name */}
            {currentEvent.driverName && (
              <div style={{
                fontSize: 'clamp(16px, 2.5vw, 30px)',
                color: '#64748b',
                fontWeight: 500,
                marginBottom: '12px',
              }}>
                {currentEvent.driverName}
              </div>
            )}

            {/* Cost on exit */}
            {!isEntry && currentEvent.cost != null && currentEvent.cost > 0 && (
              <div style={{
                fontSize: 'clamp(16px, 2.5vw, 28px)',
                color: '#64748b',
                fontWeight: 500,
              }}>
                {currentEvent.cost.toFixed(0)} сом
              </div>
            )}
          </div>
        ) : (
          /* ── IDLE STATE ────────────────────────────────────────────────── */
          <>
            {/* PRIMARY: free spots */}
            <div style={{ marginBottom: '48px' }}>
              <div style={{
                fontSize: 'clamp(13px, 1.8vw, 18px)',
                color: '#475569',
                letterSpacing: '4px',
                textTransform: 'uppercase',
                fontFamily: 'monospace',
                marginBottom: '12px',
              }}>
                СВОБОДНЫХ МЕСТ
              </div>

              <div style={{
                fontSize: 'clamp(96px, 18vw, 200px)',
                fontWeight: 900,
                lineHeight: 1,
                color: freeColor,
                transition: 'color 0.4s ease',
              }}>
                {spotsInfo !== null ? spotsInfo.free : '–'}
              </div>

              {spotsInfo !== null && (
                <div style={{
                  fontSize: 'clamp(16px, 2.5vw, 28px)',
                  color: '#94a3b8',
                  marginTop: '8px',
                }}>
                  из {spotsInfo.total}
                </div>
              )}
            </div>

            {/* SECONDARY: clock + date */}
            <div style={{ marginBottom: '32px' }}>
              <div style={{
                fontSize: 'clamp(28px, 4.5vw, 56px)',
                fontWeight: 700,
                letterSpacing: '-1px',
                color: '#1e293b',
              }}>
                {formatTime(clock)}
              </div>
              <div style={{
                fontSize: 'clamp(13px, 1.8vw, 20px)',
                color: '#475569',
                marginTop: '4px',
                textTransform: 'capitalize',
              }}>
                {formatDate(clock)}
              </div>
            </div>

            {/* Branding */}
            <div style={{
              fontSize: '14px',
              color: '#94a3b8',
              letterSpacing: '2px',
              textTransform: 'uppercase',
            }}>
              Система готова · OnoiPark
            </div>
          </>
        )}
      </div>

      {/* Bottom instruction */}
      {!hasEvent && (
        <div style={{
          position: 'absolute', bottom: '32px',
          textAlign: 'center', color: '#94a3b8',
          fontSize: '14px', letterSpacing: '1px',
        }}>
          Отсканируйте QR-код в мобильном приложении OnoiPark
        </div>
      )}

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes platePulse {
          0%, 100% { box-shadow: 0 12px 40px rgba(16,185,129,0.13); }
          50% { box-shadow: 0 12px 60px rgba(16,185,129,0.35); }
        }
      `}</style>
    </div>
  );
}
