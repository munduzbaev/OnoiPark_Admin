import { useEffect, useState, useCallback } from 'react';
import { Activity, RefreshCw, StopCircle, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../contexts/AppContext';
import { getOfflineSessions, updateOfflineSession } from '../lib/offline';
import { LiveTimer, calcCostLive } from '../components/LiveTimer';
import { toast } from 'sonner';

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded ${className}`} />;
}

function ConfirmDialog({
  session,
  onConfirm,
  onCancel,
}: {
  session: any;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Завершить сессию?</h3>
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">
          Сессия для автомобиля <span className="font-mono font-semibold text-slate-900 dark:text-white">{session.plateNumber}</span> будет принудительно завершена.
        </p>
        {session.parkingName && (
          <p className="text-slate-400 text-xs mb-4">Парковка: {session.parkingName}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-all"
          >
            Завершить
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SessionsPage() {
  const { isOffline, setApiConnected } = useApp();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmSession, setConfirmSession] = useState<any>(null);
  const [ending, setEnding] = useState<string | null>(null);

  const loadSessions = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    if (isOffline) {
      const data = getOfflineSessions().filter(s => s.status === 'active');
      setSessions(data);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const data = await api.getActiveSessions();
      setSessions(data || []);
      setApiConnected(true);
    } catch {
      // Silent failure — show empty state, never freeze
      setSessions([]);
      setApiConnected(false);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOffline]);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(() => loadSessions(true), 30000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const handleForceEnd = async (session: any) => {
    setEnding(session.id);
    try {
      if (isOffline) {
        const cost = session.pricePerHour
          ? calcCostLive(session.startTime, session.pricePerHour, session.freeDuration || 60)
          : 0;
        updateOfflineSession(session.id, {
          status: 'completed',
          endTime: new Date().toISOString(),
          cost,
        });
        setSessions(prev => prev.filter(s => s.id !== session.id));
        toast.success(`Сессия завершена (офлайн). Стоимость: ${cost} с`);
      } else {
        await api.endSession({
          sessionId: session.id,
          plateNumber: session.plateNumber,
        });
        setSessions(prev => prev.filter(s => s.id !== session.id));
        toast.success(`Сессия ${session.plateNumber} завершена`);
      }
    } catch (e: any) {
      toast.error('Ошибка завершения: ' + e.message);
    } finally {
      setEnding(null);
      setConfirmSession(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Активные сессии</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            Обновляется каждые 30 секунд
          </p>
        </div>
        <button
          onClick={() => loadSessions(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Обновить</span>
        </button>
      </div>

      {/* Stats row */}
      {!loading && (
        <div className="flex gap-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500" />
            <span className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-900 dark:text-white">{sessions.length}</span> активных
            </span>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3">
            {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Activity className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium">Нет активных сессий</p>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
              Все автомобили выехали
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  {[
                    'Госномер', 'Водитель', 'Парковка', 'Место',
                    'Начало', 'Длительность', 'Стоимость', 'Действия'
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {sessions.map((s, i) => (
                  <tr key={s.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {s.plateNumber || '–'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      {s.name || s.driverName || '–'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {s.parkingName || '–'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                      #{s.spotNumber || '–'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {s.startTime
                        ? new Date(s.startTime).toLocaleString('ru-RU', {
                            day: '2-digit', month: '2-digit',
                            hour: '2-digit', minute: '2-digit'
                          })
                        : '–'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-cyan-500">
                        {s.startTime ? <LiveTimer startTime={s.startTime} /> : '–'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-emerald-500 whitespace-nowrap">
                      {s.startTime && s.pricePerHour
                        ? `${calcCostLive(s.startTime, s.pricePerHour, s.freeDuration || 60)} с`
                        : '–'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setConfirmSession(s)}
                        disabled={ending === s.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                      >
                        <StopCircle className="w-3.5 h-3.5" />
                        Завершить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmSession && (
        <ConfirmDialog
          session={confirmSession}
          onConfirm={() => handleForceEnd(confirmSession)}
          onCancel={() => setConfirmSession(null)}
        />
      )}
    </div>
  );
}