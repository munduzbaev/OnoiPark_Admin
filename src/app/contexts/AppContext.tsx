import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AppContextType {
  isOffline: boolean;
  toggleOffline: () => void;
  isDark: boolean;
  toggleDark: () => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
  /** null = unknown, true = connected, false = no connection */
  apiConnected: boolean | null;
  setApiConnected: (v: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isOffline, setIsOffline] = useState(() =>
    localStorage.getItem('oi_offline') === 'true'
  );
  const [isDark, setIsDark] = useState(() =>
    localStorage.getItem('oi_dark') !== 'false'
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [apiConnected, setApiConnectedState] = useState<boolean | null>(null);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('oi_dark', String(isDark));
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem('oi_offline', String(isOffline));
    // Reset connection status when switching modes
    if (isOffline) setApiConnectedState(null);
  }, [isOffline]);

  const toggleOffline = useCallback(() => setIsOffline(p => !p), []);
  const toggleDark = useCallback(() => setIsDark(p => !p), []);
  const setApiConnected = useCallback((v: boolean) => setApiConnectedState(v), []);

  return (
    <AppContext.Provider value={{
      isOffline, toggleOffline,
      isDark, toggleDark,
      sidebarOpen, setSidebarOpen,
      apiConnected, setApiConnected,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = (): AppContextType => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
