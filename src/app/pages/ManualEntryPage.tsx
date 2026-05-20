import { useEffect, useState } from 'react';
import {
  ClipboardList, Play, Search, StopCircle, RefreshCw,
  Upload, CheckCircle, Clock
} from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../contexts/AppContext';
import { FALLBACK_PARKINGS } from '../lib/constants';
import {
  getOfflineSessions, saveOfflineSession, updateOfflineSession,
  getUnsyncedSessions, markSessionsSynced, generateOfflineId, calcCost
} from '../lib/offline';
import type { OfflineSession } from '../lib/types';
import { LiveTimer, calcCostLive } from '../components/LiveTimer';
import { toast } from 'sonner';

const inputCls = "w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500";
const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

type Tab = 'start' | 'end' | 'log';

/** Load parkings safely — never throws, falls back to FALLBACK_PARKINGS */
async function loadParkingsSafe(): Promise<any[]> {
  try {
    const data = await api.getParkings();
    return data?.length ? data : FALLBACK_PARKINGS;
  } catch {
    return FALLBACK_PARKINGS;
  }
}

export default function ManualEntryPage() {
  const { isOffline } = useApp();
  const [tab, setTab] = useState<Tab>('start');
  // parkings always populated — real data or fallback
  const [parkings, setParkings] = useState<any[]>(FALLBACK_PARKINGS);
  const [offlineSessions, setOfflineSessions] = useState<OfflineSession[]>([]);

  // Start form state
  const [startForm, setStartForm] = useState({
    plateNumber: '', name: '', parkingId: '', spotNumber: ''
  });
  const [starting, setStarting] = useState(false);

  // End form state
  const [endPlate, setEndPlate] = useState('');
  const [foundSession, setFoundSession] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [ending, setEnding] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    // Load parkings: always try, even in offline mode (falls back gracefully)
    if (isOffline) {
      setParkings(FALLBACK_PARKINGS);
    } else {
      loadParkingsSafe().then(setParkings);
    }
    refreshOfflineSessions();
  }, [isOffline]);

  const refreshOfflineSessions = () => {
    setOfflineSessions(getOfflineSessions());
  };

  // ── Start session ───────────────────────────────────────────────────────────
  const handleStart = async () => {
    if (!startForm.plateNumber || !startForm.parkingId || !startForm.spotNumber) {
      toast.error('Заполните все обязательные поля');
      return;
    }
    setStarting(true);
    const parking = parkings.find(p => p.id === startForm.parkingId);
    try {
      if (isOffline) {
        saveOfflineSession({
          id: generateOfflineId(),
          plateNumber: startForm.plateNumber.toUpperCase(),
          name: startForm.name || undefined,
          parkingId: startForm.parkingId,
          parkingName: parking?.name || startForm.parkingId,
          spotNumber: parseInt(startForm.spotNumber),
          startTime: new Date().toISOString(),
          pricePerHour: parking?.pricePerHour || 0,
          status: 'active',
        });
        refreshOfflineSessions();
        toast.success('Сессия сохранена офлайн');
      } else {
        await api.startSession({
          plateNumber: startForm.plateNumber.toUpperCase(),
          driverName: startForm.name || undefined,
          parkingId: startForm.parkingId,
          spotNumber: parseInt(startForm.spotNumber),
        });
        toast.success('Парковочная сессия начата!');
      }
      setStartForm({ plateNumber: '', name: '', parkingId: '', spotNumber: '' });
    } catch (e: any) {
      toast.error('Ошибка: ' + e.message);
    } finally {
      setStarting(false);
    }
  };

  // ── Find active session by plate ────────────────────────────────────────────
  const handleSearch = async () => {
    if (!endPlate.trim()) { toast.error('Введите госномер'); return; }
    setSearching(true);
    setFoundSession(null);
    try {
      if (isOffline) {
        const s = getOfflineSessions().find(
          s => s.plateNumber.toLowerCase() === endPlate.trim().toLowerCase() && s.status === 'active'
        );
        if (s) { setFoundSession(s); toast.success('Сессия найдена'); }
        else toast.error('Активная сессия не найдена');
      } else {
        const sessions = await api.getActiveSessions();
        const found = sessions?.find(
          (s: any) => s.plateNumber?.toLowerCase() === endPlate.trim().toLowerCase()
        );
        if (found) { setFoundSession(found); toast.success('Сессия найдена'); }
        else toast.error('Активная сессия не найдена');
      }
    } catch (e: any) {
      toast.error('Ошибка поиска: ' + e.message);
    } finally {
      setSearching(false);
    }
  };

  // ── End session ─────────────────────────────────────────────────────────────
  const handleEnd = async () => {
    if (!foundSession) return;
    setEnding(true);
    try {
      const cost = foundSession.pricePerHour
        ? calcCostLive(foundSession.startTime, foundSession.pricePerHour, foundSession.freeDuration || 60)
        : 0;

      if (isOffline || String(foundSession.id).startsWith('offline_')) {
        updateOfflineSession(foundSession.id, {
          status: 'completed', endTime: new Date().toISOString(), cost,
        });
        refreshOfflineSessions();
        toast.success(`Сессия завершена. Стоимость: ${cost} с`);
      } else {
        await api.endSession({ sessionId: foundSession.id, plateNumber: foundSession.plateNumber });
        toast.success(`Сессия завершена. Стоимость: ${cost} с`);
      }
      setFoundSession(null);
      setEndPlate('');
    } catch (e: any) {
      toast.error('Ошибка: ' + e.message);
    } finally {
      setEnding(false);
    }
  };

  const handleEndOfflineSession = (s: OfflineSession) => {
    const cost = s.pricePerHour ? calcCost(s.startTime, s.pricePerHour) : 0;
    updateOfflineSession(s.id, { status: 'completed', endTime: new Date().toISOString(), cost });
    refreshOfflineSessions();
    toast.success(`Сессия ${s.plateNumber} завершена. Стоимость: ${cost} с`);
  };

  // ── Sync offline → online ───────────────────────────────────────────────────
  const handleSync = async () => {
    const unsynced = getUnsyncedSessions();
    if (!unsynced.length) { toast.info('Нет данных для синхронизации'); return; }
    setSyncing(true);
    try {
      const synced: string[] = [];
      for (const s of unsynced) {
        try {
          await api.startSession({
            plateNumber: s.plateNumber,
            driverName: s.name,
            parkingId: s.parkingId,
            spotNumber: s.spotNumber,
            startTime: s.startTime,
          });
          if (s.status === 'completed' && s.endTime) {
            await api.endSession({ plateNumber: s.plateNumber, endTime: s.endTime });
          }
          synced.push(s.id);
        } catch { /* skip individual failures */ }
      }
      markSessionsSynced(synced);
      refreshOfflineSessions();
      toast.success(`Синхронизировано: ${synced.length}/${unsynced.length}`);
    } catch (e: any) {
      toast.error('Ошибка синхронизации: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'start', label: 'Начать парковку', icon: Play },
    { key: 'end',   label: 'Завершить',        icon: StopCircle },
    { key: 'log',   label: 'Журнал',            icon: ClipboardList },
  ];

  // ── Parking selector — works in both online & offline (with fallback) ────────
  const ParkingSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select className={inputCls} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Выберите парковку</option>
      {parkings.map(p => (
        <option key={p.id} value={p.id}>
          {p.name}{p.pricePerHour ? ` — ${p.pricePerHour} с/ч` : ''}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Ручной ввод</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
          Управление сессиями без QR-кода · Работает онлайн и офлайн
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── START SESSION ─────────────────────────────────────────────────────── */}
      {tab === 'start' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
            <Play className="w-5 h-5 text-emerald-500" />
            Начать парковку
            {isOffline && (
              <span className="ml-auto text-xs px-2 py-0.5 bg-yellow-500/10 text-yellow-500 rounded-full border border-yellow-500/20">
                Офлайн
              </span>
            )}
          </h2>
          {/* Form always visible — online or offline */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Госномер *</label>
              <input className={inputCls} value={startForm.plateNumber}
                onChange={e => setStartForm(f => ({ ...f, plateNumber: e.target.value }))}
                placeholder="А123ВС" />
            </div>
            <div>
              <label className={labelCls}>Имя водителя</label>
              <input className={inputCls} value={startForm.name}
                onChange={e => setStartForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Необязательно" />
            </div>
            <div>
              <label className={labelCls}>Парковка *</label>
              <ParkingSelect
                value={startForm.parkingId}
                onChange={v => setStartForm(f => ({ ...f, parkingId: v }))}
              />
            </div>
            <div>
              <label className={labelCls}>Место № *</label>
              <input type="number" className={inputCls} value={startForm.spotNumber}
                onChange={e => setStartForm(f => ({ ...f, spotNumber: e.target.value }))}
                placeholder="1" min="1" />
            </div>
          </div>
          <button onClick={handleStart} disabled={starting}
            className="mt-6 flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-all">
            {starting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {starting ? 'Запуск...' : (isOffline ? 'Сохранить офлайн' : 'Начать парковку')}
          </button>
        </div>
      )}

      {/* ── END SESSION ────────────────────────────────────────────────────────── */}
      {tab === 'end' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-5">
          <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <StopCircle className="w-5 h-5 text-red-500" />
            Завершить парковку
          </h2>

          <div>
            <label className={labelCls}>Госномер</label>
            <div className="flex gap-2">
              <input className={inputCls} value={endPlate}
                onChange={e => setEndPlate(e.target.value)}
                placeholder="Введите госномер"
                onKeyDown={e => e.key === 'Enter' && handleSearch()} />
              <button onClick={handleSearch} disabled={searching}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-600 transition-all whitespace-nowrap disabled:opacity-50">
                {searching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Найти
              </button>
            </div>
          </div>

          {foundSession && (
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-200 dark:border-slate-600 p-4 space-y-3">
              <h3 className="font-medium text-slate-900 dark:text-white text-sm">Найдена сессия</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ['Госномер', foundSession.plateNumber || '–'],
                  ['Водитель', foundSession.name || foundSession.driverName || '–'],
                  ['Парковка', foundSession.parkingName || '–'],
                  ['Место', `#${foundSession.spotNumber || '–'}`],
                  ['Начало', foundSession.startTime
                    ? new Date(foundSession.startTime).toLocaleString('ru-RU') : '–'],
                  ['Длительность', '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span className="text-slate-500 dark:text-slate-400">{k}: </span>
                    <span className="text-slate-900 dark:text-white font-medium">
                      {k === 'Длительность' && foundSession.startTime
                        ? <LiveTimer startTime={foundSession.startTime} /> : v}
                    </span>
                  </div>
                ))}
              </div>
              {foundSession.startTime && foundSession.pricePerHour && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                  <p className="text-emerald-500 font-semibold text-sm">
                    Стоимость: {calcCostLive(foundSession.startTime, foundSession.pricePerHour, foundSession.freeDuration || 60)} с
                  </p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Тариф: {foundSession.pricePerHour} с/час
                  </p>
                </div>
              )}
              <button onClick={handleEnd} disabled={ending}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-medium rounded-lg transition-all text-sm">
                {ending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <StopCircle className="w-4 h-4" />}
                {ending ? 'Завершение...' : 'Завершить и рассчитать'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── OFFLINE LOG ────────────────────────────────────────────────────────── */}
      {tab === 'log' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-violet-500" />
              Журнал офлайн сессий
              <span className="text-xs px-2 py-0.5 bg-violet-500/10 text-violet-500 rounded-full">
                {offlineSessions.length}
              </span>
            </h2>
            {!isOffline && getUnsyncedSessions().length > 0 && (
              <button onClick={handleSync} disabled={syncing}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 hover:bg-cyan-500/20 transition-all">
                {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Синхронизировать всё ({getUnsyncedSessions().length})
              </button>
            )}
          </div>

          {offlineSessions.length === 0 ? (
            <div className="py-16 text-center">
              <ClipboardList className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">Нет офлайн записей</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-700/50">
                  <tr>
                    {['Начало', 'Госномер', 'Водитель', 'Парковка', 'Место', 'Статус', 'Стоимость', 'Синхр.', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {offlineSessions.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap text-xs">
                        {new Date(s.startTime).toLocaleString('ru-RU', {
                          day: '2-digit', month: '2-digit',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                        {s.plateNumber}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {s.name || '–'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {s.parkingName}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        #{s.spotNumber}
                      </td>
                      <td className="px-4 py-3">
                        {s.status === 'active'
                          ? <span className="flex items-center gap-1 text-xs text-emerald-500"><Clock className="w-3 h-3" />Активна</span>
                          : <span className="flex items-center gap-1 text-xs text-slate-400"><CheckCircle className="w-3 h-3" />Завершена</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-emerald-500 font-medium text-xs whitespace-nowrap">
                        {s.cost !== undefined ? `${s.cost} с` : '–'}
                      </td>
                      <td className="px-4 py-3">
                        {s.synced
                          ? <span className="text-xs text-emerald-500">✓ Синхр.</span>
                          : <span className="text-xs text-amber-500">Ожидание</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {s.status === 'active' && (
                          <button onClick={() => handleEndOfflineSession(s)}
                            className="px-2 py-1 rounded text-xs bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all whitespace-nowrap">
                            Завершить
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
