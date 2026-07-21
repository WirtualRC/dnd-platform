import { useState, useEffect } from 'react';
import { Modal, TextInput, Textarea, NumberInput, Select, Checkbox, Stack, Group, Button } from '@mantine/core';
import { ABILITIES, ABILITY_LABELS } from '../../utils/dnd';

const CASTING_TIME_OPTIONS = [
  { value: 'action', label: 'Действие' },
  { value: 'bonusAction', label: 'Бонусное действие' },
  { value: 'reaction', label: 'Реакция' },
];

export default function AttackModal({ opened, onClose, attack, onSave, onDelete }) {
  const [draft, setDraft] = useState(attack);
  useEffect(() => { setDraft(attack); }, [attack, opened]);
  if (!draft) return null;

  function patch(fields) { setDraft((d) => ({ ...d, ...fields })); }
  function setCastingTime(value) {
    patch({ action: value === 'action', bonusAction: value === 'bonusAction', reaction: value === 'reaction' });
  }
  function save() { onSave(draft); onClose(); }

  const castingTimeValue = draft.reaction ? 'reaction' : draft.bonusAction ? 'bonusAction' : 'action';

  return (
    <Modal opened={opened} onClose={onClose} title={attack?.name ? 'Изменить атаку' : 'Новая атака'} centered size="sm" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
      <Stack gap="sm">
        <TextInput label="Название" value={draft.name || ''} onChange={(e) => patch({ name: e.target.value })} autoFocus />

        <Group grow>
          <Select label="Характеристика" data={ABILITIES.map((a) => ({ value: a, label: ABILITY_LABELS[a] }))} value={draft.ability || 'str'} onChange={(v) => patch({ ability: v })} />
          <Select label="Время" data={CASTING_TIME_OPTIONS} value={castingTimeValue} onChange={setCastingTime} />
        </Group>

        <Checkbox label="Владение (бонус мастерства к атаке)" checked={!!draft.prof} onChange={(e) => patch({ prof: e.currentTarget.checked })} />

        <Group grow>
          <TextInput label="Кости урона" placeholder="напр. 2d6" value={draft.damage || ''} onChange={(e) => patch({ damage: e.target.value })} />
          <NumberInput label="Поправка атаки" value={draft.attack_bonus ?? 0} onChange={(v) => patch({ attack_bonus: typeof v === 'number' ? v : 0 })} />
          <NumberInput label="Поправка урона" value={draft.damage_bonus ?? 0} onChange={(v) => patch({ damage_bonus: typeof v === 'number' ? v : 0 })} />
        </Group>

        <Textarea label="Описание" value={draft.desc || ''} onChange={(e) => patch({ desc: e.target.value })} rows={2} autosize />

        <Group justify="space-between" mt="xs">
          {attack?.name ? <Button variant="subtle" color="red" onClick={() => { onDelete(); onClose(); }}>Удалить</Button> : <div />}
          <Group>
            <Button variant="subtle" onClick={onClose}>Отмена</Button>
            <Button onClick={save} disabled={!draft.name?.trim()}>Сохранить</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
