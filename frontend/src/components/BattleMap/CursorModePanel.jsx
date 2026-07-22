import { useBattleMapStore } from '../../store/useBattleMapStore';

const TOOLS = [
  {
    id: 'pan',
    title: 'Перемещение камеры',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="5 9 2 12 5 15" />
        <polyline points="9 5 12 2 15 5" />
        <polyline points="15 19 12 22 9 19" />
        <polyline points="19 9 22 12 19 15" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <line x1="12" y1="2" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    id: 'ruler',
    title: 'Линейка — измерить расстояние',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="8" width="19" height="8" rx="1" transform="rotate(-45 12 12)" />
        <line x1="8.5" y1="9.5" x2="10" y2="11" transform="rotate(-45 12 12)" />
        <line x1="11.5" y1="9.5" x2="13" y2="11" transform="rotate(-45 12 12)" />
        <line x1="14.5" y1="9.5" x2="16" y2="11" transform="rotate(-45 12 12)" />
      </svg>
    ),
  },
  {
    id: 'pointer',
    title: 'Указатель — виден всем игрокам комнаты',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="17" cy="7" r="2.5" fill="currentColor" stroke="none" />
        <path d="M13 10.5 C10 12.5, 7 14, 4 20" opacity="0.55" />
        <path d="M14.5 12 C12 13.5, 9 15.5, 6 20.5" opacity="0.3" />
      </svg>
    ),
  },
  {
    id: 'fog',
    title: 'Туман войны — виден только GM',
    gmOnly: true,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 19a4.5 4.5 0 0 1-.4-8.98A6 6 0 0 1 17.5 8.5 4.5 4.5 0 0 1 17 19H6.5z" />
      </svg>
    ),
  },
];

const FOG_SHAPES = [
  { id: 'rect', title: 'Прямоугольник' },
  { id: 'circle', title: 'Круг' },
  { id: 'triangle', title: 'Треугольник' },
];

export default function CursorModePanel({ isGm, roomId }) {
  const activeTool = useBattleMapStore((s) => s.activeTool);
  const setActiveTool = useBattleMapStore((s) => s.setActiveTool);
  const fogDrawShapeType = useBattleMapStore((s) => s.fogDrawShapeType);
  const setFogDrawShapeType = useBattleMapStore((s) => s.setFogDrawShapeType);
  const mapId = useBattleMapStore((s) => s.mapId);
  const clearAllFog = useBattleMapStore((s) => s.clearAllFog);

  const visibleTools = isGm ? TOOLS : TOOLS.filter((t) => !t.gmOnly);

  return (
    <>
      <div style={styles.panel}>
        {visibleTools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className="ghost"
            title={tool.title}
            aria-pressed={activeTool === tool.id}
            onClick={() => setActiveTool(tool.id)}
            style={{ ...styles.btn, ...(activeTool === tool.id ? styles.btnActive : {}) }}
          >
            {tool.icon}
          </button>
        ))}
      </div>

      {isGm && activeTool === 'fog' && (
        <div style={styles.fogPanel}>
          {FOG_SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="ghost"
              title={s.title}
              aria-pressed={fogDrawShapeType === s.id}
              onClick={() => setFogDrawShapeType(s.id)}
              style={{ ...styles.fogBtn, ...(fogDrawShapeType === s.id ? styles.btnActive : {}) }}
            >
              {s.title}
            </button>
          ))}
          <button
            type="button"
            className="ghost"
            title="Очистить весь туман войны на этой карте"
            onClick={() => {
              if (!window.confirm('Убрать весь туман войны с этой карты?')) return;
              clearAllFog(roomId, mapId);
            }}
            style={styles.fogBtn}
          >
            Очистить весь туман
          </button>
        </div>
      )}
    </>
  );
}

const styles = {
  panel: {
    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
    background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10,
    padding: 6, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10,
  },
  btn: {
    width: 36, height: 36, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, color: 'var(--text-secondary)',
  },
  btnActive: {
    background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)',
  },
  fogPanel: {
    position: 'absolute', right: 56, top: '50%', transform: 'translateY(-50%)',
    background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10,
    padding: 6, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10, minWidth: 160,
  },
  fogBtn: {
    height: 32, padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
    borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, whiteSpace: 'nowrap',
  },
};
