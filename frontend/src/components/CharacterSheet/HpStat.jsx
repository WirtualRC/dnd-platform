import { useState } from 'react';
import { Modal, NumberInput, UnstyledButton, Text, Stack } from '@mantine/core';

export default function HpStat({ current, max, temp, onChangeCurrent, onChangeMax, onChangeTemp }) {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState({ current: current ?? 0, max: max ?? 0, temp: temp ?? 0 });

  function handleOpen() {
    setDraft({ current: current ?? 0, max: max ?? 0, temp: temp ?? 0 });
    setOpened(true);
  }

  // применяем правку только при закрытии окна — иначе каждая нажатая
  // клавиша дёргает стору целиком и подвешивает интерфейс
  function handleClose() {
    setOpened(false);
    onChangeCurrent(draft.current);
    onChangeMax(draft.max);
    onChangeTemp(draft.temp);
  }

  return (
    <>
      <UnstyledButton onClick={handleOpen} style={styles.wrap} aria-label="открыть здоровье">
        <Text size="10px" c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }}>HP</Text>
        <Text fw={700} size="lg" className="mono" style={{ color: 'var(--health)' }}>
          {current ?? '—'} / {max ?? '—'}{temp ? ` (+${temp})` : ''}
        </Text>
      </UnstyledButton>

      <Modal opened={opened} onClose={handleClose} title="Здоровье" centered size="xs" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
        <Stack>
          <NumberInput label="Текущее HP" value={draft.current} onChange={(v) => setDraft((d) => ({ ...d, current: typeof v === 'number' ? v : 0 }))} autoFocus styles={{ input: { color: 'var(--health)' } }} />
          <NumberInput label="Максимум HP" value={draft.max} onChange={(v) => setDraft((d) => ({ ...d, max: typeof v === 'number' ? v : 0 }))} styles={{ input: { color: 'var(--health)' } }} />
          <NumberInput label="Временное HP" value={draft.temp} onChange={(v) => setDraft((d) => ({ ...d, temp: typeof v === 'number' ? v : 0 }))} styles={{ input: { color: 'var(--health)' } }} />
        </Stack>
      </Modal>
    </>
  );
}

const styles = {
  wrap: { textAlign: 'center', padding: '2px 6px' },
};
