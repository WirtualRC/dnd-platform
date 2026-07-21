import { useState } from 'react';
import { Paper, Avatar, TextInput, Modal, Group, Stack, UnstyledButton } from '@mantine/core';
import EditableNumberStat from './EditableNumberStat';
import RaceClassStat from './RaceClassStat';
import HpStat from './HpStat';
import IconUploadField from './IconUploadField';

export default function CharacterHeader({ current, sheet, updateName, updateAvatarUrl, set }) {
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const vitality = sheet.vitality || {};

  return (
    <Paper withBorder p="md" mb="md">
      <Group align="center" gap="lg" wrap="wrap">
        <UnstyledButton onClick={() => setAvatarModalOpen(true)} aria-label="открыть аватар">
          <Avatar src={current.avatar_url || undefined} size={72} radius="xl" />
        </UnstyledButton>

        <Stack gap={2} style={{ minWidth: 180 }}>
          <TextInput
            value={current.name}
            onChange={(e) => updateName(e.target.value)}
            variant="unstyled"
            placeholder="имя персонажа"
            styles={{ input: { fontSize: 24, fontWeight: 700, color: 'var(--accent)', padding: 0 } }}
          />
          <RaceClassStat
            race={sheet.race}
            className={sheet.class_name}
            onChangeRace={(v) => set(['race'], v)}
            onChangeClass={(v) => set(['class_name'], v)}
          />
        </Stack>

        <Group gap="xs" wrap="wrap" style={{ flex: 1 }}>
          <EditableNumberStat label="Уровень" value={sheet.level} onChange={(v) => set(['level'], v)} />
          <EditableNumberStat label="КД" value={vitality.ac} onChange={(v) => set(['vitality', 'ac'], v)} />
          <EditableNumberStat label="Скорость" value={vitality.speed} suffix=" фт" onChange={(v) => set(['vitality', 'speed'], v)} />
          <EditableNumberStat label="Бонус влад." value={sheet.proficiency_bonus} onChange={(v) => set(['proficiency_bonus'], v)} />
          <EditableNumberStat label="Золото" value={sheet.coins?.gp} onChange={(v) => set(['coins', 'gp'], v)} />
          <HpStat
            current={vitality.hp_current}
            max={vitality.hp_max}
            temp={vitality.hp_temp}
            onChangeCurrent={(v) => set(['vitality', 'hp_current'], v)}
            onChangeMax={(v) => set(['vitality', 'hp_max'], v)}
            onChangeTemp={(v) => set(['vitality', 'hp_temp'], v)}
          />
        </Group>
      </Group>

      <Modal opened={avatarModalOpen} onClose={() => setAvatarModalOpen(false)} title="Аватар" centered size="xs" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
        <IconUploadField value={current.avatar_url} onChange={updateAvatarUrl} size={64} />
      </Modal>
    </Paper>
  );
}
