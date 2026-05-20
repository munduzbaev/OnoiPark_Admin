import { useEffect, useState } from 'react';
import { BarChart2, RefreshCw, Calendar } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts';
import { api } from '../lib/api';
import { useApp } from '../contexts/AppContext';
import { getOfflineSessions } from '../lib/offline';
import { toast } from 'sonner';
import { format, subDays, isWithinInterval } from 'date-fns';

type Range = '7' | '30' | '90';

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded ${className}`} />;
}

const CHART_TOOLTIP = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm">
      <p className="text-slate-300 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

function buildRevenueChart(entries: any[], days: number) {
  const result: { date: string; revenue: number; sessions: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(new Date(), i);
    const dateStr = format(date, 'dd.MM');
    const dayEntries = entries.filter(e => {
      const d = new Date(e.endTime || e.startTime);
      return d.toDateString() === date.toDateString();
    });
    result.push({
      date: dateStr,
      revenue: dayEntries.reduce((s, e) => s + (e.cost || 0), 0),
      sessions: dayEntries.length,
    });
  }
  return result;
}

function buildParkingChart(entries: any[]) {
  const map: Record<string, { name: string; sessions: number; revenue: number }> = {};
  entries.forEach(e => {
    const key = e.parkingName || e.parkingId || 'Неизвестно';
    if (!map[key]) map[key] = { name: key.substring(0, 14), sessions: 0, revenue: 0 };
    map[key].sessions++;
    map[key].revenue += e.cost || 0;
  });
  return Object.values(map);
}

export default function HistoryPage() {
  const { isOffline, setApiConnected } = useApp();
  const [range, setRange] = useState<Range>('7');
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    if (isOffline) {
      const data = getOfflineSessions().filter(s => s.status === 'completed');
      setHistory(data);
      setLoading(false);
      return;
    }
    try {
      const data = await api.getHistory(`range=${range}`);
      setHistory(data || []);
      setApiConnected(true);
    } catch {
      // Silent failure — show empty state
      setHistory([]);
      setApiConnected(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadHistory(); }, [range, isOffline]);

  const days = parseInt(range);
  const filtered = history.filter(e => {
    const d = new Date(e.endTime || e.startTime);
    return isWithinInterval(d, { start: subDays(new Date(), days), end: new Date() });
  });

  const revenueData = buildRevenueChart(filtered, days > 30 ? 30 : days);
  const parkingData = buildParkingChart(filtered);
  const totalRevenue = filtered.reduce((s, e) => s + (e.cost || 0), 0);
  const avgCost = filtered.length ? Math.round(totalRevenue / filtered.length) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">История и аналитика</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            Статистика парковочных сессий
          </p>
        </div>

        {/* Range selector */}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            {(['7', '30', '90'] as Range[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  range === r
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {r} дней
              </button>
            ))}
          </div>
          <button
            onClick={loadHistory}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Сессий за период', value: loading ? '–' : filtered.length },
          { label: 'Общая выручка', value: loading ? '–' : `${totalRevenue} с` },
          { label: 'Средний чек', value: loading ? '–' : `${avgCost} с` },
          { label: 'Парковок', value: loading ? '–' : parkingData.length },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-4">
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">{label}</p>
            {loading
              ? <Skeleton className="h-7 w-24" />
              : <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
            }
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-emerald-500" />
          Выручка по дням
        </h2>
        {loading ? (
          <Skeleton className="h-52 w-full" />
        ) : revenueData.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-slate-400 text-sm">
            Нет данных за выбранный период
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenueData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip content={<CHART_TOOLTIP />} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
                formatter={v => v === 'revenue' ? 'Выручка (с)' : 'Сессии'} />
              <Line
                type="monotone" dataKey="revenue" stroke="#10b981"
                strokeWidth={2} dot={false} name="revenue"
              />
              <Line
                type="monotone" dataKey="sessions" stroke="#06b6d4"
                strokeWidth={2} dot={false} name="sessions"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Per-parking chart */}
      {!loading && parkingData.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
            Сессии по парковкам
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={parkingData} margin={{ top: 0, right: 0, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip content={<CHART_TOOLTIP />} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
                formatter={v => v === 'sessions' ? 'Сессии' : 'Выручка (с)'} />
              <Bar dataKey="sessions" fill="#10b981" radius={[4, 4, 0, 0]} name="sessions" />
              <Bar dataKey="revenue" fill="#06b6d4" radius={[4, 4, 0, 0]} name="revenue" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* History table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-semibold text-slate-900 dark:text-white text-sm">
            Детальная история
            <span className="ml-2 text-slate-400 font-normal">({filtered.length} записей)</span>
          </h2>
        </div>
        {loading ? (
          <div className="p-5 space-y-3">
            {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-slate-500 dark:text-slate-400 text-sm">
            Нет завершённы�� сессий за выбранный период
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  {['Госномер', 'Парковка', 'Место', 'Начало', 'Окончание', 'Длит. (мин)', 'Стоимость'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.slice(0, 100).map((e, i) => (
                  <tr key={e.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                      {e.plateNumber || '–'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {e.parkingName || '–'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      #{e.spotNumber || '–'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                      {e.startTime ? new Date(e.startTime).toLocaleString('ru-RU', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                      }) : '–'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                      {e.endTime ? new Date(e.endTime).toLocaleString('ru-RU', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                      }) : '–'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {e.duration ?? (e.startTime && e.endTime
                        ? Math.round((new Date(e.endTime).getTime() - new Date(e.startTime).getTime()) / 60000)
                        : '–')}
                    </td>
                    <td className="px-4 py-3 font-semibold text-emerald-500 whitespace-nowrap">
                      {e.cost !== undefined ? `${e.cost} с` : '–'}
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