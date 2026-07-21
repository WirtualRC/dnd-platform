import { useState, useEffect } from 'react';
import { Modal, TextInput, Textarea, NumberInput, Select, Stack, Group, Button, Divider } from '@mantine/core';
import { MODIFIER_TARGETS } from '../../utils/dnd';

const MODIFIER_TYPE_OPTIONS = [
  { value: 'bonus', label: 'Бонус (число)' },
  { value: 'advantage', label: 'Преимущество' },
  { value: 'disadvantage', label: 'Помеха' },
];

const NO_MODIFIER = '__none__';

export default function FeatureModal({ opened, onClose, feature, onSave, onDelete }) {
  const [draft, setDraft] = useState(feature);

  useEffect(() => { setDraft(feature); }, [feature, opened]);

  if (!draft) return null;

  function patch(fields) { setDraft((d) => ({ ...d, ...fields })); }
  function save() { onSave(draft); onClose(); }

  return (
    <Modal
      opened={opened} onClose={onClose} title={feature?.name ? 'Изменить способность' : 'Новая способность'}
      centered size="sm" closeButtonProps={{ 'aria-label': 'Закрыть' }}
    >
      <Stack gap="sm">
        <TextInput label="Название" value={draft.name || ''} onChange={(e) => patch({ name: e.target.value })} autoFocus />
        <Textarea
          label="Описание"
          value={draft.description || ''}
          onChange={(e) => patch({ description: e.target.value })}
          rows={3} autosize
          placeholder="Для перебросов/реакций/условной логики — просто опиши правило текстом, авторасчёт это не покрывает"
        />

        <Divider label="Автобонус" labelPosition="left" />
        <Select
          label="Цель бонуса"
          searchable
          data={[{ value: NO_MODIFIER, label: 'Без бонуса' }, ...MODIFIER_TARGETS]}
          value={draft.modifier?.target || NO_MODIFIER}
          onChange={(value) => {
            if (value === NO_MODIFIER) patch({ modifier: null });
            else patch({ modifier: { target: value, type: draft.modifier?.type || 'bonus', value: draft.modifier?.value ?? 1 } });
          }}
        />
        {draft.modifier && (
          <Group grow>
            <Select
              label="Тип" data={MODIFIER_TYPE_OPTIONS} value={draft.modifier.type}
              onChange={(value) => patch({ modifier: { ...draft.modifier, type: value } })}
            />
            {draft.modifier.type === 'bonus' && (
              <NumberInput
                label="Значение" value={draft.modifier.value ?? 0}
                onChange={(v) => patch({ modifier: { ...draft.modifier, value: typeof v === 'number' ? v : 0 } })}
              />
            )}
          </Group>
        )}

        <Group justify="space-between" mt="xs">
          {feature?.name ? (
            <Button variant="subtle" color="red" onClick={() => { onDelete(); onClose(); }}>Удалить</Button>
          ) : <div />}
          <Group>
            <Button variant="subtle" onClick={onClose}>Отмена</Button>
            <Button onClick={save} disabled={!draft.name?.trim()}>Сохранить</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
