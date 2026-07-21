import AppHeader from '../components/AppHeader';

export default function ProfilePage() {
  return (
    <div className="theme-dark" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '12px 16px' }}>
        <AppHeader />
        <p style={{ color: 'var(--text-secondary)' }}>Профиль — реализуем одним из следующих шагов.</p>
      </div>
    </div>
  );
}
