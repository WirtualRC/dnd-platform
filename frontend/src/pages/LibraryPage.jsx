import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useCharacterStore } from '../store/useCharacterStore';
import AppHeader from '../components/AppHeader';

export default function LibraryPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const { characters, isLoading, error, loadCharacters, createCharacter, deleteCharacter, exportCharacter, importCharacter } = useCharacterStore();
  const [newName, setNewName] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => { loadCharacters(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = await createCharacter(newName.trim());
    setNewName('');
    navigate(`/characters/${id}`);
  }

  async function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await importCharacter(file);
    } catch (err) {
      alert(`Не удалось импортировать: ${err.message}`);
    }
    e.target.value = '';
  }

  async function handleDelete(id, name) {
    if (!confirm(`Удалить персонажа «${name}» безвозвратно?`)) return;
    await deleteCharacter(id);
  }

  return (
    <div className="theme-dark" style={styles.page}>
      <div style={styles.container}>
        <AppHeader />
        <header style={styles.header}>
          <div>
            <h1 style={styles.title}>Библиотека персонажей</h1>
            <p style={styles.subtitle}>{user?.username}</p>
          </div>
          <button className="ghost" onClick={logout}>Выйти</button>
        </header>

        {error && <div className="error-banner">{error}</div>}

        <div style={styles.toolbar}>
          <form onSubmit={handleCreate} style={styles.createForm}>
            <input
              placeholder="имя нового персонажа"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit">+ Создать</button>
          </form>
          <button className="secondary" onClick={() => fileInputRef.current?.click()}>
            Импортировать из файла
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        </div>

        {isLoading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Загрузка…</p>
        ) : characters.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            Персонажей пока нет — создай первого выше или импортируй файл.
          </div>
        ) : (
          <div style={styles.grid}>
            {characters.map((c) => (
              <div key={c.id} className="card" style={styles.charCard}>
                <div
                  style={{ ...styles.avatar, backgroundImage: c.avatar_url ? `url(${c.avatar_url})` : 'none' }}
                  onClick={() => navigate(`/characters/${c.id}`)}
                />
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate(`/characters/${c.id}`)}>
                  <div style={styles.charName}>{c.name}</div>
                  <div style={styles.charMeta}>
                    {c.sheet_data?.class_name || '—'} {c.sheet_data?.level ? `· ур. ${c.sheet_data.level}` : ''}
                  </div>
                </div>
                <div style={styles.cardActions}>
                  <button
                    className="ghost" title="Открыть для просмотра — не сменит активного персонажа в комнате"
                    onClick={() => navigate(`/characters/${c.id}?view=1`)}
                  >
                    👁
                  </button>
                  <button className="ghost" title="Экспорт" onClick={() => exportCharacter(c.id, c.name)}>Экспорт</button>
                  <button className="ghost" title="Удалить" onClick={() => handleDelete(c.id, c.name)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: 'var(--bg)', padding: '32px 20px' },
  container: { maxWidth: 760, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 },
  title: { fontSize: 28, color: 'var(--accent)' },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' },
  toolbar: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  createForm: { display: 'flex', gap: 8, flex: 1, minWidth: 240 },
  grid: { display: 'flex', flexDirection: 'column', gap: 10 },
  charCard: { display: 'flex', alignItems: 'center', gap: 14 },
  avatar: {
    width: 48, height: 48, borderRadius: '50%', backgroundSize: 'cover', backgroundPosition: 'center',
    background: 'var(--surface-2)', border: '1px solid var(--border)', flexShrink: 0, cursor: 'pointer',
  },
  charName: { fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 },
  charMeta: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 },
  cardActions: { display: 'flex', gap: 4 },
};
