import { useState } from 'react';
import { Modal, NumberInput, UnstyledButton, Text, Stack } from '@mantine/core';

export default function HpStat({ current, max, temp, onChangeCurrent, onChangeMax, onChangeTemp }) {
  const [opened, setOpened] = useState(false);

  return (
    <>
      <UnstyledButton onClick={() => setOpened(true)} style={styles.wrap} aria-label="открыть здоровье">
        <Text size="10px" c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }}>HP</Text>
        <Text fw={700} size="lg" className="mono" style={{ color: 'var(--health)' }}>
          {current ?? '—'} / {max ?? '—'}{temp ? ` (+${temp})` : ''}
        </Text>
      </UnstyledButton>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Здоровье" centered size="xs" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
        <Stack>
          <NumberInput label="Текущее HP" value={current ?? 0} onChange={(v) => onChangeCurrent(typeof v === 'number' ? v : 0)} autoFocus styles={{ input: { color: 'var(--health)' } }} />
          <NumberInput label="Максимум HP" value={max ?? 0} onChange={(v) => onChangeMax(typeof v === 'number' ? v : 0)} styles={{ input: { color: 'var(--health)' } }} />
          <NumberInput label="Временное HP" value={temp ?? 0} onChange={(v) => onChangeTemp(typeof v === 'number' ? v : 0)} styles={{ input: { color: 'var(--health)' } }} />
        </Stack>
      </Modal>
    </>
  );
}

const styles = {
  wrap: { textAlign: 'center', padding: '2px 6px' },
};
