import { useState, useMemo } from 'react';
import { useBattleMapStore } from '../../store/useBattleMapStore';
import TemplateModal from './TemplateModal';

export default function TemplatePanel({ roomId }) {
  const [tab, setTab] = useState('pc');
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

  return (
    <div style={{ display: 'contents' }}>
      <div style={styles.panel}>
        <div style={styles.tabs}>
          <button className={tab === 'pc' ? '' : 'secondary'} onClick={() => setTab('pc')}>Персонажи</button>
          <button className={tab === 'npc' ? '' : 'secondary'} onClick={() => setTab('npc')}>NPC / саммоны</button>
          <button className="ghost" onClick={() => setModalOpen(true)} title="Новое представление">+</button>
        </div>

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
      </div>

      {/* отдельная плавающая панель вне styles.panel — у него transform,
          который создаёт containing block и обрезал бы её (см. историю
          правок этого файла) */}
      <TemplateModal opened={modalOpen} onClose={() => setModalOpen(false)} roomId={roomId} kind={tab} />
    </div>
  );
}

const styles = {
  panel: {
    position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10,
    padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 560, zIndex: 10,
  },
  tabs: { display: 'flex', gap: 6 },
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
