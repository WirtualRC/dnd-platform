import { useState } from 'react';
import { Paper, Text, UnstyledButton, Modal, TagsInput, Stack } from '@mantine/core';
import { STANDARD_CONDITIONS } from '../../utils/conditions';

export default function ConditionsStat({ conditions, onChange, style }) {
  const [opened, setOpened] = useState(false);
  const list = conditions || [];
  const [draftList, setDraftList] = useState(list);

  function handleOpen() {
    setDraftList(list);
    setOpened(true);
  }

  // применяем правку только при закрытии окна — иначе каждое добавление
  // или удаление тега дёргает стору целиком и подвешивает интерфейс
  function handleClose() {
    setOpened(false);
    onChange(draftList);
  }

  return (
    <Paper withBorder p="xs" style={{ ...styles.box, ...style }}>
      <Stack gap="0" align="stretch">
        <Text size="10px" c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }}>Состояния</Text>
        <UnstyledButton onClick={handleOpen} style={{ width: '100%' }} aria-label="открыть состояния">
          <Text size="sm" fw={600} style={{ minHeight: 22 }} align="center">
            {list.length > 0 ? list.join(', ') : '—'}
          </Text>
        </UnstyledButton>
      </Stack>
      <Modal opened={opened} onClose={handleClose} title="Состояния" centered size="sm" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
        <TagsInput
          label="Активные состояния"
          placeholder="начни вводить или выбери из списка"
          data={STANDARD_CONDITIONS}
          value={draftList}
          onChange={setDraftList}
        />
      </Modal>
    </Paper>
  );
}

const styles = {
  box: { textAlign: 'center', flex: 1, minWidth: 200 },
};
