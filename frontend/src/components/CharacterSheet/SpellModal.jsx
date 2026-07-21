import { useState, useEffect } from 'react';
import { Modal, TextInput, Textarea, NumberInput, Select, Checkbox, Stack, Group, Button, Divider } from '@mantine/core';
import { ABILITIES, ABILITY_LABELS } from '../../utils/dnd';
import AoeField from './AoeField';
import IconUploadField from './IconUploadField';

const CASTING_TIME_OPTIONS = [
  { value: 'action', label: 'Действие' },
  { value: 'bonusAction', label: 'Бонусное действие' },
  { value: 'reaction', label: 'Реакция' },
];

const NO_SAVE = '__none__';

export default function SpellModal({ opened, onClose, spell, onSave, onDelete }) {
  const [draft, setDraft] = useState(spell);
  useEffect(() => { setDraft(spell); }, [spell, opened]);
  if (!draft) return null;

  function patch(fields) { setDraft((d) => ({ ...d, ...fields })); }
  function setCastingTime(value) {
    patch({ action: value === 'action', bonusAction: value === 'bonusAction', reaction: value === 'reaction' });
  }
  function save() { onSave(draft); onClose(); }

  // иконка сохраняется сразу по загрузке, а не по кнопке "Сохранить" внизу —
  // иначе загрузка выглядит как законченное действие (превью меняется
  // мгновенно), а на деле пропадала бы при закрытии модалки без явного
  // сохранения остальных полей (см. тот же баг с аватаром персонажа)
  function saveIcon(icon_url) {
    const next = { ...draft, icon_url };
    setDraft(next);
    onSave(next);
  }

  const castingTimeValue = draft.reaction ? 'reaction' : draft.bonusAction ? 'bonusAction' : 'action';

  return (
    <Modal opened={opened} onClose={onClose} title={spell?.name ? 'Изменить заклинание' : 'Новое заклинание'} centered size="sm" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
      <Stack gap="sm">
        <TextInput label="Название" value={draft.name || ''} onChange={(e) => patch({ name: e.target.value })} autoFocus />
        <IconUploadField label="Иконка (для хотбара)" value={draft.icon_url} onChange={saveIcon} />

        <Group grow>
          <NumberInput label="Уровень (0 — заговор)" min={0} max={9} value={draft.tier ?? 0} onChange={(v) => patch({ tier: typeof v === 'number' ? v : 0 })} />
          <Select label="Время" data={CASTING_TIME_OPTIONS} value={castingTimeValue} onChange={setCastingTime} />
        </Group>

        <Checkbox label="Концентрация" checked={!!draft.concentration} onChange={(e) => patch({ concentration: e.currentTarget.checked })} />

        <NumberInput label="Дальность, фт" value={draft.range ?? ''} onChange={(v) => patch({ range: typeof v === 'number' ? v : null })} />
        <AoeField aoe={draft.aoe} onChange={(aoe) => patch({ aoe })} />
        <Checkbox label="Одна цель" checked={draft.singleTarget !== false} onChange={(e) => patch({ singleTarget: e.currentTarget.checked })} />

        <Divider label="Урон и спасбросок" labelPosition="left" />
        <Group grow>
          <TextInput label="Кости урона" placeholder="напр. 8d6" value={draft.damage || ''} onChange={(e) => patch({ damage: e.target.value })} />
          <TextInput label="Бонус за уровень ячейки" placeholder="напр. 1d6" value={draft.bonusPerTier || ''} onChange={(e) => patch({ bonusPerTier: e.target.value || null })} />
        </Group>
        <Select
          label="Спасбросок цели"
          data={[{ value: NO_SAVE, label: 'Без спасброска (атака заклинанием)' }, ...ABILITIES.map((a) => ({ value: a, label: ABILITY_LABELS[a] }))]}
          value={draft.save || NO_SAVE}
          onChange={(v) => patch({ save: v === NO_SAVE ? null : v })}
        />

        <Textarea label="Описание" value={draft.desc || ''} onChange={(e) => patch({ desc: e.target.value })} rows={2} autosize />

        <Group justify="space-between" mt="xs">
          {spell?.name ? <Button variant="subtle" color="red" onClick={() => { onDelete(); onClose(); }}>Удалить</Button> : <div />}
          <Group>
            <Button variant="subtle" onClick={onClose}>Отмена</Button>
            <Button onClick={save} disabled={!draft.name?.trim()}>Сохранить</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
