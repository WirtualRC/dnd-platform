import { useState } from 'react';
import { Modal, TextInput, Button, Group } from '@mantine/core';
import { useBattleMapStore } from '../../store/useBattleMapStore';

export default function BattleMapSwitcher({ roomId, isGm }) {
  const maps = useBattleMapStore((s) => s.maps);
  const activeMapId = useBattleMapStore((s) => s.activeMapId);
  const { switchMap, createMap, renameMap, deleteMap } = useBattleMapStore();

  // свёрнуто по умолчанию — элементы управления картами нужны GM нечасто
  // (в основном во время подготовки), не должны постоянно занимать место
  // в углу экрана во время самого боя
  const [expanded, setExpanded] = useState(false);
  const [modalMode, setModalMode] = useState(null); // null | 'create' | 'rename'
  const [draftName, setDraftName] = useState('');

  const activeMap = maps.find((m) => m.id === activeMapId);

  if (!isGm) {
    return <span style={styles.readonly}>{activeMap?.name || ''}</span>;
  }

  if (!expanded) {
    return (
      <button
        className="secondary"
        title={`Боевые карты (${activeMap?.name || '—'})`}
        onClick={() => setExpanded(true)}
      >
        ▼
      </button>
    );
  }

  function openCreate() {
    setDraftName('');
    setModalMode('create');
  }

  function openRename() {
    if (!activeMap) return;
    setDraftName(activeMap.name);
    setModalMode('rename');
  }

  async function handleSubmit() {
    const name = draftName.trim();
    if (!name) return;
    if (modalMode === 'create') {
      await createMap(roomId, name);
    } else if (modalMode === 'rename' && activeMap) {
      await renameMap(roomId, activeMap.id, name);
    }
    setModalMode(null);
  }

  async function handleDelete() {
    if (!activeMap) return;
    if (!window.confirm(`Удалить карту «${activeMap.name}»? Все токены на ней будут удалены.`)) return;
    await deleteMap(roomId, activeMap.id);
  }

  return (
    <div style={styles.row}>
      <select
        value={activeMapId || ''}
        onChange={(e) => switchMap(roomId, parseInt(e.target.value, 10))}
        style={styles.select}
      >
        {maps.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <button className="secondary" title="Новая карта" onClick={openCreate}>+</button>
      <button className="secondary" title="Переименовать карту" onClick={openRename} disabled={!activeMap}>✎</button>
      <button className="secondary" title="Удалить карту" onClick={handleDelete} disabled={maps.length <= 1}>✕</button>
      <button className="secondary" title="Свернуть" onClick={() => setExpanded(false)}>▲</button>

      <Modal
        opened={modalMode !== null}
        onClose={() => setModalMode(null)}
        title={modalMode === 'create' ? 'Новая карта' : 'Переименовать карту'}
        centered
        size="sm"
      >
        <TextInput
          label="Название"
          value={draftName}
          onChange={(e) => setDraftName(e.currentTarget.value)}
          maxLength={100}
          data-autofocus
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={() => setModalMode(null)}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={!draftName.trim()}>Сохранить</Button>
        </Group>
      </Modal>
    </div>
  );
}

const styles = {
  row: { display: 'flex', alignItems: 'center', gap: 6 },
  select: { maxWidth: 160 },
  readonly: {
    fontSize: 12, color: 'var(--text-dim)', background: 'var(--surface-1)',
    border: '1px solid var(--border)', padding: '6px 10px', borderRadius: 8,
  },
};
