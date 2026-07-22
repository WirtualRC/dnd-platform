import { useState } from 'react';
import ActiveCharacterPicker from './ActiveCharacterPicker';
import FullSheetModal from './FullSheetModal';

export default function MemberCard({ member, isMe, isGm, roomId }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const ac = member.active_character;

  return (
    <div className="card" style={styles.card}>
      <div style={{ ...styles.avatar, backgroundImage: ac?.avatar_url ? `url(${ac.avatar_url})` : 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.username}>
          {member.username}{member.role === 'gm' && <span style={styles.gmBadge}>GM</span>}
        </div>
        {ac ? (
          <div style={styles.charInfo}>
            {ac.name} · HP <span className="mono" style={{ color: 'var(--health)' }}>{ac.hp_current ?? '?'}/{ac.hp_max ?? '?'}</span> · AC {ac.ac ?? '?'}
          </div>
        ) : (
          <div style={styles.noChar}>нет активного персонажа</div>
        )}
      </div>

      {isMe && <ActiveCharacterPicker current={ac} />}
      {isGm && !isMe && ac && (
        <button className="ghost" onClick={() => setSheetOpen(true)}>Лист</button>
      )}

      {sheetOpen && (
        <FullSheetModal roomId={roomId} characterId={ac.id} onClose={() => setSheetOpen(false)} />
      )}
    </div>
  );
}

const styles = {
  card: { display: 'flex', alignItems: 'center', gap: 10 },
  avatar: {
    width: 40, height: 40, borderRadius: '50%', backgroundSize: 'cover', backgroundPosition: 'center',
    backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)', flexShrink: 0,
  },
  username: { fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 },
  gmBadge: { fontSize: 10, color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 4, padding: '0 4px' },
  charInfo: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 },
  noChar: { fontSize: 12, color: 'var(--text-dim)', marginTop: 2 },
};
