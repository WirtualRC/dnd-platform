import { Modal, Text, Group, NumberInput, Button, Stack, Divider } from '@mantine/core';
import { abilityCheckTotal, saveTotal, formatMod } from '../../utils/dnd';
import { rollAndNotify } from '../../utils/roll';
import Checkdot from './Checkdot';

export default function AbilityModal({ opened, onClose, label, abilityKey, sheet, onChangeAbility, onChangeSave }) {
  const data = sheet.stats?.[abilityKey];
  const check = abilityCheckTotal(sheet, abilityKey);
  const saveData = sheet.saves?.[abilityKey] || {};
  const save = saveTotal(sheet, abilityKey);

  return (
    <Modal opened={opened} onClose={onClose} title={label} centered size="sm" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
      <Stack align="center" gap={4} mb="md">
        <div style={styles.ring}>
          <Text size="32px" fw={800} className="mono">{formatMod(check.value)}</Text>
        </div>
        <Text size="xs" c="dimmed" tt="uppercase">модификатор</Text>
      </Stack>

      <Group grow mb="md">
        <NumberInput
          label="Значение"
          value={data?.score ?? 10}
          onChange={(v) => onChangeAbility({ ...data, score: typeof v === 'number' ? v : 0 })}
        />
        <NumberInput
          label="Поправка"
          value={data?.score_bonus ?? 0}
          onChange={(v) => onChangeAbility({ ...data, score_bonus: typeof v === 'number' ? v : 0 })}
        />
      </Group>

      <Button fullWidth variant="light" mb="md" onClick={() => rollAndNotify(`Проверка: ${label}`, check.value, check)}>
        Бросить проверку ({formatMod(check.value)})
      </Button>

      <Divider mb="md" />

      <Group justify="space-between">
        <Group gap={8}>
          <Checkdot
            prof={!!saveData.prof}
            expertity={false}
            allowExpertise={false}
            onChange={({ prof }) => onChangeSave({ ...saveData, prof })}
            label={`спасбросок ${label}`}
          />
          <Text size="sm">Спасбросок</Text>
        </Group>
        <Button variant="subtle" size="xs" onClick={() => rollAndNotify(`Спасбросок: ${label}`, save.value, save)}>
          {formatMod(save.value)}
        </Button>
      </Group>
    </Modal>
  );
}

const styles = {
  ring: {
    width: 76, height: 76, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '2px solid var(--accent)', background: 'rgba(71, 118, 230, 0.08)', color: 'var(--accent)',
  },
};
