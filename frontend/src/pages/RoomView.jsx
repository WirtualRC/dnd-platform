import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoomStore } from '../store/useRoomStore';
import { useAuthStore } from '../store/useAuthStore';
import AppHeader from '../components/AppHeader';
import PartyRoster from '../components/Room/PartyRoster';
import DiceRoller from '../components/Room/DiceRoller';
import BattleMapView from '../components/BattleMap/BattleMapView';

export default function RoomView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { current: room, isLoading, error, loadRoom, setMode, attachSocketListeners } = useRoomStore();
  const [codeCopied, setCodeCopied] = useState(false);

  useEffect(() => {
    attachSocketListeners();
    loadRoom(id);
  }, [id]);

  if (isLoading || !room) {
    return <div className="theme-slate" style={styles.loading}>{error || 'Загрузка комнаты…'}</div>;
  }

  // в бою карта занимает весь экран, панели поверх — обычный вид комнаты
  // (ростер/кубики/переключатель режима) не рендерится вовсе, как и
  // договаривались, а не просто прячется под картой
  if (room.mode === 'combat') {
    return <BattleMapView room={room} />;
  }

  const isGm = room.gm_id === user?.id;
  const myMember = room.members.find((m) => m.user_id === user?.id);

  function copyCode() {
    navigator.clipboard?.writeText(room.invite_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  }

  return (
    <div className="theme-slate" style={styles.page}>
      <div style={styles.container}>
        <AppHeader />

        <div className="card" style={styles.header}>
          <button className="ghost" onClick={() => navigate('/room')}>← мои комнаты</button>
          <h1 style={styles.title}>{room.name}</h1>
          <button className="secondary" onClick={copyCode} style={{ minWidth: 110 }}>
            {codeCopied ? 'скопировано' : `код: ${room.invite_code}`}
          </button>

          {isGm ? (
            <div className="row" style={{ margin: 0 }}>
              <button
                className={room.mode === 'roleplay' ? '' : 'secondary'}
                onClick={() => setMode('roleplay')}
              >
                Общение
              </button>
              <button
                className={room.mode === 'combat' ? '' : 'secondary'}
                onClick={() => setMode('combat')}
              >
                Бой
              </button>
            </div>
          ) : (
            <span style={styles.modeLabel}>режим: {room.mode === 'combat' ? 'бой' : 'общение'}</span>
          )}
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div style={styles.columns}>
          <div style={styles.column}>
            <h2 style={styles.sectionTitle}>Отряд</h2>
            <PartyRoster room={room} myUserId={user?.id} isGm={isGm} />
          </div>
          <div style={styles.column}>
            <h2 style={styles.sectionTitle}>Кубики</h2>
            <DiceRoller myCharacterId={myMember?.active_character?.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  loading: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-secondary)' },
  page: { minHeight: '100vh', background: 'var(--bg)', padding: '12px 16px 60px' },
  container: { maxWidth: 1000, margin: '0 auto' },
  header: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 16 },
  title: { fontSize: 20, color: 'var(--accent)', margin: 0, flex: 1 },
  modeLabel: { fontSize: 13, color: 'var(--text-secondary)' },
  columns: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 },
  column: {},
  sectionTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)', margin: '0 0 8px' },
};
