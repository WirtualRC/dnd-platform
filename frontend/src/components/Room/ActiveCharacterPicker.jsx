import { useEffect } from 'react';
import { useCharacterStore } from '../../store/useCharacterStore';
import { useRoomStore } from '../../store/useRoomStore';

export default function ActiveCharacterPicker({ current }) {
  const { characters, loadCharacters } = useCharacterStore();
  const setActiveCharacter = useRoomStore((s) => s.setActiveCharacter);

  useEffect(() => { if (characters.length === 0) loadCharacters(); }, []);

  return (
    <select
      value={current?.id || ''}
      onChange={(e) => setActiveCharacter(e.target.value ? parseInt(e.target.value) : null)}
      style={{ maxWidth: 180 }}
    >
      <option value="">— выбрать персонажа —</option>
      {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}
