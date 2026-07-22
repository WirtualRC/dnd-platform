import { useState } from 'react';
import { Group, Text, UnstyledButton, Badge, Modal, NumberInput } from '@mantine/core';
import { formatMod } from '../../utils/dnd';
import { rollAndNotify } from '../../utils/roll';

export default function StatWithModal({ label, base, manualBonus, onChangeManualBonus, rollable }) {
  const [opened, setOpened] = useState(false);
  const [draftBonus, setDraftBonus] = useState(manualBonus ?? 0);
  const total = (base ?? 0) + (manualBonus || 0);
  const display = rollable ? formatMod(total) : total;

  function handleOpen() {
    setDraftBonus(manualBonus ?? 0);
    setOpened(true);
  }

  // применяем правку только при закрытии окна — иначе каждая нажатая
  // клавиша дёргает стору целиком и подвешивает интерфейс
  function handleClose() {
    setOpened(false);
    onChangeManualBonus(draftBonus);
  }

  return (
    <Group gap={6} wrap="nowrap">
      <UnstyledButton onClick={handleOpen} aria-label={`открыть ${label}`}>
        <Text size="xs" c="dimmed">{label}</Text>
      </UnstyledButton>

      {rollable ? (
        <UnstyledButton onClick={() => rollAndNotify(label, total)}>
          <Badge variant="light" className="mono" style={{ cursor: 'pointer', minWidth: 34 }}>{display}</Badge>
        </UnstyledButton>
      ) : (
        <Badge variant="light" className="mono" style={{ minWidth: 34 }}>{display}</Badge>
      )}

      <Modal opened={opened} onClose={handleClose} title={label} centered size="xs" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
        <NumberInput
          label="Ручная поправка"
          value={draftBonus}
          onChange={(v) => setDraftBonus(typeof v === 'number' ? v : 0)}
          autoFocus
        />
      </Modal>
    </Group>
  );
}
