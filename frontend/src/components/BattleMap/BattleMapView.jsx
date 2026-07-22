import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/useAuthStore';
import { useRoomStore } from '../../store/useRoomStore';
import { useCharacterStore } from '../../store/useCharacterStore';
import { useBattleMapStore } from '../../store/useBattleMapStore';
import MapCanvas from './MapCanvas';
import TemplatePanel from './TemplatePanel';
import MapRoster from './MapRoster';
import Hotbar from './Hotbar';
import CombatDiceLog from './CombatDiceLog';
import CursorModePanel from './CursorModePanel';
import BattleMapSwitcher from './BattleMapSwitcher';

export default function BattleMapView({ room }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setMode = useRoomStore((s) => s.setMode);
  const controlledCharacterId = useBattleMapStore((s) => s.controlledCharacterId);
  const { characters, loadCharacters } = useCharacterStore();
  const { loadMaps, attachSocketListeners, placeTemplate } = useBattleMapStore();

  useEffect(() => {
    attachSocketListeners();
    loadMaps(room.id);
    if (characters.length === 0) loadCharacters();
  }, [room.id]);

  const isGm = room.gm_id === user?.id;
  const myCharacterIds = useMemo(() => new Set(characters.map((c) => c.id)), [characters]);

  // клиентская подсказка — сервер всё равно перепроверяет права на
  // каждое перемещение самостоятельно, тут только чтобы не показывать
  // ручки трансформации там, где их всё равно отклонят
  function canMoveToken(token) {
    if (token.locked) return false;
    if (isGm) return true;
    if (token.character_id) return myCharacterIds.has(token.character_id);
    return token.created_by_user_id === user?.id;
  }

  // право менять метаданные токена (закреп/слой/удаление) — в отличие от
  // canMoveToken, не зависит от текущего locked (см. _can_manage_token на
  // бэкенде): иначе владелец, закрепивший свой токен, не смог бы сам его
  // открепить обратно
  function canManageToken(token) {
    if (isGm) return true;
    if (token.character_id) return myCharacterIds.has(token.character_id);
    return token.created_by_user_id === user?.id;
  }

  return (
    <div className="theme-slate" style={styles.fullscreen}>
      <MapCanvas
        roomId={room.id}
        isGm={isGm}
        canMoveToken={canMoveToken}
        canManageToken={canManageToken}
        onDropTemplate={(templateId, x, y) => placeTemplate(room.id, templateId, x, y)}
      />

      <TemplatePanel roomId={room.id} />
      <MapRoster roomId={room.id} canControl={canMoveToken} />
      <Hotbar roomId={room.id} />
      <CombatDiceLog />
      <CursorModePanel isGm={isGm} roomId={room.id} />

      <div style={styles.topRight}>
        <div style={styles.topRightRow}>
          {controlledCharacterId && (
            // в бою карта занимает весь экран (см. RoomView) — без этой кнопки
            // из боя вообще нельзя попасть на лист персонажа, чтобы кинуть
            // бросок атакой/заклинанием со спасброском или что угодно, чего
            // нет в хотбаре. Ведёт на полноценный редактируемый лист даже для
            // GM, управляющего чужим персонажем — CharacterSheetPage сама
            // подставит room_id текущей комнаты, который бэкенд принимает как
            // подтверждение GM-доступа (см. characters/routes.py)
            <button className="secondary" onClick={() => navigate(`/characters/${controlledCharacterId}`)}>
              Лист персонажа
            </button>
          )}
          {isGm ? (
            <button className="secondary" onClick={() => setMode('roleplay')}>Закончить бой</button>
          ) : (
            <span style={styles.modeBadge}>Режим боя</span>
          )}
        </div>
        <BattleMapSwitcher roomId={room.id} isGm={isGm} />
      </div>
    </div>
  );
}

const styles = {
  fullscreen: { position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 100, overflow: 'hidden' },
  topRight: { position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 },
  topRightRow: { display: 'flex', alignItems: 'center', gap: 8 },
  modeBadge: { fontSize: 12, color: 'var(--text-dim)', background: 'var(--surface-1)', border: '1px solid var(--border)', padding: '6px 10px', borderRadius: 8 },
};
