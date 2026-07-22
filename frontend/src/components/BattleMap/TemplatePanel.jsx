import { useState, useMemo } from 'react';
import { useBattleMapStore } from '../../store/useBattleMapStore';
import TemplateModal from './TemplateModal';

export default function TemplatePanel({ roomId }) {
  // tab — какого вида представления показываем/добавляем; expanded — открыт
  // ли сейчас список под иконками (по умолчанию свёрнут). Повторный клик по
  // уже активной иконке сворачивает список, клик по другой — переключает
  // вкладку и разворачивает.
  const [tab, setTab] = useState('pc');
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const templates = useBattleMapStore((s) => s.templates);
  const tokens = useBattleMapStore((s) => s.tokens);
  const deleteTemplate = useBattleMapStore((s) => s.deleteTemplate);

  // персонажи, уже стоящие на карте живой связью 1:1 — их pc-представления
  // временно некликабельны, чтобы не наплодить два токена одного и того
  // же листа (для npc/саммонов это правило не действует — там как раз
  // ожидается ставить одно представление много раз)
  const placedCharacterIds = useMemo(
    () => new Set(Object.values(tokens).filter((t) => t.character_id && !t.is_instance).map((t) => t.character_id)),
    [tokens],
  );

  const shown = templates.filter((t) => t.kind === tab);

  function handleTabIconClick(kind) {
    if (expanded && tab === kind) {
      setExpanded(false);
    } else {
      setTab(kind);
      setExpanded(true);
    }
  }

  return (
    <div style={{ display: 'contents' }}>
      <div style={styles.panel}>
        <div style={styles.tabs}>
          <button
            className="ghost"
            style={{ ...styles.tabIcon, ...(expanded && tab === 'pc' ? styles.tabIconActive : null) }}
            onClick={() => handleTabIconClick('pc')}
            title="Персонажи"
            aria-label="Персонажи"
            aria-pressed={expanded && tab === 'pc'}
          >
            <PcIcon />
          </button>
          <button
            className="ghost"
            style={{ ...styles.tabIcon, ...(expanded && tab === 'npc' ? styles.tabIconActive : null) }}
            onClick={() => handleTabIconClick('npc')}
            title="NPC / саммоны"
            aria-label="NPC / саммоны"
            aria-pressed={expanded && tab === 'npc'}
          >
            <NpcIcon />
          </button>
          <button className="ghost" onClick={() => setModalOpen(true)} title="Новое представление">+</button>
        </div>

        {expanded && (
        <div style={styles.icons}>
          {shown.map((t) => {
            const isPlaced = tab === 'pc' && t.character_id && placedCharacterIds.has(t.character_id);
            return (
              <div
                key={t.id}
                draggable={!isPlaced}
                onDragStart={(e) => { if (!isPlaced) e.dataTransfer.setData('text/template-id', String(t.id)); }}
                style={{ ...styles.icon, opacity: isPlaced ? 0.35 : 1, cursor: isPlaced ? 'not-allowed' : 'grab' }}
                title={isPlaced ? `${t.label} уже на карте` : (t.label || 'Представление')}
              >
                <div style={{ ...styles.iconImg, backgroundImage: t.image_url ? `url(${t.image_url})` : 'none' }}>
                  {!t.image_url && <span style={styles.iconInitial}>{(t.label || '?')[0]}</span>}
                </div>
                <button
                  className="ghost" style={styles.removeBtn}
                  onClick={() => deleteTemplate(roomId, t.id)} title="Удалить представление"
                >✕</button>
              </div>
            );
          })}
          {shown.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Пусто — нажми «+»</span>}
        </div>
        )}
      </div>

      {/* отдельная плавающая панель вне styles.panel — у него transform,
          который создаёт containing block и обрезал бы её (см. историю
          правок этого файла) */}
      <TemplateModal opened={modalOpen} onClose={() => setModalOpen(false)} roomId={roomId} kind={tab} />
    </div>
  );
}

// человечек — вкладка «Персонажи»
function PcIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

// клык/коготь — вкладка «NPC / саммоны»
function NpcIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 8v6c0 3.5 3.5 6 8 7 4.5-1 8-3.5 8-7V8l-8-5Z" />
      <path d="M9 11c0 1.5.9 2.5 3 2.5s3-1 3-2.5" />
      <path d="M9 11 8 9" /><path d="M15 11l1-2" />
    </svg>
  );
}

const styles = {
  panel: {
    position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10,
    padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 560, zIndex: 10,
  },
  tabs: { display: 'flex', gap: 6 },
  tabIcon: {
    width: 34, height: 34, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 8,
  },
  tabIconActive: { background: 'var(--surface-2)', color: 'var(--text-primary)' },
  icons: { display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 44, alignItems: 'center' },
  icon: { position: 'relative', cursor: 'grab' },
  iconImg: {
    width: 40, height: 40, borderRadius: '50%', background: 'var(--surface-2)', backgroundSize: 'cover',
    backgroundPosition: 'center', border: '1px solid var(--border)', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  iconInitial: { fontSize: 16, color: 'var(--text-secondary)', textTransform: 'uppercase' },
  removeBtn: { position: 'absolute', top: -6, right: -6, width: 16, height: 16, padding: 0, fontSize: 9, borderRadius: '50%', lineHeight: '16px', minWidth: 0 },
};
