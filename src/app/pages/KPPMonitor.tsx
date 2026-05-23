/**
 * KPPMonitor.tsx — Monitor screen mounted above the barrier.
 *
 * Primary display: free spots count (large, colour-coded).
 * Secondary: clock + date.
 * Entry/exit events: plate + driver name overlay (8 s, then returns to idle).
 *
 * URL: /monitor?parking=<id>   (defaults to parking-1)
 */

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import React from 'react';

// ── Supabase ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://rhckohqfbvkeinsqyesh.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoY2tvaHFmYnZrZWluc3F5ZXNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzNzkxNTAsImV4cCI6MjA3Njk1NTE1MH0.1yDwTdLJV1titZ7V-GzEQb-2e64FxFT-Me3PiqRCfBg';
const PARKING_API = 'https://onoipark-api.vercel.app/api';

// Read parking id from URL query param, fall back to parking-1
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
  timestamp: string;
}

interface SpotsInfo {
  free: number;
  total: number;
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

  // ── Clock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Fetch free spots ─────────────────────────────────────────────────────
  const loadSpots = async () => {
    try {
      const res = await fetch(`${PARKING_API}/parkings/${parkingId}/spots`);
      const data = await res.json();
      const spots: any[] = data.spots || [];
      setSpotsInfo({
        free: spots.filter((s: any) => s.status === 'available').length,
        total: spots.length,
      });
    } catch {
      // silently ignore — stale display is acceptable
    }
  };

  // Initial fetch + polling fallback every 10 s
  useEffect(() => {
    loadSpots();
    const id = setInterval(loadSpots, 10000);
    return () => clearInterval(id);
  }, []);

  // ── Realtime: parking_sessions → re-fetch spots on any change ────────────
  useEffect(() => {
    const channel = supabase
      .channel('monitor-sessions')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parking_sessions' },
        () => { loadSpots(); }
      )
      .subscribe(status => setIsConnected(status === 'SUBSCRIBED'));
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Realtime: kv_store for entry/exit event overlay ──────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('kpp-events')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kv_store_8d1a5612' },
        (payload) => { handleKVChange(payload); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleKVChange = (payload: any) => {
    const key: string = payload.new?.key || payload.old?.key || '';
    const value = payload.new?.value;
    if (key.startsWith('session:') && payload.eventType === 'INSERT' && value?.status === 'active') {
      showEvent({
        type: 'entry',
        plateNumber: value.plateNumber || '–',
        driverName: value.driverName || value.name,
        spotNumber: value.spotNumber,
        timestamp: new Date().toISOString(),
      });
      loadSpots();
    }
    if (key.startsWith('session:') && payload.eventType === 'UPDATE' && value?.status === 'completed') {
      showEvent({
        type: 'exit',
        plateNumber: value.plateNumber || '–',
        driverName: value.driverName || value.name,
        spotNumber: value.spotNumber,
        timestamp: new Date().toISOString(),
      });
      loadSpots();
    }
  };

  const showEvent = (event: ParkingEvent) => {
    setCurrentEvent(event);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setCurrentEvent(null), 8000);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const isEntry = currentEvent?.type === 'entry';
  const hasEvent = currentEvent !== null;

  // Free-spots colour: green → amber (≤2) → red (0)
  const freeColor =
    spotsInfo === null ? '#64748b'
    : spotsInfo.free === 0 ? '#ef4444'
    : spotsInfo.free <= 2 ? '#f59e0b'
    : '#10b981';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: '100vh',
        background: hasEvent
          ? isEntry ? '#f0fdf4' : '#fff7ed'
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
      {/* Decorative background circles */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', width: '600px', height: '600px', borderRadius: '50%',
          top: '-200px', left: '-200px',
          background: hasEvent
            ? isEntry ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.10)'
            : 'rgba(59,130,246,0.10)',
          transition: 'background 0.6s ease',
        }} />
        <div style={{
          position: 'absolute', width: '400px', height: '400px', borderRadius: '50%',
          bottom: '-100px', right: '-100px',
          background: hasEvent
            ? isEntry ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.07)'
            : 'rgba(99,102,241,0.08)',
          transition: 'background 0.6s ease',
        }} />
      </div>

      {/* Connection status */}
      <div style={{ position: 'absolute', top: '24px', right: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          width: '10px', height: '10px', borderRadius: '50%',
          background: isConnected ? '#10b981' : '#6b7280',
          boxShadow: isConnected ? '0 0 8px #10b981' : 'none',
          animation: isConnected ? 'pulse 2s infinite' : 'none',
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
      <div style={{ textAlign: 'center', zIndex: 1, animation: hasEvent ? 'fadeIn 0.4s ease' : undefined }}>

        {/* ── EVENT STATE ─────────────────────────────────────────────────── */}
        {hasEvent && currentEvent ? (
          <>
            <div style={{ fontSize: '80px', marginBottom: '24px', lineHeight: 1 }}>
              {isEntry ? '🚗' : '👋'}
            </div>
            <div style={{
              fontSize: 'clamp(48px, 8vw, 96px)', fontWeight: 800, letterSpacing: '-2px',
              lineHeight: 1.05, marginBottom: '24px',
              color: isEntry ? '#10b981' : '#f59e0b',
              textShadow: isEntry
                ? '0 0 60px rgba(16,185,129,0.3)'
                : '0 0 60px rgba(245,158,11,0.3)',
            }}>
              {isEntry ? 'Добро пожаловать!' : 'До свидания!'}
            </div>
            <div style={{
              fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 800, letterSpacing: '4px',
              fontFamily: 'monospace', color: '#0f172a',
              background: 'rgba(255,255,255,0.92)',
              border: `2px solid ${isEntry ? '#10b981' : '#f59e0b'}`,
              borderRadius: '16px', padding: '16px 40px',
              display: 'inline-block', marginBottom: '20px',
              boxShadow: '0 10px 30px rgba(15,23,42,0.08)',
            }}>
              {currentEvent.plateNumber}
            </div>
            {currentEvent.driverName && (
              <div style={{
                fontSize: 'clamp(20px, 3vw, 36px)', color: '#94a3b8',
                marginBottom: '16px', fontWeight: 500,
              }}>
                {currentEvent.driverName}
              </div>
            )}
            {currentEvent.spotNumber && isEntry && (
              <div style={{ fontSize: '18px', color: '#64748b', marginTop: '8px' }}>
                Место №{currentEvent.spotNumber}
              </div>
            )}
          </>
        ) : (
          /* ── IDLE STATE ───────────────────────────────────────────────── */
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
