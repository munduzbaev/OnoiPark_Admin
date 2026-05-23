import { useEffect, useState } from 'react';
import { ParkingSquare, Activity, MapPin, TrendingUp, RefreshCw } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend
} from 'recharts';
import { api } from '../lib/api';
import { useApp } from '../contexts/AppContext';
import { getOfflineSessions } from '../lib/offline';
import { FALLBACK_PARKINGS } from '../lib/constants';
import { LiveTimer, calcCostLive } from '../components/LiveTimer';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bg: string;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded ${className}`} />;
}

function StatCardComp({ title, value, icon: Icon, color, bg }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div>
        <p className="text-slate-500 dark:text-slate-400 text-sm">{title}</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

const CHART_TOOLTIP = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm">
      <p className="text-white font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name === 'occupied' ? 'Занято' : 'Свободно'}: {p.value}
        </p>
      ))}
    </div>
  );
};

export default function DashboardPage() {
  const { isOffline, setApiConnected } = useApp();
  const [parkings, setParkings] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    // ── OFFLINE MODE ──────────────────────────────────────────────────────────
    if (isOffline) {
      const offlineSessions = getOfflineSessions().filter(s => s.status === 'active');
      setSessions(offlineSessions);
      setParkings(FALLBACK_PARKINGS);
      setHistory([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // ── ONLINE MODE — all failures are caught silently, UI always renders ────
    const [p, s, h] = await Promise.allSettled([
      api.getParkings(),
      api.getActiveSessions(),
      api.getHistory(),
    ]);

    const anySuccess = [p, s, h].some(r => r.status === 'fulfilled');
    setApiConnected(anySuccess);

    // Parkings: use real data or 3 placeholder objects
    if (p.status === 'fulfilled') {
      setParkings(p.value || []);
    } else {
      setParkings(FALLBACK_PARKINGS);
    }

    // Sessions: use real data or empty array
    setSessions(s.status === 'fulfilled' ? (s.value || []) : []);

    // History: use real data or empty array
    setHistory(h.status === 'fulfilled' ? (h.value || []) : []);

    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 30000);
    return () => clearInterval(interval);
  }, [isOffline]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const totalSpots = parkings.reduce((s, p) => s + (p.totalSpots || 0), 0);
  const availableSpots = parkings.reduce((s, p) => s + (p.availableSpots || 0), 0);
  const todayCost = history
    .filter(h => new Date(h.endTime || h.startTime).toDateString() === new Date().toDateString())
    .reduce((s, h) => s + (h.cost || 0), 0);

  const chartData = parkings.map(p => ({
    name: p.name?.substring(0, 12) || '–',
    occupied: (p.totalSpots || 0) - (p.availableSpots || 0),
    available: p.availableSpots || 0,
  }));

  const stats: StatCardProps[] = [
    {
      title: 'Всего парковок',
      value: loading ? '–' : parkings.length,
      icon: ParkingSquare,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      title: 'Активных сессий',
      value: loading ? '–' : sessions.length,
      icon: Activity,
      color: 'text-cyan-500',
      bg: 'bg-cyan-500/10',
    },
    {
      title: 'Свободных мест',
      value: loading ? '–' : availableSpots,
      icon: MapPin,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
    },
    {
      title: 'Выручка сегодня',
      value: loading ? '–' : `${todayCost} с`,
      icon: TrendingUp,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Главная</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            Обзор парковочной системы г. Ош
          </p>
        </div>
        <button
          onClick={() => loadData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Обновить</span>
        </button>
      </div>

      {/* Stat cards — always rendered, show 0 on fallback */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array(4).fill(0).map((_, i) => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
                <Skeleton className="h-12 w-12 rounded-xl mb-3" />
                <Skeleton className="h-3 w-24 mb-2" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))
          : stats.map(s => <StatCardComp key={s.title} {...s} />)
        }
      </div>

      {/* Occupancy chart — render even with fallback (shows 0 bars) */}
      {!loading && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
            Заполненность парковок
          </h2>
          {chartData.every(d => d.occupied === 0 && d.available === 0) ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
              Данные о занятости недоступны
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <Tooltip content={<CHART_TOOLTIP />} />
                <Legend
                  formatter={(value) => (value === 'occupied' ? 'Занято' : 'Свободно')}
                  wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
                />
                <Bar dataKey="occupied" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="available" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Active sessions table — always rendered */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Активные сессии
            {sessions.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-xs rounded-full">
                {sessions.length}
              </span>
            )}
          </h2>
        </div>

        {loading ? (
          <div className="p-5 space-y-3">
            {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : sessions.length === 0 ? (
          // ── Always shows this empty state — never a frozen blank screen ────
          <div className="px-5 py-12 text-center">
            <Activity className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
              Нет активных сессий
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
              {isOffline ? 'Данные из локального хранилища' : 'Все места свободны'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  {['Госномер', 'Водитель', 'Парковка', 'Место', 'Начало', 'Длительность', 'Стоимость'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {sessions.map((s, i) => (
                  <tr key={s.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-slate-900 dark:text-white">
                      {s.plateNumber || '–'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {s.name || s.driverName || '–'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {s.parkingName || '–'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      #{s.spotNumber || '–'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {s.startTime
                        ? new Date(s.startTime).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                        : '–'}
                    </td>
                    <td className="px-4 py-3 font-mono text-cyan-500">
                      {s.startTime ? <LiveTimer startTime={s.startTime} /> : '–'}
                    </td>
                    <td className="px-4 py-3 text-emerald-500 font-semibold">
                      {s.startTime && s.pricePerHour
                        ? `${calcCostLive(s.startTime, s.pricePerHour, s.freeDuration)} с`
                        : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
