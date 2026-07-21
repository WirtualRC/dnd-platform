import { useState } from 'react';
import { Group, Text, UnstyledButton, Badge, Modal, NumberInput } from '@mantine/core';
import Checkdot from './Checkdot';
import { formatMod } from '../../utils/dnd';
import { rollAndNotify } from '../../utils/roll';

/**
 * Общая строка для спасброска и навыка — раньше тут был инпут ручной
 * поправки прямо в строке, теперь клик по названию открывает модалку.
 */
export default function SkillRow({
  displayLabel, a11yLabel, prof, expertity, allowExpertise,
  bonus, total, advantage, disadvantage, onChangeProf, onChangeBonus, stretch = true,
}) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <Group gap={6} wrap="nowrap">
      <Checkdot
        prof={prof}
        expertity={expertity}
        allowExpertise={allowExpertise}
        onChange={onChangeProf}
        label={a11yLabel}
      />
      <UnstyledButton
        onClick={() => setModalOpen(true)}
        style={stretch ? { flex: 1, textAlign: 'left' } : { textAlign: 'left' }}
        aria-label={`открыть ${a11yLabel}`}
      >
        <Text size="sm">{displayLabel}</Text>
      </UnstyledButton>
      <UnstyledButton onClick={() => rollAndNotify(a11yLabel, total, { advantage, disadvantage })}>
        <Badge variant="light" className="mono" style={{ cursor: 'pointer', minWidth: 42 }}>
          {formatMod(total)}
        </Badge>
      </UnstyledButton>

      <Modal
        opened={modalOpen} onClose={() => setModalOpen(false)} title={displayLabel}
        centered size="xs" closeButtonProps={{ 'aria-label': 'Закрыть' }}
      >
        <NumberInput
          label="Ручная поправка"
          value={bonus ?? 0}
          onChange={(v) => onChangeBonus(typeof v === 'number' ? v : 0)}
          autoFocus
        />
      </Modal>
    </Group>
  );
}
