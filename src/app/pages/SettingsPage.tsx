import { useEffect, useState } from 'react';
import { Settings, Save, RefreshCw, AlertTriangle, Sun, Moon, Wifi, WifiOff, User, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { clearOfflineData } from '../lib/offline';
import { toast } from 'sonner';

const inputCls = "w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500";
const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

export default function SettingsPage() {
  const { isOffline, toggleOffline, isDark, toggleDark } = useApp();
  const { user, signOut } = useAuth();
  const [parkings, setParkings] = useState<any[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [freeDuration, setFreeDuration] = useState(60);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      if (!isOffline) {
        try {
          const data = await api.getParkings();
          const ps = data || [];
          setParkings(ps);
          const priceMap: Record<string, number> = {};
          ps.forEach((p: any) => { priceMap[p.id] = p.pricePerHour || 0; });
          setPrices(priceMap);
        } catch (e: any) {
          toast.error('Ошибка загрузки: ' + e.message);
        }
      }
      setLoading(false);
    };
    loadData();
  }, [isOffline]);

  const handleSavePrices = async () => {
    setSaving(true);
    try {
      await api.updateSettings({ prices, freeDuration });
      toast.success('Настройки сохранены!');
    } catch (e: any) {
      toast.error('Ошибка сохранения: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClearOffline = () => {
    clearOfflineData();
    toast.success('Офлайн данные очищены');
    setResetConfirm(false);
  };

  const Section = ({ title, icon: Icon, children }: {
    title: string;
    icon: React.ElementType;
    children: React.ReactNode;
  }) => (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
        <Icon className="w-4 h-4 text-emerald-500" />
        <h2 className="font-semibold text-slate-900 dark:text-white text-sm">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Настройки</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
          Конфигурация системы
        </p>
      </div>

      {/* Admin info */}
      <Section title="Аккаунт администратора" icon={User}>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center flex-shrink-0">
            <User className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-slate-900 dark:text-white">{user?.email || '–'}</p>
            <p className="text-slate-400 text-sm">Администратор · OnoiPark</p>
            <p className="text-slate-400 text-xs mt-0.5">
              ID: {user?.id?.slice(0, 16)}...
            </p>
          </div>
        </div>
      </Section>

      {/* Appearance */}
      <Section title="Внешний вид" icon={Sun}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Тёмная тема</p>
              <p className="text-xs text-slate-400 mt-0.5">Переключить светлую/тёмную тему</p>
            </div>
            <button
              onClick={toggleDark}
              className={`relative w-11 h-6 rounded-full transition-colors ${isDark ? 'bg-emerald-500' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isDark ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className="pt-2 flex items-center gap-3">
            <span className="text-xs text-slate-400">Текущая тема:</span>
            <span className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
              {isDark ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
              {isDark ? 'Тёмная' : 'Светлая'}
            </span>
          </div>
        </div>
      </Section>

      {/* Online/Offline */}
      <Section title="Режим работы" icon={Wifi}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Офлайн режим</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Данные сохраняются в localStorage
              </p>
            </div>
            <button
              onClick={toggleOffline}
              className={`relative w-11 h-6 rounded-full transition-colors ${isOffline ? 'bg-yellow-500' : 'bg-emerald-500'}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isOffline ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">Статус:</span>
            <span className={`flex items-center gap-1 text-xs font-medium ${isOffline ? 'text-yellow-500' : 'text-emerald-500'}`}>
              {isOffline ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
              {isOffline ? 'Офлайн' : 'Онлайн'}
            </span>
          </div>
        </div>
      </Section>

      {/* Parking prices */}
      <Section title="Тарифы парковок" icon={Settings}>
        {isOffline ? (
          <p className="text-slate-400 text-sm">Настройки тарифов недоступны в офлайн режиме.</p>
        ) : loading ? (
          <div className="space-y-3">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="flex-1 h-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                <div className="w-24 h-8 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : parkings.length === 0 ? (
          <p className="text-slate-400 text-sm">Нет доступных парковок</p>
        ) : (
          <div className="space-y-3">
            {parkings.map(p => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.address}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={prices[p.id] ?? p.pricePerHour ?? 0}
                    onChange={e => setPrices(prev => ({ ...prev, [p.id]: parseFloat(e.target.value) || 0 }))}
                    className="w-20 px-2 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    min="0"
                  />
                  <span className="text-slate-400 text-sm">с/ч</span>
                </div>
              </div>
            ))}

            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-white">Бесплатный период</p>
                <p className="text-xs text-slate-400">Минут до начала тарификации</p>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={freeDuration}
                  onChange={e => setFreeDuration(parseInt(e.target.value) || 0)}
                  className="w-20 px-2 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  min="0"
                />
                <span className="text-slate-400 text-sm">мин</span>
              </div>
            </div>

            <button
              onClick={handleSavePrices}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-all mt-2"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Сохранение...' : 'Сохранить тарифы'}
            </button>
          </div>
        )}
      </Section>

      {/* Danger zone */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-red-200 dark:border-red-500/20 overflow-hidden">
        <div className="px-5 py-4 border-b border-red-200 dark:border-red-500/20 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h2 className="font-semibold text-red-500 text-sm">Зона опасности</h2>
        </div>
        <div className="p-5 space-y-4">
          {/* Clear offline */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Очистить офлайн данные</p>
              <p className="text-xs text-slate-400 mt-0.5">Удалить все записи из localStorage</p>
            </div>
            {!resetConfirm ? (
              <button
                onClick={() => setResetConfirm(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all whitespace-nowrap"
              >
                Очистить
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setResetConfirm(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition-all"
                >
                  Отмена
                </button>
                <button
                  onClick={handleClearOffline}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-all"
                >
                  Подтвердить
                </button>
              </div>
            )}
          </div>

          {/* Sign out */}
          <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
            <div>
              <p className="text-sm font-medium text-slate-900 dark:text-white">Выйти из системы</p>
              <p className="text-xs text-slate-400 mt-0.5">Завершить текущую сессию администратора</p>
            </div>
            <button
              onClick={() => signOut().then(() => toast.success('Вы вышли из системы'))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Выйти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}