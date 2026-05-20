/**
 * KPPMonitor.tsx — Монитор КПП (Контрольно-Пропускной Пункт)
 *
 * Эта страница открывается на большом экране у въезда/выезда парковки.
 * Подключается к Supabase Realtime и автоматически показывает:
 *  - "Добро пожаловать!" когда машина заезжает
 *  - "До свидания!" когда машина выезжает
 *  - Госномер и имя водителя
 *  - Время и текущие данные о заполненности
 *
 * URL: /monitor  (добавить в routes.tsx)
 * Пример: https://onoipark-admin.vercel.app/monitor
 *
 * УСТАНОВКА:
 * 1. Скопируй этот файл в src/app/pages/KPPMonitor.tsx
 * 2. Добавь маршрут в src/app/routes.tsx:
 *      { path: '/monitor', element: <KPPMonitor /> }
 * 3. Добавь в sidebar пункт "Монитор" со ссылкой на /monitor
 *    (или просто открывай напрямую в браузере на большом экране)
 */

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import React from 'react';

// ── Supabase connection ──────────────────────────────────────────────────────
const SUPABASE_URL = 'https://rhckohqfbvkeinsqyesh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoY2tvaHFmYnZrZWluc3F5ZXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzNzkxNTAsImV4cCI6MjA3Njk1NTE1MH0.1yDwTdLJV1titZ7V-GzEQb-2e64FxFT-Me3PiqRCfBg';
const API_BASE = `${SUPABASE_URL}/functions/v1/make-server-8d1a5612`;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Types ────────────────────────────────────────────────────────────────────
type EventType = 'entry' | 'exit' | 'idle';

interface ParkingEvent {
  type: EventType;
  plateNumber: string;
  driverName?: string;
  parkingName?: string;
  spotNumber?: number;
  timestamp: string;
}

interface ParkingStats {
  totalSpots: number;
  availableSpots: number;
  parkingName: string;
}

// ── Helper ───────────────────────────────────────────────────────────────────
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

// ── Main component ───────────────────────────────────────────────────────────
export default function KPPMonitor() {
  const [currentEvent, setCurrentEvent] = useState<ParkingEvent | null>(null);
  const [stats, setStats] = useState<ParkingStats | null>(null);
  const [clock, setClock] = useState(new Date());
  const [isConnected, setIsConnected] = useState(false);

  // Auto-clear event after 8 seconds back to idle
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Clock tick ──────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Load parking stats ──────────────────────────────────────────────────
  const loadStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/parkings`);
      const data = await res.json();
      if (data.parkings?.length) {
        const p = data.parkings[0];
        setStats({
          totalSpots: p.totalSpots,
          availableSpots: p.availableSpots,
          parkingName: p.name,
        });
      }
    } catch {
      // Silently ignore — monitor still works offline
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Supabase Realtime subscription ──────────────────────────────────────
  useEffect(() => {
    // Subscribe to KV store changes — when a session starts or ends,
    // the kv_store_8d1a5612 table is updated and we catch it here.
    const channel = supabase
      .channel('kpp-monitor')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kv_store_8d1a5612',
        },
        (payload) => {
          handleKVChange(payload);
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ── Handle incoming realtime event ──────────────────────────────────────
  const handleKVChange = (payload: any) => {
    const key: string = payload.new?.key || payload.old?.key || '';
    const value = payload.new?.value;

    // Session started: key = "session:session-TIMESTAMP"
    if (key.startsWith('session:') && payload.eventType === 'INSERT') {
      const session = value;
      if (session?.status === 'active') {
        showEvent({
          type: 'entry',
          plateNumber: session.plateNumber || '–',
          driverName: session.driverName || session.name,
          spotNumber: session.spotNumber,
          timestamp: new Date().toISOString(),
        });
        loadStats();
      }
    }

    // Session ended: key = "session:...", status becomes 'completed'
    if (key.startsWith('session:') && payload.eventType === 'UPDATE') {
      const session = value;
      if (session?.status === 'completed') {
        showEvent({
          type: 'exit',
          plateNumber: session.plateNumber || '–',
          driverName: session.driverName || session.name,
          spotNumber: session.spotNumber,
          timestamp: new Date().toISOString(),
        });
        loadStats();
      }
    }

    // user-session deleted = exit
    if (key.startsWith('user-session:') && payload.eventType === 'DELETE') {
      loadStats();
    }
  };

  const showEvent = (event: ParkingEvent) => {
    setCurrentEvent(event);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      setCurrentEvent(null);
    }, 8000);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const isEntry = currentEvent?.type === 'entry';
  const isExit = currentEvent?.type === 'exit';
  const hasEvent = currentEvent !== null;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: hasEvent
          ? isEntry
            ? '#f0fdf4'
            : '#fff7ed'
          : '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Syne', 'Inter', sans-serif",
        transition: 'background 0.6s ease',
        position: 'relative',
        overflow: 'hidden',
        padding: '40px',
      }}
    >
      {/* Animated background circles */}
      <div style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          top: '-200px',
          left: '-200px',
          background: hasEvent
            ? isEntry ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.10)'
            : 'rgba(59,130,246,0.10)',
          transition: 'background 0.6s ease',
        }} />
        <div style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          bottom: '-100px',
          right: '-100px',
          background: hasEvent
            ? isEntry ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.07)'
            : 'rgba(99,102,241,0.08)',
          transition: 'background 0.6s ease',
        }} />
      </div>

      {/* Connection status dot */}
      <div style={{
        position: 'absolute',
        top: '24px',
        right: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <div style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: isConnected ? '#10b981' : '#6b7280',
          boxShadow: isConnected ? '0 0 8px #10b981' : 'none',
          animation: isConnected ? 'pulse 2s infinite' : 'none',
        }} />
        <span style={{ color: '#4b5563', fontSize: '13px' }}>
          {isConnected ? 'Подключено' : 'Нет связи'}
        </span>
      </div>

      {/* Logo top-left */}
      <div style={{ position: 'absolute', top: '24px', left: '32px' }}>
        <span style={{
          fontSize: '22px',
          fontWeight: 800,
          letterSpacing: '-0.5px',
          color: '#0f172a',
        }}>
          Onoi<span style={{ color: '#10b981' }}>Park</span>
        </span>
      </div>

      {/* Main content */}
      <div style={{
        textAlign: 'center',
        zIndex: 1,
        animation: hasEvent ? 'fadeIn 0.4s ease' : undefined,
      }}>

        {/* EVENT STATE */}
        {hasEvent && currentEvent ? (
          <>
            {/* Big icon */}
            <div style={{
              fontSize: '80px',
              marginBottom: '24px',
              lineHeight: 1,
            }}>
              {isEntry ? '🚗' : '👋'}
            </div>

            {/* Main greeting */}
            <div style={{
              fontSize: 'clamp(48px, 8vw, 96px)',
              fontWeight: 800,
              letterSpacing: '-2px',
              lineHeight: 1.05,
              color: isEntry ? '#10b981' : '#f59e0b',
              marginBottom: '24px',
              textShadow: isEntry
                ? '0 0 60px rgba(16,185,129,0.3)'
                : '0 0 60px rgba(245,158,11,0.3)',
            }}>
              {isEntry ? 'Добро пожаловать!' : 'До свидания!'}
            </div>

            {/* Plate number — big */}
            <div style={{
              fontSize: 'clamp(36px, 6vw, 72px)',
              fontWeight: 800,
              letterSpacing: '4px',
              fontFamily: 'monospace',
              color: '#f0f0f8',
              background: 'rgba(255,255,255,0.92)',
              border: `2px solid ${isEntry ? '#10b981' : '#f59e0b'}`,
              borderRadius: '16px',
              padding: '16px 40px',
              display: 'inline-block',
              marginBottom: '20px',
              boxShadow: '0 10px 30px rgba(15,23,42,0.08)',
            }}>
              {currentEvent.plateNumber}
            </div>

            {/* Driver name if available */}
            {currentEvent.driverName && (
              <div style={{
                fontSize: 'clamp(20px, 3vw, 36px)',
                color: '#94a3b8',
                textShadow: '0 1px 0 rgba(255,255,255,0.6)',
                marginBottom: '16px',
                fontWeight: 500,
              }}>
                {currentEvent.driverName}
              </div>
            )}

            {/* Spot number if available */}
            {currentEvent.spotNumber && isEntry && (
              <div style={{
                fontSize: '18px',
                color: '#64748b',
                marginTop: '8px',
              }}>
                Место №{currentEvent.spotNumber}
              </div>
            )}
          </>
        ) : (
          /* IDLE STATE */
          <>
            <div style={{
              fontSize: 'clamp(14px, 2vw, 20px)',
              color: '#475569',
              letterSpacing: '4px',
              textTransform: 'uppercase',
              marginBottom: '16px',
              fontFamily: 'monospace',
            }}>
              Система готова
            </div>

            <div style={{
              fontSize: 'clamp(36px, 6vw, 80px)',
              fontWeight: 800,
              letterSpacing: '-2px',
              color: '#1e293b',
              marginBottom: '8px',
            }}>
              {formatTime(clock)}
            </div>

            <div style={{
              fontSize: 'clamp(14px, 2vw, 22px)',
              color: '#334155',
              marginBottom: '48px',
              textTransform: 'capitalize',
            }}>
              {formatDate(clock)}
            </div>

            {/* Parking stats */}
            {stats && (
              <div style={{
                display: 'flex',
                gap: '32px',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}>
                <div style={{
                  background: 'rgba(16,185,129,0.08)',
                  border: '1px solid rgba(16,185,129,0.2)',
                  borderRadius: '16px',
                  padding: '24px 40px',
                  textAlign: 'center',
                }}>
                  <div style={{
                    fontSize: 'clamp(32px, 5vw, 64px)',
                    fontWeight: 800,
                    color: '#10b981',
                    lineHeight: 1,
                    marginBottom: '8px',
                  }}>
                    {stats.availableSpots}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '14px', letterSpacing: '1px' }}>
                    СВОБОДНО
                  </div>
                </div>

                <div style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: '16px',
                  padding: '24px 40px',
                  textAlign: 'center',
                }}>
                  <div style={{
                    fontSize: 'clamp(32px, 5vw, 64px)',
                    fontWeight: 800,
                    color: '#ef4444',
                    lineHeight: 1,
                    marginBottom: '8px',
                  }}>
                    {stats.totalSpots - stats.availableSpots}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '14px', letterSpacing: '1px' }}>
                    ЗАНЯТО
                  </div>
                </div>

                <div style={{
                  background: 'rgba(99,102,241,0.08)',
                  border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: '16px',
                  padding: '24px 40px',
                  textAlign: 'center',
                }}>
                  <div style={{
                    fontSize: 'clamp(32px, 5vw, 64px)',
                    fontWeight: 800,
                    color: '#818cf8',
                    lineHeight: 1,
                    marginBottom: '8px',
                  }}>
                    {stats.totalSpots}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '14px', letterSpacing: '1px' }}>
                    ВСЕГО МЕСТ
                  </div>
                </div>
              </div>
            )}

            <div style={{
              marginTop: '48px',
              color: '#1e293b',
              fontSize: '16px',
              letterSpacing: '2px',
              textTransform: 'uppercase',
            }}>
              {stats?.parkingName || 'OnoiPark'}
            </div>
          </>
        )}
      </div>

      {/* Bottom: scan instruction */}
      {!hasEvent && (
        <div style={{
          position: 'absolute',
          bottom: '32px',
          textAlign: 'center',
          color: '#1e293b',
          fontSize: '15px',
          letterSpacing: '1px',
        }}>
          Отсканируйте QR-код в мобильном приложении OnoiPark
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}