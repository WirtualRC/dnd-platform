import { useEffect, useRef, useState } from 'react';
import { TOKEN_LAYERS } from './tokenLayers';
import { STANDARD_CONDITIONS } from '../../utils/conditions';

const LockIcon = ({ locked }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    {locked ? (
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    ) : (
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    )}
  </svg>
);

const LayersIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const MoreIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
);

// Плавающая панель действий под выбранным токеном — позиция задаётся в
// экранных координатах (x,y = нижняя точка токена), пересчитывается
// снаружи при каждом пане/зуме карты
export default function TokenActionPanel({
  x, y, locked, layer, canDelete, onToggleLock, onSetLayer, onDelete,
  conditions, onToggleCondition,
  inInitiative, initiativeStatsVisible, onToggleInitiative, onToggleInitiativeStatsVisible,
}) {
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [conditionsMenuOpen, setConditionsMenuOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!layerMenuOpen && !moreMenuOpen && !conditionsMenuOpen) return undefined;
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setLayerMenuOpen(false);
        setMoreMenuOpen(false);
        setConditionsMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [layerMenuOpen, moreMenuOpen, conditionsMenuOpen]);

  // закрытые меню не должны тихо переживать переключение на другой токен
  // под тем же экранным местом
  useEffect(() => {
    setLayerMenuOpen(false);
    setMoreMenuOpen(false);
    setConditionsMenuOpen(false);
  }, [x, y]);

  function toggleCondition(label) {
    const next = conditions.includes(label)
      ? conditions.filter((c) => c !== label)
      : [...conditions, label];
    onToggleCondition(next);
  }

  return (
    <div ref={containerRef} style={{ ...styles.wrap, left: x, top: y }}>
      <div style={styles.panel}>
        <button
          type="button"
          className="ghost"
          style={styles.btn}
          title={locked ? 'Открепить токен' : 'Закрепить токен (запретить двигать мышкой)'}
          onClick={onToggleLock}
        >
          <LockIcon locked={locked} />
        </button>
        <button
          type="button"
          className="ghost"
          style={{ ...styles.btn, ...(layerMenuOpen ? styles.btnActive : {}) }}
          title="Слой токена"
          onClick={() => { setMoreMenuOpen(false); setLayerMenuOpen((v) => !v); }}
        >
          <LayersIcon />
        </button>
        <button
          type="button"
          className="ghost"
          style={{ ...styles.btn, ...(canDelete ? {} : styles.btnDisabled) }}
          title={canDelete ? 'Удалить токен' : 'Токен закреплён — сначала открепите его'}
          disabled={!canDelete}
          onClick={onDelete}
        >
          <TrashIcon />
        </button>
        <button
          type="button"
          className="ghost"
          style={{ ...styles.btn, ...(moreMenuOpen ? styles.btnActive : {}) }}
          title="Ещё"
          onClick={() => { setLayerMenuOpen(false); setConditionsMenuOpen(false); setMoreMenuOpen((v) => !v); }}
        >
          <MoreIcon />
        </button>
      </div>

      {moreMenuOpen && !conditionsMenuOpen && (
        <div style={styles.layerMenu}>
          <button
            type="button"
            className="ghost"
            style={styles.layerItem}
            onClick={() => setConditionsMenuOpen(true)}
          >
            Состояния{conditions.length > 0 ? ` (${conditions.length})` : ''}
          </button>
          <button
            type="button"
            className="ghost"
            style={styles.layerItem}
            onClick={() => { onToggleInitiative(); setMoreMenuOpen(false); }}
          >
            {inInitiative ? 'Убрать из инициативы' : 'Добавить в инициативу'}
          </button>
          {inInitiative && (
            <button
              type="button"
              className="ghost"
              style={{ ...styles.layerItem, ...(initiativeStatsVisible ? styles.layerItemActive : {}) }}
              onClick={() => onToggleInitiativeStatsVisible()}
            >
              Показывать ХП/КД игрокам
            </button>
          )}
        </div>
      )}

      {moreMenuOpen && conditionsMenuOpen && (
        <div style={{ ...styles.layerMenu, maxHeight: 260, overflowY: 'auto' }}>
          <button type="button" className="ghost" style={styles.submenuBack} onClick={() => setConditionsMenuOpen(false)}>
            ← Состояния
          </button>
          {STANDARD_CONDITIONS.map((label) => (
            <button
              key={label}
              type="button"
              className="ghost"
              style={{ ...styles.layerItem, ...(conditions.includes(label) ? styles.layerItemActive : {}) }}
              onClick={() => toggleCondition(label)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {layerMenuOpen && (
        <div style={styles.layerMenu}>
          {TOKEN_LAYERS.map((l) => (
            <button
              key={l.value}
              type="button"
              className="ghost"
              style={{ ...styles.layerItem, ...(l.value === layer ? styles.layerItemActive : {}) }}
              onClick={() => { onSetLayer(l.value); setLayerMenuOpen(false); }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  wrap: { position: 'absolute', transform: 'translate(-50%, 10px)', zIndex: 15 },
  panel: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10,
    padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', whiteSpace: 'nowrap',
  },
  btn: {
    width: 30, height: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 7, color: 'var(--text-secondary)',
  },
  btnActive: {
    background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)',
  },
  btnDisabled: {
    opacity: 0.35, cursor: 'not-allowed',
  },
  layerMenu: {
    position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8,
    display: 'flex', flexDirection: 'column', gap: 2, minWidth: 140,
    background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10,
    padding: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  },
  layerItem: {
    textAlign: 'left', padding: '6px 8px', borderRadius: 6, fontSize: 13, color: 'var(--text-secondary)',
  },
  layerItemActive: {
    background: 'var(--surface-2)', color: 'var(--text)',
  },
  submenuBack: {
    textAlign: 'left', padding: '6px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    color: 'var(--text)', marginBottom: 2, borderBottom: '1px solid var(--border)',
  },
};
