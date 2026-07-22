import { useState } from 'react';
import { Modal, TextInput, UnstyledButton, Text, Stack } from '@mantine/core';

export default function RaceClassStat({ race, className, onChangeRace, onChangeClass }) {
  const [opened, setOpened] = useState(false);
  const display = [race, className].filter(Boolean).join(' / ') || 'раса / класс';
  const [draft, setDraft] = useState({ race: race || '', className: className || '' });

  function handleOpen() {
    setDraft({ race: race || '', className: className || '' });
    setOpened(true);
  }

  // применяем правку только при закрытии окна — иначе каждая нажатая
  // клавиша дёргает стору целиком и подвешивает интерфейс
  function handleClose() {
    setOpened(false);
    onChangeRace(draft.race);
    onChangeClass(draft.className);
  }

  return (
    <>
      <UnstyledButton onClick={handleOpen} aria-label="открыть расу и класс">
        <Text size="sm" c="dimmed">{display}</Text>
      </UnstyledButton>

      <Modal opened={opened} onClose={handleClose} title="Раса и класс" centered size="xs" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
        <Stack>
          <TextInput label="Раса" value={draft.race} onChange={(e) => setDraft((d) => ({ ...d, race: e.target.value }))} autoFocus />
          <TextInput label="Класс" value={draft.className} onChange={(e) => setDraft((d) => ({ ...d, className: e.target.value }))} />
        </Stack>
      </Modal>
    </>
  );
}
