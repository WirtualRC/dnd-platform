import { useState, useEffect } from 'react';
import { Modal, Select, NumberInput, Stack, Group, Button, Divider, Text } from '@mantine/core';
import { ABILITIES, ABILITY_LABELS } from '../../utils/dnd';

const TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function SpellcastingSettingsModal({ opened, onClose, spellcasting, onSave }) {
  const [draft, setDraft] = useState(spellcasting || { ability: null, save_bonus: 0, attack_bonus: 0, slots: {} });

  useEffect(() => {
    setDraft(spellcasting || { ability: null, save_bonus: 0, attack_bonus: 0, slots: {} });
  }, [spellcasting, opened]);

  function patch(fields) { setDraft((d) => ({ ...d, ...fields })); }
  function patchSlot(tier, field, value) {
    const slots = { ...(draft.slots || {}) };
    const current = slots[tier] || { current: 0, max: 0 };
    slots[tier] = { ...current, [field]: typeof value === 'number' ? value : 0 };
    patch({ slots });
  }
  function save() { onSave(draft); onClose(); }

  return (
    <Modal opened={opened} onClose={onClose} title="Настройка заклинаний" centered size="sm" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
      <Stack gap="sm">
        <Select
          label="Заклинательная характеристика"
          placeholder="не выбрана"
          data={ABILITIES.map((a) => ({ value: a, label: ABILITY_LABELS[a] }))}
          value={draft.ability || null}
          onChange={(v) => patch({ ability: v })}
        />

        <Divider label="Ячейки заклинаний" labelPosition="left" />
        <Stack gap={6}>
          {TIERS.map((tier) => {
            const slot = draft.slots?.[tier] || { current: 0, max: 0 };
            return (
              <Group key={tier} grow wrap="nowrap" align="flex-end">
                <Text size="sm" style={{ flex: '0 0 90px' }}>Уровень {tier}</Text>
                <NumberInput label="Текущие" min={0} value={slot.current ?? 0} onChange={(v) => patchSlot(tier, 'current', v)} />
                <NumberInput label="Максимум" min={0} value={slot.max ?? 0} onChange={(v) => patchSlot(tier, 'max', v)} />
              </Group>
            );
          })}
        </Stack>

        <Group justify="flex-end" mt="xs">
          <Button variant="subtle" onClick={onClose}>Отмена</Button>
          <Button onClick={save}>Сохранить</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
