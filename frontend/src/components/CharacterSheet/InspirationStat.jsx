import { useState } from 'react';
import { Paper, Text, UnstyledButton, Modal, NumberInput, Stack, Group } from '@mantine/core';

export default function InspirationStat({ value, onChange }) {
  const count = value || 0;
  const [opened, setOpened] = useState(false);
  const [draftValue, setDraftValue] = useState(count);

  function handleOpen() {
    setDraftValue(count);
    setOpened(true);
  }

  // применяем правку только при закрытии окна — иначе каждая нажатая
  // клавиша дёргает стору целиком и подвешивает интерфейс
  function handleClose() {
    setOpened(false);
    onChange(draftValue);
  }

  return (
    <Paper withBorder p="xs" style={styles.box}>
      <Stack gap="0" align="stretch">
        <Text size="10px" c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }}>Вдохновение</Text>
        <UnstyledButton onClick={handleOpen} aria-label={`вдохновение: ${count}`}>
          <Group gap={4} justify="center" wrap="nowrap">
            <Text fw={700} size="29" style={{ opacity: count > 0 ? 1 : 0.1, lineHeight: 1 }}>✨</Text>
            {count > 0 && <Text fw={700} size="md" className="mono">x{count}</Text>}
          </Group>
        </UnstyledButton>
      </Stack>
      <Modal opened={opened} onClose={handleClose} title="Вдохновение" centered size="xs" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
        <NumberInput
          value={draftValue}
          onChange={(v) => setDraftValue(typeof v === 'number' ? v : 0)}
          min={0} autoFocus size="lg" aria-label="Вдохновение"
        />
      </Modal>
    </Paper>
  );
}

const styles = {
  box: { textAlign: 'center', minWidth: 88 },
};
