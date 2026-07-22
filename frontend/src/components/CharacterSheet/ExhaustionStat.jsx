import { useState } from 'react';
import { Paper, Text, UnstyledButton, Modal, NumberInput, Stack } from '@mantine/core';

export default function ExhaustionStat({ value, onChange }) {
  const [opened, setOpened] = useState(false);
  const [draftValue, setDraftValue] = useState(value ?? 0);

  function handleOpen() {
    setDraftValue(value ?? 0);
    setOpened(true);
  }

  // применяем правку только при закрытии окна — иначе каждая нажатая
  // клавиша дёргает стору целиком и подвешивает интерфейс
  function handleClose() {
    setOpened(false);
    onChange(draftValue);
  }

  return (
    <Paper withBorder p="xs" style={{ minWidth: 88 }}>
      <Stack gap="0" align="stretch">
        <Text size="10px" c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }}>Истощение</Text>
        <UnstyledButton onClick={handleOpen} aria-label="открыть истощение">
          <Text fw={700} size="lg" className="mono" align="center">{value ?? 0}</Text>
        </UnstyledButton>
      </Stack>
      <Modal opened={opened} onClose={handleClose} title="Истощение" centered size="xs" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
        <NumberInput
          value={draftValue}
          onChange={(v) => setDraftValue(typeof v === 'number' ? v : 0)}
          min={0} max={6} autoFocus size="lg" aria-label="Истощение"
        />
      </Modal>
    </Paper>
  );
}
