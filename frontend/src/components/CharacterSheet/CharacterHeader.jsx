import { useState } from 'react';
import { Paper, Avatar, TextInput, Modal, Group, Stack, UnstyledButton, Text } from '@mantine/core';
import EditableNumberStat from './EditableNumberStat';
import RaceClassStat from './RaceClassStat';
import HpStat from './HpStat';
import IconUploadField from './IconUploadField';
import CurrencyModal from './CurrencyModal';

const COIN_RATE_TO_GP = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

export default function CharacterHeader({ current, sheet, updateName, updateAvatarUrl, set }) {
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const vitality = sheet.vitality || {};
  const coins = sheet.coins || {};
  const totalGold = Object.entries(COIN_RATE_TO_GP).reduce((sum, [key, rate]) => sum + (coins[key] || 0) * rate, 0);

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
          <UnstyledButton onClick={() => setCurrencyModalOpen(true)} style={{ textAlign: 'center', padding: '2px 6px' }} aria-label="открыть золото">
            <Text size="10px" c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }}>Золото</Text>
            <Text fw={700} size="lg" className="mono" style={{ color: '#e0b34e' }}>{Math.round(totalGold * 100) / 100}</Text>
          </UnstyledButton>
          <HpStat
            current={vitality.hp_current}
            max={vitality.hp_max}
            temp={vitality.hp_temp}
            onChangeCurrent={(v) => set(['vitality', 'hp_current'], v)}
            onChangeMax={(v) => set(['vitality', 'hp_max'], v)}
            onChangeTemp={(v) => set(['vitality', 'hp_temp'], v)}
            deathSaveSuccesses={vitality.death_save_successes}
            deathSaveFailures={vitality.death_save_failures}
            onChangeDeathSaveSuccesses={(v) => set(['vitality', 'death_save_successes'], v)}
            onChangeDeathSaveFailures={(v) => set(['vitality', 'death_save_failures'], v)}
          />
        </Group>
      </Group>

      <Modal opened={avatarModalOpen} onClose={() => setAvatarModalOpen(false)} title="Аватар" centered size="xs" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
        <IconUploadField value={current.avatar_url} onChange={updateAvatarUrl} size={64} />
      </Modal>

      <CurrencyModal
        opened={currencyModalOpen}
        onClose={() => setCurrencyModalOpen(false)}
        coins={coins}
        onChange={(next) => set(['coins'], next)}
      />
    </Paper>
  );
}
