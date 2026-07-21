import { Group, Text, UnstyledButton, Badge } from '@mantine/core';
import { weaponAttackTotal, weaponDamageFormula, formatMod } from '../../utils/dnd';
import { rollAndNotify, rollFormulaAndNotify } from '../../utils/roll';

export default function AttackRow({ attack, sheet, onEdit }) {
  const attackMod = weaponAttackTotal(sheet, attack);
  const damageFormula = weaponDamageFormula(sheet, attack);

  return (
    <Group wrap="nowrap" gap="sm" p="xs" style={{ borderBottom: '1px solid var(--border)' }}>
      <UnstyledButton onClick={onEdit} style={{ flex: 1, textAlign: 'left' }} aria-label={`открыть ${attack.name}`}>
        <Text size="sm" fw={600}>{attack.name || 'Без названия'}</Text>
      </UnstyledButton>

      <UnstyledButton onClick={() => rollAndNotify(`Атака: ${attack.name}`, attackMod)} aria-label={`бросок атаки ${attack.name}`}>
        <Badge variant="light" className="mono" style={{ cursor: 'pointer', minWidth: 42 }}>{formatMod(attackMod)}</Badge>
      </UnstyledButton>

      <UnstyledButton onClick={() => rollFormulaAndNotify(`Урон: ${attack.name}`, damageFormula)} aria-label={`бросок урона ${attack.name}`}>
        <Badge variant="light" color="lssBlue" className="mono" style={{ cursor: 'pointer', minWidth: 56 }}>{damageFormula}</Badge>
      </UnstyledButton>
    </Group>
  );
}
