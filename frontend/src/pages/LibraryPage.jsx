import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useCharacterStore } from '../store/useCharacterStore';
import AppHeader from '../components/AppHeader';

const DEFAULT_NAME = 'безымянный персонаж';

function hpColor(current, max) {
  if (!max) return 'var(--text-dim)';
  if (current >= max) return 'var(--health)';
  return '#e0a458';
}

function subtitleFor(sheet) {
  const race = sheet?.race || '—';
  const classPart = sheet?.class_name
    ? `${sheet.class_name}${sheet?.level ? ` ${sheet.level}` : ''}`
    : (sheet?.level ?? '');
  return `${race} — ${classPart}`;
}

function CardMenu({ onView, onExport, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <div ref={ref} style={styles.menuWrap} onClick={(e) => e.stopPropagation()}>
      <button className="ghost" style={styles.menuTrigger} title="Действия" onClick={() => setOpen((v) => !v)}>
        ⋯
      </button>
      {open && (
        <div style={styles.menu}>
          <button className="ghost" style={styles.menuItem} onClick={() => { setOpen(false); onView(); }}>
            👁 Просмотр
          </button>
          <button className="ghost" style={styles.menuItem} onClick={() => { setOpen(false); onExport(); }}>
            Экспорт
          </button>
          <button className="ghost" style={{ ...styles.menuItem, color: 'var(--danger)' }} onClick={() => { setOpen(false); onDelete(); }}>
            Удалить
          </button>
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const { characters, isLoading, error, loadCharacters, createCharacter, deleteCharacter, exportCharacter, importCharacter } = useCharacterStore();
  const fileInputRef = useRef(null);

  useEffect(() => { loadCharacters(); }, []);

  async function handleCreate() {
    const id = await createCharacter(DEFAULT_NAME);
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="ghost" onClick={() => fileInputRef.current?.click()}>Импортировать из файла</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
            <button className="ghost" onClick={logout}>Выйти</button>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {isLoading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Загрузка…</p>
        ) : (
          <div style={styles.grid}>
            {characters.map((c) => {
              const vitality = c.sheet_data?.vitality || {};
              const hpCurrent = vitality.hp_current ?? 0;
              const hpMax = vitality.hp_max ?? 0;
              return (
                <div
                  key={c.id}
                  className="card"
                  style={styles.charCard}
                  onClick={() => navigate(`/characters/${c.id}`)}
                >
                  <div
                    style={{ ...styles.avatar, backgroundImage: c.avatar_url ? `url(${c.avatar_url})` : 'none' }}
                  />
                  <div style={styles.charInfo}>
                    <div style={styles.charName}>{c.name}</div>
                    <div style={styles.charMeta}>{subtitleFor(c.sheet_data)}</div>
                    <div style={{ ...styles.hpRow, color: hpColor(hpCurrent, hpMax) }}>
                      <span aria-hidden="true">♥</span>
                      <span className="mono">{hpCurrent}/{hpMax}</span>
                    </div>
                  </div>
                  <CardMenu
                    onView={() => navigate(`/characters/${c.id}?view=1`)}
                    onExport={() => exportCharacter(c.id, c.name)}
                    onDelete={() => handleDelete(c.id, c.name)}
                  />
                </div>
              );
            })}

            <button type="button" style={styles.addCard} onClick={handleCreate}>
              <span style={styles.addPlus}>+</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: 'var(--bg)', padding: '32px 20px' },
  container: { maxWidth: 1040, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 },
  title: { fontSize: 28, color: 'var(--accent)' },
  subtitle: { fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14,
  },
  charCard: {
    position: 'relative', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
  },
  avatar: {
    width: 64, height: 64, borderRadius: 'var(--radius-md)', backgroundSize: 'cover', backgroundPosition: 'center',
    backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)', flexShrink: 0,
  },
  charInfo: { flex: 1, minWidth: 0 },
  charName: { fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 },
  charMeta: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 },
  hpRow: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, marginTop: 6 },
  menuWrap: { position: 'absolute', top: 10, right: 10 },
  menuTrigger: {
    width: 26, height: 26, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, color: 'var(--text-secondary)', fontSize: 16, lineHeight: 1,
  },
  menu: {
    position: 'absolute', top: '100%', right: 0, marginTop: 4, minWidth: 140, zIndex: 5,
    display: 'flex', flexDirection: 'column', gap: 2,
    background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10,
    padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  },
  menuItem: { textAlign: 'left', padding: '6px 8px', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)' },
  addCard: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 92,
    background: 'var(--surface-1)', border: '1px dashed var(--border-strong)', borderRadius: 'var(--radius-lg)',
    color: 'var(--text-dim)', cursor: 'pointer',
  },
  addPlus: { fontSize: 32, lineHeight: 1 },
};
