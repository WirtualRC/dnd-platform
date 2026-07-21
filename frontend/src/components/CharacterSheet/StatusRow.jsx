import { Group } from '@mantine/core';
import InitiativeStat from './InitiativeStat';
import InspirationStat from './InspirationStat';
import ConditionsStat from './ConditionsStat';
import ExhaustionStat from './ExhaustionStat';

export default function StatusRow({ sheet, set }) {
  return (
    <Group gap="xs" mb="md" align="flex-start" wrap="wrap">
      <InitiativeStat sheet={sheet} onChangeBonus={(v) => set(['vitality', 'initiative_bonus'], v)} />
      <InspirationStat value={sheet.inspiration} onChange={(v) => set(['inspiration'], v)} />
      <ExhaustionStat value={sheet.vitality?.exhaustion} onChange={(v) => set(['vitality', 'exhaustion'], v)} />
      <ConditionsStat conditions={sheet.conditions} onChange={(v) => set(['conditions'], v)} />
    </Group>
  );
}
