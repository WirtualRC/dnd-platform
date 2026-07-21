import { useState } from 'react';
import { Paper, Text, UnstyledButton, Modal, TagsInput, Stack } from '@mantine/core';

const STANDARD_CONDITIONS = [
  'Ослеплён', 'Очарован', 'Оглушён', 'Испуган', 'Схвачен', 'Недееспособен',
  'Невидим', 'Парализован', 'Окаменел', 'Отравлен', 'Ничком', 'Обездвижен',
  'Ошеломлён', 'Без сознания',
];

export default function ConditionsStat({ conditions, onChange, style }) {
  const [opened, setOpened] = useState(false);
  const list = conditions || [];

  return (
    <Paper withBorder p="xs" style={{ ...styles.box, ...style }}>
      <Stack gap="0" align="stretch">
        <Text size="10px" c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }}>Состояния</Text>
        <UnstyledButton onClick={() => setOpened(true)} style={{ width: '100%' }} aria-label="открыть состояния">
          <Text size="sm" fw={600} style={{ minHeight: 22 }} align="center">
            {list.length > 0 ? list.join(', ') : '—'}
          </Text>
        </UnstyledButton>
      </Stack>
      <Modal opened={opened} onClose={() => setOpened(false)} title="Состояния" centered size="sm" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
        <TagsInput
          label="Активные состояния"
          placeholder="начни вводить или выбери из списка"
          data={STANDARD_CONDITIONS}
          value={list}
          onChange={onChange}
        />
      </Modal>
    </Paper>
  );
}

const styles = {
  box: { textAlign: 'center', flex: 1, minWidth: 200 },
};
