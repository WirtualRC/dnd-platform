import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useBattleMapStore } from '../../store/useBattleMapStore';
import {
  weaponDamageFormula, weaponAttackTotal, spellSaveDC, spellAttackTotal,
  castingTimeLabel, spellTierLabel, aoeLabel, formatMod, ABILITY_LABELS,
} from '../../utils/dnd';
import HotbarIcon from './HotbarIcon';

// Формула для броска после подтверждения цели — только у атак и заклинаний/
// предметов с уроном. У действий без костей (контрзаклинание и т.п.) null,
// это сигнал MapCanvas ничего не бросать и не показывать подпись.
function actionRollFormula(sheet, source, data) {
  if (source === 'attack') return data.damage ? weaponDamageFormula(sheet, data) : null;
  if (source === 'spell') return data.damage || null;
  if (source === 'item') return data.usable?.damage || null;
  return null;
}

// Данные для всплывающей подсказки при наведении на иконку в хотбаре —
// то же самое, что игрок видит на строке атаки/заклинания/предмета в
// листе персонажа, но собранное в один объект для HotbarIcon.
function buildTooltip(sheet, source, data) {
  if (source === 'attack') {
    return {
      title: data.name,
      subtitle: 'Атака',
      meta: [castingTimeLabel(data)],
      rollLabel: 'Атака', rollValue: formatMod(weaponAttackTotal(sheet, data)),
      damage: data.damage ? weaponDamageFormula(sheet, data) : null,
      desc: data.desc,
    };
  }
  if (source === 'spell') {
    const meta = [castingTimeLabel(data)];
    if (data.range != null) meta.push(`${data.range} фт`);
    if (data.concentration) meta.push('Концентрация');
    const aoe = aoeLabel(data.aoe);
    if (aoe) meta.push(aoe);

    let rollLabel = null, rollValue = null;
    if (data.save) { rollLabel = `СЛ (${ABILITY_LABELS[data.save]})`; const dc = spellSaveDC(sheet); rollValue = dc != null ? dc : '—'; }
    else if (data.damage) { const atk = spellAttackTotal(sheet); rollLabel = 'Атака'; rollValue = atk != null ? formatMod(atk) : '—'; }

    return {
      title: data.name,
      subtitle: spellTierLabel(data.tier ?? 0),
      meta,
      rollLabel, rollValue,
      damage: data.damage || null,
      desc: data.desc,
    };
  }
  // item
  const usable = data.usable || {};
  const meta = [];
  if (usable.range != null) meta.push(`${usable.range} фт`);
  const aoe = aoeLabel(usable.aoe);
  if (aoe) meta.push(aoe);
  return {
    title: data.name,
    subtitle: usable.type === 'attack' ? 'Атака (предмет)' : 'Эффект (предмет)',
    meta,
    rollLabel: null, rollValue: null,
    damage: usable.damage || null,
    desc: data.description,
  };
}

export default function Hotbar({ roomId }) {
  const controlledCharacterId = useBattleMapStore((s) => s.controlledCharacterId);
  const activeAction = useBattleMapStore((s) => s.activeAction);
  const setActiveAction = useBattleMapStore((s) => s.setActiveAction);
  const clearTargetPreview = useBattleMapStore((s) => s.clearTargetPreview);

  const [sheet, setSheet] = useState(null);

  useEffect(() => {
    if (!controlledCharacterId) { setSheet(null); return; }
    api.get(`/rooms/${roomId}/characters/${controlledCharacterId}/full`)
      .then((data) => setSheet(data.sheet_data))
      .catch(() => setSheet(null));
  }, [controlledCharacterId, roomId]);

  if (!controlledCharacterId || !sheet) return null;

  const usableItems = (sheet.items || []).filter((i) => i.usable);

  function toggle(source, data) {
    const isSame = activeAction?.data?.id === data.id;
    if (isSame) {
      clearTargetPreview(roomId, controlledCharacterId);
      setActiveAction(null);
    } else {
      if (activeAction) clearTargetPreview(roomId, controlledCharacterId);
      setActiveAction({
        source, data, characterId: controlledCharacterId,
        rollFormula: actionRollFormula(sheet, source, data),
      });
    }
  }

  return (
    <div style={styles.bar}>
      <Section items={sheet.attacks} source="attack" sheet={sheet} activeId={activeAction?.data?.id} onClick={(a) => toggle('attack', a)} />
      <div style={styles.divider} />
      <Section items={sheet.spells} source="spell" sheet={sheet} activeId={activeAction?.data?.id} onClick={(s) => toggle('spell', s)} />
      <div style={styles.divider} />
      <Section items={usableItems} source="item" sheet={sheet} activeId={activeAction?.data?.id} onClick={(i) => toggle('item', i)} />
    </div>
  );
}

function Section({ items, source, sheet, activeId, onClick }) {
  if (!items || items.length === 0) return <div style={styles.emptySection} />;
  return (
    <div style={styles.section}>
      {items.map((item) => (
        <HotbarIcon
          key={item.id}
          label={item.name}
          iconUrl={item.icon_url || item.usable?.icon_url}
          active={activeId === item.id}
          onClick={() => onClick(item)}
          tooltip={buildTooltip(sheet, source, item)}
        />
      ))}
    </div>
  );
}

const styles = {
  bar: {
    position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12,
    padding: 10, display: 'flex', alignItems: 'center', gap: 10, zIndex: 10, maxWidth: '90vw', overflowX: 'auto',
  },
  section: { display: 'flex', gap: 6 },
  emptySection: { minWidth: 4 },
  divider: { width: 1, alignSelf: 'stretch', background: 'var(--border)' },
};
