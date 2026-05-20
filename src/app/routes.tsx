import { createBrowserRouter, Navigate } from 'react-router';
import { Layout } from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ParkingsPage from './pages/ParkingsPage';
import SessionsPage from './pages/SessionsPage';
import QRScannerPage from './pages/QRScannerPage';
import ManualEntryPage from './pages/ManualEntryPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import KPPMonitor from './pages/KPPMonitor';
// ...


export const router = createBrowserRouter([
  {
    path: '/login',
    Component: LoginPage,
  },
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: '/monitor', element: <KPPMonitor /> },
      { path: 'dashboard', Component: DashboardPage },
      { path: 'parkings', Component: ParkingsPage },
      { path: 'sessions', Component: SessionsPage },
      { path: 'qr', Component: QRScannerPage },
      { path: 'manual', Component: ManualEntryPage },
      { path: 'history', Component: HistoryPage },
      { path: 'settings', Component: SettingsPage },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
