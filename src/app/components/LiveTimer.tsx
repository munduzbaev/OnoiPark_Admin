import { useEffect, useState } from 'react';

function calcDuration(startTime: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function LiveTimer({ startTime, className }: { startTime: string; className?: string }) {
  const [dur, setDur] = useState(() => calcDuration(startTime));

  useEffect(() => {
    setDur(calcDuration(startTime));
    const id = setInterval(() => setDur(calcDuration(startTime)), 1000);
    return () => clearInterval(id);
  }, [startTime]);

  return <span className={className}>{dur}</span>;
}

export function calcCostLive(startTime: string, pricePerHour: number, freeMins = 60): number {
  const diffMins = (Date.now() - new Date(startTime).getTime()) / 60000;
  if (diffMins <= freeMins) return 0;
  return Math.round(((diffMins - freeMins) / 60) * pricePerHour);
}
