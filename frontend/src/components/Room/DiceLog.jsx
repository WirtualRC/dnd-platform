import { useRoomStore } from '../../store/useRoomStore';

export default function DiceLog({ maxHeight = 260 }) {
  const diceLog = useRoomStore((s) => s.diceLog);

  return (
    <div style={{ ...styles.log, maxHeight }}>
      {diceLog.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Пока пусто — брось что-нибудь.</p>}
      {diceLog.map((entry, i) => (
        <div key={entry.id ?? i} style={styles.entry}>
          <div>
            <strong>{entry.character_name || entry.user}</strong>: {entry.formula} = {' '}
            <span className="mono" style={{ color: 'var(--accent)' }}>{entry.result}</span>
          </div>
          <div style={styles.breakdown}>{entry.breakdown}</div>
        </div>
      ))}
    </div>
  );
}

const styles = {
  log: { overflowY: 'auto' },
  entry: { padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 },
  breakdown: { fontSize: 11, color: 'var(--text-dim)', marginTop: 2 },
};
