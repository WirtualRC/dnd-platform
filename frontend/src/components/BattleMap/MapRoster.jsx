import { useBattleMapStore } from '../../store/useBattleMapStore';

// Чисто производное состояние — отдельного хранилища не заводим. PC-токен
// всегда character_id + is_instance=false (по правилу, которое мы уже
// зафиксировали для вкладки "Персонажи"), так что фильтр уже размещённых
// токенов и есть отряд, без всякой новой сущности.
export default function MapRoster({ canControl }) {
  const tokens = useBattleMapStore((s) => s.tokens);
  const controlledTokenId = useBattleMapStore((s) => s.controlledTokenId);
  const setControlled = useBattleMapStore((s) => s.setControlled);
  const roster = Object.values(tokens).filter((t) => t.character_id && !t.is_instance);

  return (
    <div style={styles.panel}>
      <div style={styles.title}>Отряд</div>
      {roster.length === 0 && (
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Пока никто не вышел на карту</span>
      )}
      {roster.map((t) => {
        const controllable = canControl ? canControl(t) : false;
        const isControlled = controlledTokenId === t.id;
        return (
          <div
            key={t.id}
            style={{
              ...styles.entry,
              cursor: controllable ? 'pointer' : 'default',
              background: isControlled ? 'var(--surface-2)' : 'transparent',
              borderRadius: 6,
              padding: '2px 4px',
            }}
            onClick={() => { if (controllable) setControlled(t.id, t.character_id); }}
            title={controllable ? 'Управлять этим персонажем' : undefined}
          >
            <div style={{ ...styles.avatar, backgroundImage: t.image_url ? `url(${t.image_url})` : 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.name}>{t.character_name}</div>
              <div style={styles.stats}>
                HP <span className="mono" style={{ color: 'var(--health)' }}>{t.hp_current ?? '?'}/{t.hp_max ?? '?'}</span> · AC {t.ac ?? '?'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  panel: {
    // top:40% + translateY(-50%) — как ты уже поправил у себя после
    // центрирования, сохраняю то же значение, чтобы файл не откатил его
    position: 'absolute', top: '40%', left: 12, width: 180,
    transform: 'translateY(-50%)',
    background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10,
    padding: 10, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 10,
    maxHeight: '70vh', overflowY: 'auto',
  },
  title: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)' },
  entry: { display: 'flex', alignItems: 'center', gap: 8 },
  avatar: {
    width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-2)', backgroundSize: 'cover',
    backgroundPosition: 'center', border: '1px solid var(--border)', flexShrink: 0,
  },
  name: { fontSize: 12, fontWeight: 600 },
  stats: { fontSize: 10, color: 'var(--text-secondary)' },
};
