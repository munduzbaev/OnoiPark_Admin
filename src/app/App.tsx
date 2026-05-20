import { RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import { router } from './routes';
import { AuthProvider } from './contexts/AuthContext';
import { AppProvider } from './contexts/AppContext';

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <RouterProvider router={router} />
        <Toaster
          position="top-right"
          richColors
          theme="system"
          toastOptions={{
            style: { fontFamily: 'inherit' },
          }}
        />
      </AppProvider>
    </AuthProvider>
  );
}
