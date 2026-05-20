import React, { useState } from 'react';
import { Outlet, NavLink, Navigate, useNavigate } from 'react-router';
import {
  LayoutDashboard, ParkingSquare, Activity, QrCode,
  ClipboardList, BarChart2, Settings, LogOut, Menu, X,
  Sun, Moon, Wifi, WifiOff, RefreshCw, ChevronLeft, Car
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { getUnsyncedSessions, markSessionsSynced } from '../lib/offline';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Главная' },
  { to: '/parkings',  icon: ParkingSquare,  label: 'Парковки' },
  { to: '/sessions',  icon: Activity,        label: 'Сессии' },
  { to: '/qr',        icon: QrCode,          label: 'QR-Сканер' },
  { to: '/manual',    icon: ClipboardList,   label: 'Ручной ввод' },
  { to: '/history',   icon: BarChart2,        label: 'История' },
  { to: '/settings',  icon: Settings,         label: 'Настройки' },
];

export function Layout() {
  const { session, loading, signOut } = useAuth();
  const { isOffline, toggleOffline, isDark, toggleDark, sidebarOpen, setSidebarOpen, apiConnected } = useApp();
  const navigate = useNavigate();
  const [syncing, setSyncing] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  const handleSignOut = async () => {
    await signOut();
    toast.success('Вы вышли из системы');
    navigate('/login');
  };

  const handleSync = async () => {
    const unsynced = getUnsyncedSessions();
    if (unsynced.length === 0) {
      toast.info('Нет данных для синхронизации');
      return;
    }
    setSyncing(true);
    try {
      const ids: string[] = [];
      for (const s of unsynced) {
        try {
          await api.startSession({
            plateNumber: s.plateNumber,
            driverName: s.name,  // s.name is the field in OfflineSession
            parkingId: s.parkingId,
            spotNumber: s.spotNumber,
            startTime: s.startTime,
          });
          if (s.status === 'completed' && s.endTime) {
            await api.endSession({ plateNumber: s.plateNumber, endTime: s.endTime });
          }
          ids.push(s.id);
        } catch {
          // skip failed sync
        }
      }
      markSessionsSynced(ids);
      toast.success(`Синхронизировано ${ids.length} из ${unsynced.length} записей`);
    } catch (e: any) {
      toast.error('Ошибка синхронизации: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const unsyncedCount = getUnsyncedSessions().length;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-slate-950 border-r border-slate-800 transition-all duration-300 ${
          sidebarOpen ? 'w-64' : 'w-16'
        } lg:relative lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <Car className="w-4 h-4 text-white" />
          </div>
          {sidebarOpen && (
            <div>
              <p className="text-white font-bold text-sm leading-tight">OnoiPark</p>
              <p className="text-slate-400 text-xs">Admin Panel</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto text-slate-400 hover:text-white transition-colors hidden lg:block"
          >
            <ChevronLeft className={`w-4 h-4 transition-transform duration-300 ${sidebarOpen ? '' : 'rotate-180'}`} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                  isActive
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="px-2 py-4 border-t border-slate-800 space-y-1">
          {sidebarOpen && session.user && (
            <div className="px-3 py-2 rounded-lg bg-slate-900 mb-2">
              <p className="text-white text-xs font-medium truncate">{session.user.email}</p>
              <p className="text-slate-400 text-xs">Администратор</p>
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span>Выйти</span>}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-30">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex-1" />

          {/* API connection status — only show in online mode */}
          {!isOffline && apiConnected !== null && (
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              apiConnected
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-500/10 text-red-500'
            }`}>
              <span className={`w-2 h-2 rounded-full ${apiConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {apiConnected ? 'Подключено' : 'Нет связи'}
            </div>
          )}

          {/* Sync button */}
          {!isOffline && unsyncedCount > 0 && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 text-sm hover:bg-cyan-500/20 transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Синхронизировать ({unsyncedCount})</span>
            </button>
          )}

          {/* Offline toggle */}
          <button
            onClick={toggleOffline}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
              isOffline
                ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/20'
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20'
            }`}
          >
            {isOffline ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
            <span className="hidden sm:inline">{isOffline ? 'Офлайн' : 'Онлайн'}</span>
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDark}
            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        {/* Offline Banner */}
        {isOffline && (
          <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-yellow-500 flex-shrink-0" />
            <span className="text-yellow-600 dark:text-yellow-400 text-sm font-medium">
              ⚠ Офлайн режим — данные сохраняются на этом устройстве
            </span>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}