import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function RequireAuth({ children }) {
  const status = useAuthStore((s) => s.status);
  const checkSession = useAuthStore((s) => s.checkSession);

  useEffect(() => {
    if (status === 'idle') checkSession();
  }, [status, checkSession]);

  if (status === 'idle' || status === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>
        Загрузка…
      </div>
    );
  }
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  return children;
}
