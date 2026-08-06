import { useEffect, useRef, useState } from 'react';
import { useBattleMapStore } from '../../store/useBattleMapStore';
import { api } from '../../api/client';
import { ABILITIES, ABILITY_LABELS, abilityCheckTotal, saveTotal, formatMod } from '../../utils/dnd';
import { rollAbilityCheckInRoom } from '../../utils/roll';

// Чисто производное состояние — отдельного хранилища не заводим. Состав и
// порядок инициативы уже целиком в полях токена (in_initiative,
// initiative_order), так что фильтр+сортировка уже размещённых токенов —
// и есть список инициативы, без всякой новой сущности.
export default function MapRoster({ roomId, canControl, canReorder }) {
  const tokens = useBattleMapStore((s) => s.tokens);
  const controlledTokenId = useBattleMapStore((s) => s.controlledTokenId);
  const setControlled = useBattleMapStore((s) => s.setControlled);
  const moveInitiative = useBattleMapStore((s) => s.moveInitiative);
  const roster = Object.values(tokens)
    .filter((t) => t.in_initiative)
    .sort((a, b) => a.initiative_order - b.initiative_order);

  const [statsForId, setStatsForId] = useState(null); // character_id открытой мини-карточки
  const [dragId, setDragId] = useState(null);
  const containerRef = useRef(null);

  // клик вне и панели отряда, и открытой мини-карточки закрывает её — обе
  // лежат в одном контейнере, так что достаточно одного общего рефа
  useEffect(() => {
    if (statsForId === null) return undefined;
    function handleOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setStatsForId(null);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [statsForId]);

  const statsToken = statsForId != null ? roster.find((t) => t.character_id === statsForId) : null;

  return (
    <div ref={containerRef} style={{ display: 'contents' }}>
      <div style={styles.panel}>
        <div style={styles.title}>Инициатива</div>
        {roster.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Никто не добавлен в инициативу</span>
        )}
        {roster.map((t, index) => {
          const controllable = canControl ? canControl(t) : false;
          const draggable = canReorder ? canReorder(t) : false;
          const isControlled = controlledTokenId === t.id;
          return (
            <div
              key={t.id}
              draggable={draggable}
              onDragStart={() => setDragId(t.id)}
              onDragOver={(e) => { if (draggable) e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId == null || dragId === t.id) return;
                moveInitiative(roomId, dragId, index);
                setDragId(null);
              }}
              onDragEnd={() => setDragId(null)}
              style={{
                ...styles.entry,
                cursor: draggable ? 'grab' : (controllable ? 'pointer' : 'default'),
                background: isControlled ? 'var(--surface-2)' : 'transparent',
                opacity: dragId === t.id ? 0.5 : 1,
                borderRadius: 6,
                padding: '2px 4px',
              }}
              onClick={() => {
                if (!controllable || !t.character_id) return;
                setControlled(t.id, t.character_id);
                setStatsForId((cur) => (cur === t.character_id ? null : t.character_id));
              }}
              title={controllable ? 'Управлять этим персонажем · открыть характеристики' : undefined}
            >
              <div style={{ ...styles.avatar, backgroundImage: t.image_url ? `url(${t.image_url})` : 'none' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.name}>{t.character_name ?? t.label ?? 'Токен'}</div>
                <div style={styles.stats}>
                  HP <span className="mono" style={{ color: 'var(--health)' }}>{t.hp_current ?? '?'}/{t.hp_max ?? '?'}</span> · AC {t.ac ?? '?'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* отдельная плавающая карточка рядом с панелью отряда, а не внутри
          неё — panel обрезает overflow-x своим overflowY:'auto' (см. спеку
          CSS overflow), так что вложенный попап был бы просто невидим за
          её краем */}
      {statsToken && (
        <CharacterStatsPopover
          roomId={roomId}
          characterId={statsToken.character_id}
          characterName={statsToken.character_name}
          onClose={() => setStatsForId(null)}
        />
      )}
    </div>
  );
}

// Плавающее окошко с основными характеристиками — открывается справа от
// строки в ростере. Лист грузим лениво, только когда карточку реально
// открыли: сервер отдаёт /full только владельцу персонажа или GM (см.
// require_character_owner_or_gm), то есть ровно тем, кому разрешено
// нажать на строку (canControl), так что 403 тут возникнуть не должно.
function CharacterStatsPopover({ roomId, characterId, characterName, onClose }) {
  const [sheet, setSheet] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSheet(null);
    setError(false);
    api.get(`/rooms/${roomId}/characters/${characterId}/full`)
      .then((data) => { if (!cancelled) setSheet(data.sheet_data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [roomId, characterId]);

  // карточка нарочно не закрывается после броска — часто хочется кинуть
  // несколько проверок подряд, закрывает только крестик или клик мимо
  function handleRoll(kind, abilityKey, total) {
    const label = `${characterName}: ${kind}: ${ABILITY_LABELS[abilityKey]}`;
    rollAbilityCheckInRoom(roomId, characterId, label, total.value, total);
  }

  return (
    <div style={styles.popover}>
      <div style={styles.popoverHeader}>
        <span style={styles.popoverTitle}>{characterName}</span>
        <button className="ghost" style={styles.closeBtn} onClick={onClose} aria-label="закрыть">×</button>
      </div>

      {error && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Не удалось загрузить лист</span>}
      {!error && !sheet && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Загрузка…</span>}

      {sheet && (
        <>
          <div style={styles.rowLabel}>Проверки</div>
          <div style={styles.abilityGrid}>
            {ABILITIES.map((key) => {
              const check = abilityCheckTotal(sheet, key);
              return (
                <button
                  key={key}
                  style={styles.abilityBtn}
                  onClick={() => handleRoll('Проверка', key, check)}
                  aria-label={`бросок: проверка ${ABILITY_LABELS[key]}`}
                >
                  <span style={styles.abilityLabel}>{ABILITY_LABELS[key].slice(0, 3)}</span>
                  <span className="mono" style={styles.abilityMod}>{formatMod(check.value)}</span>
                </button>
              );
            })}
          </div>

          <div style={styles.rowLabel}>Спасброски</div>
          <div style={styles.abilityGrid}>
            {ABILITIES.map((key) => {
              const save = saveTotal(sheet, key);
              return (
                <button
                  key={key}
                  style={styles.abilityBtn}
                  onClick={() => handleRoll('Спасбросок', key, save)}
                  aria-label={`бросок: спасбросок ${ABILITY_LABELS[key]}`}
                >
                  <span style={styles.abilityLabel}>{ABILITY_LABELS[key].slice(0, 3)}</span>
                  <span className="mono" style={styles.abilityMod}>{formatMod(save.value)}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
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
  popover: {
    // panel: left:12, width:180 — карточка встаёт вплотную справа от неё,
    // с тем же вертикальным центрированием, отдельным элементом верстки
    position: 'absolute', top: '40%', left: 12 + 180 + 8, width: 176,
    transform: 'translateY(-50%)',
    background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 10,
    padding: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', zIndex: 20,
  },
  popoverHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  popoverTitle: { fontSize: 13, fontWeight: 700 },
  closeBtn: { padding: '0 6px', fontSize: 16, lineHeight: 1, background: 'transparent' },
  rowLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-secondary)', margin: '8px 0 4px' },
  abilityGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 },
  abilityBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '6px 4px', color: 'var(--text-primary)',
  },
  abilityLabel: { fontSize: 10, textTransform: 'uppercase', color: 'var(--text-secondary)' },
  abilityMod: { fontSize: 14, fontWeight: 700 },
};
