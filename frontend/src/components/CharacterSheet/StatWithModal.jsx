import { useState } from 'react';
import { Group, Text, UnstyledButton, Badge, Modal, NumberInput } from '@mantine/core';
import { formatMod } from '../../utils/dnd';
import { rollAndNotify } from '../../utils/roll';

export default function StatWithModal({ label, base, manualBonus, onChangeManualBonus, rollable }) {
  const [opened, setOpened] = useState(false);
  const total = (base ?? 0) + (manualBonus || 0);
  const display = rollable ? formatMod(total) : total;

  return (
    <Group gap={6} wrap="nowrap">
      <UnstyledButton onClick={() => setOpened(true)} aria-label={`открыть ${label}`}>
        <Text size="xs" c="dimmed">{label}</Text>
      </UnstyledButton>

      {rollable ? (
        <UnstyledButton onClick={() => rollAndNotify(label, total)}>
          <Badge variant="light" className="mono" style={{ cursor: 'pointer', minWidth: 34 }}>{display}</Badge>
        </UnstyledButton>
      ) : (
        <Badge variant="light" className="mono" style={{ minWidth: 34 }}>{display}</Badge>
      )}

      <Modal opened={opened} onClose={() => setOpened(false)} title={label} centered size="xs" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
        <NumberInput
          label="Ручная поправка"
          value={manualBonus ?? 0}
          onChange={(v) => onChangeManualBonus(typeof v === 'number' ? v : 0)}
          autoFocus
        />
      </Modal>
    </Group>
  );
}
