import { useState } from 'react';
import { Modal, TextInput, UnstyledButton, Text, Stack } from '@mantine/core';

export default function RaceClassStat({ race, className, onChangeRace, onChangeClass }) {
  const [opened, setOpened] = useState(false);
  const display = [race, className].filter(Boolean).join(' / ') || 'раса / класс';

  return (
    <>
      <UnstyledButton onClick={() => setOpened(true)} aria-label="открыть расу и класс">
        <Text size="sm" c="dimmed">{display}</Text>
      </UnstyledButton>

      <Modal opened={opened} onClose={() => setOpened(false)} title="Раса и класс" centered size="xs" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
        <Stack>
          <TextInput label="Раса" value={race || ''} onChange={(e) => onChangeRace(e.target.value)} autoFocus />
          <TextInput label="Класс" value={className || ''} onChange={(e) => onChangeClass(e.target.value)} />
        </Stack>
      </Modal>
    </>
  );
}
