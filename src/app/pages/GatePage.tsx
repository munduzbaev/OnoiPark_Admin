import React, { useState, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Maximize2, Minimize2 } from 'lucide-react';

const GATE_VALUE = 'gate-1';

export default function GatePage() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  React.useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', sans-serif",
        position: 'relative',
      }}
    >
      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '10px',
          color: '#94a3b8',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          fontSize: '13px',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.14)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
      >
        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        {isFullscreen ? 'Выйти' : 'На весь экран'}
      </button>

      {/* Logo */}
      <div style={{ position: 'absolute', top: '22px', left: '24px' }}>
        <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px', color: '#f1f5f9' }}>
          Onoi<span style={{ color: '#10b981' }}>Park</span>
        </span>
      </div>

      {/* QR card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '24px',
          padding: '40px',
          boxShadow: '0 0 80px rgba(16,185,129,0.15)',
        }}
      >
        <QRCodeSVG
          value={GATE_VALUE}
          size={320}
          bgColor="#ffffff"
          fgColor="#0f172a"
          level="H"
          marginSize={2}
        />
      </div>

      {/* Title */}
      <h1
        style={{
          marginTop: '36px',
          color: '#f1f5f9',
          fontSize: 'clamp(22px, 3vw, 36px)',
          fontWeight: 700,
          letterSpacing: '-0.5px',
          textAlign: 'center',
        }}
      >
        OnoiPark — Шлагбаум №1
      </h1>

      {/* Instruction */}
      <p
        style={{
          marginTop: '12px',
          color: '#64748b',
          fontSize: 'clamp(14px, 1.6vw, 18px)',
          textAlign: 'center',
          maxWidth: '480px',
          lineHeight: 1.6,
        }}
      >
        Отсканируйте код в приложении OnoiPark для въезда/выезда
      </p>

      {/* Gate label */}
      <div
        style={{
          marginTop: '24px',
          background: 'rgba(16,185,129,0.1)',
          border: '1px solid rgba(16,185,129,0.25)',
          borderRadius: '8px',
          padding: '6px 16px',
          color: '#10b981',
          fontSize: '13px',
          fontFamily: 'monospace',
          letterSpacing: '1px',
        }}
      >
        {GATE_VALUE}
      </div>
    </div>
  );
}
