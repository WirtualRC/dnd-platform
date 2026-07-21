import { useState, useEffect, useRef } from 'react';
import { useCharacterStore } from '../../store/useCharacterStore';
import { useBattleMapStore } from '../../store/useBattleMapStore';

export default function TemplateModal({ opened, onClose, roomId, kind }) {
  const { characters, loadCharacters } = useCharacterStore();
  const createTemplate = useBattleMapStore((s) => s.createTemplate);

  const [label, setLabel] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkCharacter, setLinkCharacter] = useState(kind === 'pc');
  const [characterId, setCharacterId] = useState('');
  const panelRef = useRef(null);

  useEffect(() => { if (opened && characters.length === 0) loadCharacters(); }, [opened]);
  useEffect(() => {
    setLinkCharacter(kind === 'pc');
    setCharacterId('');
    setLabel('');
    setImageUrl('');
  }, [kind, opened]);

  // клик вне панели закрывает её — та же схема, что и в MapRoster
  useEffect(() => {
    if (!opened) return undefined;
    function handleOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [opened, onClose]);

  if (!opened) return null;

  function handleSubmit(e) {
    e.preventDefault();
    createTemplate(roomId, {
      kind,
      characterId: linkCharacter && characterId ? parseInt(characterId, 10) : null,
      label: label.trim() || null,
      imageUrl: imageUrl.trim() || null,
    });
    onClose();
  }

  return (
    <form ref={panelRef} className="card" style={styles.panel} onSubmit={handleSubmit}>
      <h3 style={{ marginTop: 0 }}>
        {kind === 'pc' ? 'Новое представление персонажа' : 'Новое представление (NPC / саммон)'}
      </h3>

      {kind === 'npc' && (
        <label style={styles.checkboxRow}>
          <input
            type="checkbox" checked={linkCharacter}
            onChange={(e) => setLinkCharacter(e.target.checked)} style={{ width: 'auto' }}
          />
          Привязать лист персонажа
        </label>
      )}

      {linkCharacter ? (
        <select value={characterId} onChange={(e) => setCharacterId(e.target.value)} required style={styles.field}>
          <option value="">— выбрать персонажа —</option>
          {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      ) : (
        <input placeholder="название" value={label} onChange={(e) => setLabel(e.target.value)} style={styles.field} />
      )}

      <input
        placeholder="URL картинки (необязательно)" value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)} style={{ ...styles.field, marginBottom: 14 }}
      />

      <div className="row" style={{ justifyContent: 'flex-end', margin: 0 }}>
        <button type="button" className="secondary" onClick={onClose}>Отмена</button>
        <button type="submit">Создать</button>
      </div>
    </form>
  );
}

const styles = {
  panel: {
    // отдельная плавающая панель под TemplatePanel, а не оверлей поверх
    // всего экрана — тот же паттерн позиционирования, что у MapRoster
    position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)',
    width: 340, zIndex: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
    maxHeight: 'calc(100vh - 90px)', overflowY: 'auto',
  },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 14 },
  field: { width: '100%', marginBottom: 10 },
};
