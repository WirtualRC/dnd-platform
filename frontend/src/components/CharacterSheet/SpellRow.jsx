import { useState } from 'react';
import { Group, Text, UnstyledButton, Badge, Button, Menu, Stack } from '@mantine/core';
import { spellSaveDC, spellAttackTotal, castingTimeLabel, spellTierLabel, formatMod, ABILITY_LABELS } from '../../utils/dnd';
import { rollFormulaAndNotify, rollAndNotify } from '../../utils/roll';

export default function SpellRow({ spell, sheet, onEdit }) {
  const [castTier, setCastTier] = useState(spell.tier);

  const slots = sheet.spellcasting?.slots || {};
  // до какого уровня можно повышать — своя ячейка и выше, если в ней есть максимум > 0
  const tierOptions = [];
  for (let t = spell.tier; t <= 9; t++) {
    if (t === spell.tier || (slots[t]?.max || 0) > 0) tierOptions.push(t);
  }
  const canUpcast = !!spell.bonusPerTier && tierOptions.length > 1;

  const dc = spellSaveDC(sheet);
  const atk = spellAttackTotal(sheet);

  let attackDisplay = '—';
  if (spell.save) attackDisplay = dc != null ? `СЛ ${dc}` : '—';
  else if (spell.damage) attackDisplay = atk != null ? formatMod(atk) : '—';

  function handleCast() {
    let formula = spell.damage || '';
    const extraTiers = castTier - spell.tier;
    if (formula && spell.bonusPerTier && extraTiers > 0) {
      formula = `${formula}+${Array(extraTiers).fill(spell.bonusPerTier).join('+')}`;
    }
    const label = `${spell.name}${extraTiers > 0 ? ` (ур. ${castTier})` : ''}`;
    if (formula) rollFormulaAndNotify(label, formula);
    else if (spell.save) rollAndNotify(label, 0); // утилитарное заклинание без урона — просто отметка каста
  }

  return (
    <Group wrap="nowrap" gap="sm" p="xs" style={{ borderBottom: '1px solid var(--border)' }}>
      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
        <UnstyledButton onClick={onEdit} aria-label={`открыть ${spell.name}`}>
          <Text size="sm" fw={600}>{spell.name || 'Без названия'}</Text>
        </UnstyledButton>

        {canUpcast ? (
          <Menu>
            <Menu.Target>
              <UnstyledButton aria-label={`уровень каста ${spell.name}`}>
                <Text size="xs" c="dimmed">{spellTierLabel(castTier)} ▾</Text>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              {tierOptions.map((t) => (
                <Menu.Item key={t} onClick={() => setCastTier(t)}>{spellTierLabel(t)}</Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        ) : (
          <Text size="xs" c="dimmed">{spellTierLabel(spell.tier)}</Text>
        )}
      </Stack>

      <Text size="xs" className="mono" w={26} ta="center" title="Время сотворения">{castingTimeLabel(spell)}</Text>
      <Text size="xs" className="mono" w={30} ta="center" title="Дистанция, фт">{spell.range ?? '—'}</Text>
      <Badge variant="light" className="mono" style={{ minWidth: 46 }} title={spell.save ? `Спасбросок: ${ABILITY_LABELS[spell.save]}` : 'Атака заклинанием'}>
        {attackDisplay}
      </Badge>
      <Badge variant="light" color="lssBlue" className="mono" style={{ minWidth: 50 }}>
        {spell.damage || '—'}
      </Badge>

      <Button size="xs" onClick={handleCast}>Каст</Button>
    </Group>
  );
}
