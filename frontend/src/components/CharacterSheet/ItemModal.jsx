import { useState, useEffect } from 'react';
import { Modal, TextInput, Textarea, Checkbox, NumberInput, Select, Stack, Group, Button, Divider, Switch } from '@mantine/core';
import { MODIFIER_TARGETS } from '../../utils/dnd';
import AoeField from './AoeField';

const MODIFIER_TYPE_OPTIONS = [
  { value: 'bonus', label: 'Бонус (число)' },
  { value: 'advantage', label: 'Преимущество' },
  { value: 'disadvantage', label: 'Помеха' },
];

const NO_MODIFIER = '__none__';

export default function ItemModal({ opened, onClose, item, onSave, onDelete }) {
  const [draft, setDraft] = useState(item);

  // item меняется при каждом открытии (новый черновик или существующий
  // предмет) — синхронизируем локальный черновик с ним
  useEffect(() => { setDraft(item); }, [item, opened]);

  if (!draft) return null;

  function patch(fields) { setDraft((d) => ({ ...d, ...fields })); }
  function save() { onSave(draft); onClose(); }

  return (
    <Modal
      opened={opened} onClose={onClose} title={item?.name ? 'Изменить предмет' : 'Новый предмет'}
      centered size="sm" closeButtonProps={{ 'aria-label': 'Закрыть' }}
    >
      <Stack gap="sm">
        <TextInput label="Название" value={draft.name || ''} onChange={(e) => patch({ name: e.target.value })} autoFocus />
        <Textarea label="Описание" value={draft.description || ''} onChange={(e) => patch({ description: e.target.value })} rows={2} autosize />

        <Group grow align="flex-start">
          <Checkbox
            label="Надето (бонус активен)"
            checked={draft.equipped !== false}
            onChange={(e) => patch({ equipped: e.currentTarget.checked })}
            mt={22}
          />
          <NumberInput
            label="Количество (для расходников)"
            value={draft.quantity ?? ''}
            onChange={(v) => patch({ quantity: typeof v === 'number' ? v : null })}
            placeholder="не отслеживается"
          />
        </Group>

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

        <Divider label="Использование в бою" labelPosition="left" />
        <Switch
          label="Расходуется в бою — добавить в хотбар"
          checked={!!draft.usable}
          onChange={(e) => patch({ usable: e.currentTarget.checked ? { type: 'spell', damage: '', range: null, aoe: null } : null })}
        />
        {draft.usable && (
          <>
            <Group grow>
              <Select
                label="Тип" data={[{ value: 'attack', label: 'Атака' }, { value: 'spell', label: 'Эффект' }]}
                value={draft.usable.type} onChange={(value) => patch({ usable: { ...draft.usable, type: value } })}
              />
              <TextInput
                label="Урон/эффект" placeholder="напр. 2d4+2" value={draft.usable.damage || ''}
                onChange={(e) => patch({ usable: { ...draft.usable, damage: e.target.value } })}
              />
            </Group>
            <NumberInput
              label="Дальность, фт" value={draft.usable.range ?? ''}
              onChange={(v) => patch({ usable: { ...draft.usable, range: typeof v === 'number' ? v : null } })}
            />
            <AoeField
              aoe={draft.usable.aoe}
              onChange={(aoe) => patch({ usable: { ...draft.usable, aoe } })}
            />
          </>
        )}

        <Group justify="space-between" mt="xs">
          {item?.name ? (
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
