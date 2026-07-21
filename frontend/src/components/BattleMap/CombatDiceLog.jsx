import { useState } from 'react';
import { useRoomStore } from '../../store/useRoomStore';
import DiceLog from '../Room/DiceLog';

// В общении лог кубиков виден прямо на странице (DiceRoller), но в бою
// карта занимает весь экран (см. BattleMapView / RoomView) и DiceRoller
// там вообще не рендерится. Броски при этом всё так же долетают до
// остальных по сокету (useRoomStore.attachSocketListeners пишет их в
// diceLog независимо от режима) — не хватало только места их показать,
// поэтому тот же DiceLog переиспользуется здесь в свёрнутой панели.
export default function CombatDiceLog() {
  const [collapsed, setCollapsed] = useState(false);
  const diceLog = useRoomStore((s) => s.diceLog);

  return (
    <div style={styles.panel}>
      <button className="ghost" style={styles.toggle} onClick={() => setCollapsed((v) => !v)}>
        Кубики {diceLog.length > 0 && `(${diceLog.length})`} {collapsed ? '▲' : '▼'}
      </button>
      {!collapsed && (
        <div style={styles.body}>
          <DiceLog maxHeight={220} />
        </div>
      )}
    </div>
  );
}

const styles = {
  panel: {
    position: 'absolute', bottom: 12, right: 12, width: 260,
    background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12,
    padding: 8, zIndex: 10,
  },
  toggle: { width: '100%', textAlign: 'left', fontSize: 13 },
  body: { marginTop: 8 },
};
