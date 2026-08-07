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
  const [draftBonus, setDraftBonus] = useState(bonus ?? 0);

  function handleOpen() {
    setDraftBonus(bonus ?? 0);
    setModalOpen(true);
  }

  // применяем правку только при закрытии окна — иначе каждая нажатая
  // клавиша дёргает стору целиком и подвешивает интерфейс
  function handleClose() {
    setModalOpen(false);
    onChangeBonus(draftBonus);
  }

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
        onClick={handleOpen}
        style={stretch ? { flex: 1, textAlign: 'left' } : { textAlign: 'left' }}
        aria-label={`открыть ${a11yLabel}`}
      >
        {/* <Text size="sm">{displayLabel}</Text> */}
        <Text size={stretch ? 'sm' : 'xs'} c={stretch ? undefined : 'dimmed'}>{displayLabel}</Text>
      </UnstyledButton>
      <UnstyledButton
        onClick={(e) => rollAndNotify(a11yLabel, total, {
          advantage: advantage || e.shiftKey,
          disadvantage: disadvantage || e.ctrlKey,
        })}
      >
        <Badge variant="light" className="mono" style={{ cursor: 'pointer', minWidth: 42 }}>
          {formatMod(total)}
        </Badge>
      </UnstyledButton>

      <Modal
        opened={modalOpen} onClose={handleClose} title={displayLabel}
        centered size="xs" closeButtonProps={{ 'aria-label': 'Закрыть' }}
      >
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
