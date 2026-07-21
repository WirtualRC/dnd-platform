import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

export default function LoginPage() {
  const [mode, setMode] = useState('login'); // login | register
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const { login, register, error, clearError } = useAuthStore();

  async function handleSubmit(e) {
    e.preventDefault();
    const ok = mode === 'login'
      ? await login(username, password)
      : await register(username, email, password);
    if (ok) navigate('/');
  }

  return (
    <div className="theme-dark" style={styles.page}>
      <div style={styles.card} className="card">
        <h1 style={styles.title}>Чернильный чертог</h1>
        <p style={styles.subtitle}>лист персонажа и стол мастера в одном месте</p>

        <div style={styles.tabs}>
          <button
            type="button"
            className={mode === 'login' ? '' : 'ghost'}
            onClick={() => { setMode('login'); clearError(); }}
            style={styles.tabButton}
          >Вход</button>
          <button
            type="button"
            className={mode === 'register' ? '' : 'ghost'}
            onClick={() => { setMode('register'); clearError(); }}
            style={styles.tabButton}
          >Регистрация</button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            placeholder="имя пользователя"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          {mode === 'register' && (
            <input
              type="email"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          )}
          <input
            type="password"
            placeholder="пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={6}
            required
          />
          <button type="submit" style={{ marginTop: 4 }}>
            {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
  },
  card: { width: 360, padding: 32 },
  title: { fontSize: 26, marginBottom: 4, color: 'var(--accent)' },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 20px' },
  tabs: { display: 'flex', gap: 8, marginBottom: 16 },
  tabButton: { flex: 1 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
};
