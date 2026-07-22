import { useState } from 'react';
import { Paper, Group, Text, UnstyledButton, Badge, Stack, Divider } from '@mantine/core';
import { abilityCheckTotal, saveTotal, skillTotal, formatMod, SKILLS } from '../../utils/dnd';
import { rollAndNotify } from '../../utils/roll';
import SkillRow from './SkillRow';
import AbilityModal from './AbilityModal';

export default function AbilityBlock({ label, abilityKey, sheet, onChangeAbility, onChangeSave, onChangeSkill }) {
  const [modalOpen, setModalOpen] = useState(false);

  const data = sheet.stats?.[abilityKey];
  const totalScore = (data?.score ?? 10) + (data?.score_bonus ?? 0);
  const check = abilityCheckTotal(sheet, abilityKey);

  const saveData = sheet.saves?.[abilityKey] || {};
  const save = saveTotal(sheet, abilityKey);

  // навыки, привязанные именно к этой характеристике — фильтруем общий список
  const abilitySkills = SKILLS.filter(([, , ab]) => ab === abilityKey);

  return (
    <Paper withBorder p="sm">
      <UnstyledButton
        onClick={() => setModalOpen(true)}
        style={{ display: 'block', width: '100%', marginBottom: 10 }}
        aria-label={`открыть ${label}`}
      >
        <Group justify="space-between">
          <Text fw={700} tt="uppercase" size="sm" style={{ letterSpacing: 0.5 }}>{label}</Text>
          <Text fw={700} className="mono" c="dimmed">{totalScore}</Text>
        </Group>
      </UnstyledButton>

      <Group gap="lg" mb="xs" wrap="wrap">
        <Group gap={8.6} wrap="nowrap">
          <Text size="xs" c="dimmed">Проверка</Text>
          <UnstyledButton onClick={() => rollAndNotify(`Проверка: ${label}`, check.value, check)}>
            <Badge variant="light" className="mono" style={{ cursor: 'pointer', minWidth: 42 }}>
              {formatMod(check.value)}
            </Badge>
          </UnstyledButton>
        </Group>

        <SkillRow
          displayLabel="Спасбросок"
          a11yLabel={`спасбросок ${label}`}
          stretch={false}
          prof={!!saveData.prof}
          expertity={false}
          allowExpertise={false}
          bonus={saveData.bonus}
          total={save.value}
          advantage={save.advantage}
          disadvantage={save.disadvantage}
          onChangeProf={({ prof }) => onChangeSave({ ...saveData, prof })}
          onChangeBonus={(bonus) => onChangeSave({ ...saveData, bonus })}
        />
      </Group>

      {abilitySkills.length > 0 && (
        <>
          <Divider mb={6} />
          <Stack gap={4}>
            {abilitySkills.map(([key, skillLabel]) => {
              const skillData = sheet.skills?.[key] || {};
              const total = skillTotal(sheet, key, abilityKey);
              return (
                <SkillRow
                  key={key}
                  displayLabel={skillLabel}
                  a11yLabel={skillLabel}
                  prof={!!skillData.prof}
                  expertity={!!skillData.expertity}
                  allowExpertise
                  bonus={skillData.bonus}
                  total={total.value}
                  advantage={total.advantage}
                  disadvantage={total.disadvantage}
                  onChangeProf={(next) => onChangeSkill(key, { ...skillData, stat: abilityKey, ...next })}
                  onChangeBonus={(bonus) => onChangeSkill(key, { ...skillData, stat: abilityKey, bonus })}
                />
              );
            })}
          </Stack>
        </>
      )}

      <AbilityModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        label={label}
        abilityKey={abilityKey}
        sheet={sheet}
        onChangeAbility={onChangeAbility}
        onChangeSave={onChangeSave}
      />
    </Paper>
  );
}
