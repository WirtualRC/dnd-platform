import { useState } from 'react';
import { Paper, Text, UnstyledButton, Modal, NumberInput, Stack } from '@mantine/core';
import { abilityModifier, initiativeTotal, formatMod } from '../../utils/dnd';
import { rollAndNotify } from '../../utils/roll';

export default function InitiativeStat({ sheet, onChangeBonus }) {
  const [opened, setOpened] = useState(false);
  const bonus = sheet.vitality?.initiative_bonus || 0;
  const total = initiativeTotal(sheet);

  return (
    <Paper withBorder p="xs" style={styles.box}>
      <Stack gap="0" align="stretch">
        <UnstyledButton onClick={() => setOpened(true)} aria-label="открыть инициативу">
          <Text size="10px" c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }}>Инициатива</Text>
        </UnstyledButton>
        <UnstyledButton onClick={() => rollAndNotify('Инициатива', total.value, total)} aria-label="бросок инициативы">
          <Text fw={700} size="lg" className="mono" align="center">{formatMod(total.value)}</Text>
        </UnstyledButton>
      </Stack>
      <Modal opened={opened} onClose={() => setOpened(false)} title="Инициатива" centered size="xs" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
        <Stack gap="xs">
          <Text size="sm" c="dimmed">База (модификатор Ловкости): {formatMod(abilityModifier(sheet.stats?.dex))}</Text>
          <NumberInput label="Ручная поправка" value={bonus} onChange={(v) => onChangeBonus(typeof v === 'number' ? v : 0)} autoFocus />
        </Stack>
      </Modal>
    </Paper>
  );
}

const styles = {
  box: { textAlign: 'center', minWidth: 88 },
};
