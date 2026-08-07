import { useState, useEffect } from 'react';
import { Modal, Text, Group, NumberInput, Button, Stack, Divider } from '@mantine/core';
import { abilityCheckTotal, saveTotal, formatMod } from '../../utils/dnd';
import { rollAndNotify } from '../../utils/roll';
import Checkdot from './Checkdot';

export default function AbilityModal({ opened, onClose, label, abilityKey, sheet, onChangeAbility, onChangeSave }) {
  const data = sheet.stats?.[abilityKey];
  const saveData = sheet.saves?.[abilityKey] || {};
  const [draftAbility, setDraftAbility] = useState(data || {});
  const [draftSave, setDraftSave] = useState(saveData);

  // подтягиваем актуальные значения только при открытии — правки внутри
  // окна живут в локальном состоянии и не трогают стору до закрытия,
  // иначе каждая нажатая клавиша дёргает всё дерево листа персонажа
  useEffect(() => {
    if (opened) {
      setDraftAbility(data || {});
      setDraftSave(saveData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const draftSheet = {
    ...sheet,
    stats: { ...sheet.stats, [abilityKey]: draftAbility },
    saves: { ...sheet.saves, [abilityKey]: draftSave },
  };
  const check = abilityCheckTotal(draftSheet, abilityKey);
  const save = saveTotal(draftSheet, abilityKey);

  function handleClose() {
    onChangeAbility(draftAbility);
    onChangeSave(draftSave);
    onClose();
  }

  return (
    <Modal opened={opened} onClose={handleClose} title={label} centered size="sm" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
      <Stack align="center" gap={4} mb="md">
        <div style={styles.ring}>
          <Text size="32px" fw={800} className="mono">{formatMod(check.value)}</Text>
        </div>
        <Text size="xs" c="dimmed" tt="uppercase">модификатор</Text>
      </Stack>

      <Group grow mb="md">
        <NumberInput
          label="Значение"
          value={draftAbility?.score ?? 10}
          onChange={(v) => setDraftAbility((d) => ({ ...d, score: typeof v === 'number' ? v : 0 }))}
        />
        <NumberInput
          label="Поправка"
          value={draftAbility?.score_bonus ?? 0}
          onChange={(v) => setDraftAbility((d) => ({ ...d, score_bonus: typeof v === 'number' ? v : 0 }))}
        />
      </Group>

      <Button
        fullWidth variant="light" mb="md"
        onClick={(e) => rollAndNotify(`Проверка: ${label}`, check.value, {
          ...check,
          advantage: check.advantage || e.shiftKey,
          disadvantage: check.disadvantage || e.ctrlKey,
        })}
      >
        Бросить проверку ({formatMod(check.value)})
      </Button>

      <Divider mb="md" />

      <Group justify="space-between">
        <Group gap={8}>
          <Checkdot
            prof={!!draftSave.prof}
            expertity={false}
            allowExpertise={false}
            onChange={({ prof }) => setDraftSave((s) => ({ ...s, prof }))}
            label={`спасбросок ${label}`}
          />
          <Text size="sm">Спасбросок</Text>
        </Group>
        <Button
          variant="subtle" size="xs"
          onClick={(e) => rollAndNotify(`Спасбросок: ${label}`, save.value, {
            ...save,
            advantage: save.advantage || e.shiftKey,
            disadvantage: save.disadvantage || e.ctrlKey,
          })}
        >
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
