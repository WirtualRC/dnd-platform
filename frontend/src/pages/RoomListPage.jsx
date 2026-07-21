import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoomStore } from '../store/useRoomStore';
import AppHeader from '../components/AppHeader';

export default function RoomListPage() {
  const navigate = useNavigate();
  const { myRooms, isLoading, error, loadMyRooms, createRoom, joinRoom } = useRoomStore();
  const [newRoomName, setNewRoomName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => { loadMyRooms(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    const id = await createRoom(newRoomName.trim());
    navigate(`/room/${id}`);
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    try {
      const id = await joinRoom(inviteCode.trim());
      navigate(`/room/${id}`);
    } catch {
      // ошибка уже отражена в сторе через error
    }
  }

  return (
    <div className="theme-slate" style={styles.page}>
      <div style={styles.container}>
        <AppHeader />
        <h1 style={styles.title}>Мои комнаты</h1>

        {error && <div className="error-banner">{error}</div>}

        <div style={styles.formsRow}>
          <form onSubmit={handleCreate} className="card" style={styles.formCard}>
            <div style={styles.formLabel}>Создать комнату</div>
            <div className="row">
              <input placeholder="название комнаты" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} />
              <button type="submit">Создать</button>
            </div>
          </form>

          <form onSubmit={handleJoin} className="card" style={styles.formCard}>
            <div style={styles.formLabel}>Войти по коду</div>
            <div className="row">
              <input placeholder="код приглашения" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} />
              <button type="submit" className="secondary">Войти</button>
            </div>
          </form>
        </div>

        {isLoading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Загрузка…</p>
        ) : myRooms.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
            Пока нет ни одной комнаты — создай новую или войди по коду выше.
          </div>
        ) : (
          <div style={styles.list}>
            {myRooms.map((room) => (
              <div key={room.id} className="card" style={styles.roomCard} onClick={() => navigate(`/room/${room.id}`)}>
                <div>
                  <div style={styles.roomName}>{room.name}</div>
                  <div style={styles.roomMeta}>
                    {room.role === 'gm' ? 'Мастер' : 'Игрок'} · режим: {room.mode === 'combat' ? 'бой' : 'общение'}
                  </div>
                </div>
                <span className="mono" style={styles.inviteCode}>{room.invite_code}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { minHeight: '100vh', background: 'var(--bg)', padding: '12px 16px 60px' },
  container: { maxWidth: 760, margin: '0 auto' },
  title: { fontSize: 24, color: 'var(--accent)', margin: '4px 0 16px' },
  formsRow: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
  formCard: { flex: 1, minWidth: 260 },
  formLabel: { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  roomCard: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' },
  roomName: { fontWeight: 600, fontSize: 15 },
  roomMeta: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 },
  inviteCode: { color: 'var(--text-dim)', fontSize: 13 },
};
