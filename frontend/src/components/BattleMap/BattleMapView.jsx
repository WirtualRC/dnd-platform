import { useEffect, useMemo } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useRoomStore } from '../../store/useRoomStore';
import { useCharacterStore } from '../../store/useCharacterStore';
import { useBattleMapStore } from '../../store/useBattleMapStore';
import MapCanvas from './MapCanvas';
import TemplatePanel from './TemplatePanel';
import MapRoster from './MapRoster';
import Hotbar from './Hotbar';

export default function BattleMapView({ room }) {
  const user = useAuthStore((s) => s.user);
  const setMode = useRoomStore((s) => s.setMode);
  const { characters, loadCharacters } = useCharacterStore();
  const { loadBattleMap, attachSocketListeners, placeTemplate } = useBattleMapStore();

  useEffect(() => {
    attachSocketListeners();
    loadBattleMap(room.id);
    if (characters.length === 0) loadCharacters();
  }, [room.id]);

  const isGm = room.gm_id === user?.id;
  const myCharacterIds = useMemo(() => new Set(characters.map((c) => c.id)), [characters]);

  // клиентская подсказка — сервер всё равно перепроверяет права на
  // каждое перемещение самостоятельно, тут только чтобы не показывать
  // ручки трансформации там, где их всё равно отклонят
  function canMoveToken(token) {
    if (isGm) return true;
    if (token.locked) return false;
    if (token.character_id) return myCharacterIds.has(token.character_id);
    return token.created_by_user_id === user?.id;
  }

  return (
    <div className="theme-slate" style={styles.fullscreen}>
      <MapCanvas
        roomId={room.id}
        canMoveToken={canMoveToken}
        onDropTemplate={(templateId, x, y) => placeTemplate(room.id, templateId, x, y)}
      />

      <TemplatePanel roomId={room.id} />
      <MapRoster canControl={canMoveToken} />
      <Hotbar roomId={room.id} />

      <div style={styles.topRight}>
        {isGm ? (
          <button className="secondary" onClick={() => setMode('roleplay')}>Закончить бой</button>
        ) : (
          <span style={styles.modeBadge}>Режим боя</span>
        )}
      </div>
    </div>
  );
}

const styles = {
  fullscreen: { position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 100, overflow: 'hidden' },
  topRight: { position: 'absolute', top: 12, right: 12, zIndex: 10 },
  modeBadge: { fontSize: 12, color: 'var(--text-dim)', background: 'var(--surface-1)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: 8 },
};
