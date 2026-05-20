import { useEffect, useState } from 'react';
import { MapPin, Shield, Warehouse, Car, RefreshCw, X, ChevronRight, ParkingSquare } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../contexts/AppContext';
import { FALLBACK_PARKINGS } from '../lib/constants';
import { toast } from 'sonner';

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded ${className}`} />;
}

const FEATURE_ICONS: Record<string, { icon: React.ElementType; label: string }> = {
  security: { icon: Shield, label: 'Охрана' },
  covered: { icon: Warehouse, label: 'Крытая' },
  cctv: { icon: Car, label: 'Видеонаблюдение' },
};

function SpotGrid({
  spots,
  parkingName,
  onClose,
}: {
  spots: any[];
  parkingName: string;
  onClose: () => void;
}) {
  const statusColor = (s: string) => {
    if (s === 'available') return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400';
    if (s === 'occupied') return 'bg-red-500/20 border-red-500/40 text-red-400';
    if (s === 'booked') return 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400';
    return 'bg-slate-700 border-slate-600 text-slate-400';
  };
  const statusLabel = (s: string) => {
    if (s === 'available') return 'Свободно';
    if (s === 'occupied') return 'Занято';
    if (s === 'booked') return 'Забронировано';
    return 'Неизвестно';
  };

  const [selected, setSelected] = useState<any>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-white">{parkingName}</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm">{spots.length} мест</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Legend */}
        <div className="px-6 py-3 flex gap-4 border-b border-slate-200 dark:border-slate-700">
          {[
            { label: 'Свободно', cls: 'bg-emerald-500' },
            { label: 'Занято', cls: 'bg-red-500' },
            { label: 'Бронь', cls: 'bg-yellow-500' },
          ].map(({ label, cls }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${cls}`} />
              <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {spots.length === 0 ? (
            <p className="text-center text-slate-500 py-8">Нет данных о местах</p>
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-8 gap-2">
              {spots.map((spot, i) => (
                <button
                  key={spot.id || i}
                  onClick={() => setSelected(spot)}
                  className={`aspect-square flex flex-col items-center justify-center rounded-lg border text-xs font-medium transition-all hover:scale-105 ${statusColor(spot.status)}`}
                  title={statusLabel(spot.status)}
                >
                  <span>{spot.number || i + 1}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected spot info */}
        {selected && (
          <div className="border-t border-slate-200 dark:border-slate-700 px-6 py-4 bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-900 dark:text-white">Место #{selected.number}</p>
                <p className={`text-sm ${statusColor(selected.status).split(' ')[2]}`}>
                  {statusLabel(selected.status)}
                </p>
                {selected.plateNumber && (
                  <p className="text-sm text-slate-500 mt-0.5 font-mono">{selected.plateNumber}</p>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ParkingsPage() {
  const { isOffline, setApiConnected } = useApp();
  const [parkings, setParkings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedParking, setSelectedParking] = useState<any>(null);
  const [spots, setSpots] = useState<any[]>([]);
  const [loadingSpots, setLoadingSpots] = useState(false);

  const loadParkings = async () => {
    setLoading(true);
    if (isOffline) {
      // In offline mode, show fallback placeholders — never a blank screen
      setParkings(FALLBACK_PARKINGS);
      setLoading(false);
      return;
    }
    try {
      const data = await api.getParkings();
      setParkings(data || []);
      setApiConnected(true);
    } catch {
      // Silent failure: show fallback placeholders
      setParkings(FALLBACK_PARKINGS);
      setApiConnected(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadParkings(); }, [isOffline]);

  const handleViewSpots = async (parking: any) => {
    setSelectedParking(parking);
    setLoadingSpots(true);
    try {
      const data = await api.getParkingSpots(parking.id);
      setSpots(data || []);
    } catch (e: any) {
      toast.error('Ошибка загрузки мест: ' + e.message);
      setSpots([]);
    } finally {
      setLoadingSpots(false);
    }
  };

  const getOccupancyPct = (p: any) => {
    const total = p.totalSpots || 1;
    const occupied = total - (p.availableSpots || 0);
    return Math.round((occupied / total) * 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Парковки</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            Управление парковочными о��ъектами
          </p>
        </div>
        <button
          onClick={loadParkings}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Обновить</span>
        </button>
      </div>

      {isOffline && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-yellow-500 text-sm">
          В офлайн режиме данные о парковках недоступны.
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
              <Skeleton className="h-5 w-36 mb-2" />
              <Skeleton className="h-3 w-full mb-4" />
              <Skeleton className="h-2 w-full mb-4 rounded-full" />
              <div className="flex gap-2 mb-4">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : parkings.length === 0 ? (
        <div className="text-center py-20">
          <ParkingSquare className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">Нет доступных парковок</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {parkings.map((p, i) => {
            const pct = getOccupancyPct(p);
            const barColor = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-emerald-500';
            const features: string[] = p.features || [];

            return (
              <div
                key={p.id || i}
                className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 flex flex-col gap-4 hover:shadow-lg dark:hover:shadow-slate-900/50 transition-shadow"
              >
                {/* Name + address */}
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-white text-base">{p.name}</h3>
                  {p.address && (
                    <div className="flex items-center gap-1 mt-1">
                      <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" />
                      <p className="text-slate-500 dark:text-slate-400 text-xs truncate">{p.address}</p>
                    </div>
                  )}
                </div>

                {/* Occupancy */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Занято: {(p.totalSpots || 0) - (p.availableSpots || 0)}/{p.totalSpots || 0}
                    </span>
                    <span className={`text-xs font-medium ${pct > 80 ? 'text-red-500' : pct > 50 ? 'text-yellow-500' : 'text-emerald-500'}`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Price + features */}
                <div className="flex flex-wrap gap-1.5">
                  {p.pricePerHour !== undefined && (
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-xs rounded-full border border-emerald-500/20">
                      {p.pricePerHour} с/час
                    </span>
                  )}
                  {features.slice(0, 3).map((f: string, fi: number) => (
                    <span key={fi} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded-full">
                      {FEATURE_ICONS[f]?.label || f}
                    </span>
                  ))}
                </div>

                {/* Action */}
                <button
                  onClick={() => handleViewSpots(p)}
                  disabled={isOffline}
                  className="mt-auto flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Просмотр мест
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Spot modal */}
      {selectedParking && (
        <SpotGrid
          spots={loadingSpots ? [] : spots}
          parkingName={selectedParking.name}
          onClose={() => { setSelectedParking(null); setSpots([]); }}
        />
      )}
    </div>
  );
}