import { useRef, useState } from 'react';
import { Modal, Text, Group, Stack, SimpleGrid, UnstyledButton, Paper } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { rollFormulaForEffect } from '../../utils/roll';

// стандартные формулы зелий лечения D&D 5e
const POTIONS = [
  { formula: '2d4+2', name: 'Зелье лечения' },
  { formula: '4d4+4', name: 'Зелье лечения (большое)' },
  { formula: '8d4+8', name: 'Зелье лечения (превосходное)' },
  { formula: '10d4+20', name: 'Зелье лечения (высшее)' },
];

export default function HpStat({
  current, max, temp, onChangeCurrent, onChangeMax, onChangeTemp,
  deathSaveSuccesses, deathSaveFailures, onChangeDeathSaveSuccesses, onChangeDeathSaveFailures,
}) {
  const [opened, setOpened] = useState(false);
  const [amountStr, setAmountStr] = useState('');
  const [editingMax, setEditingMax] = useState(false);

  const safeCurrent = current ?? 0;
  const safeMax = max ?? 0;
  const safeTemp = temp ?? 0;
  const safeSuccesses = deathSaveSuccesses ?? 0;
  const safeFailures = deathSaveFailures ?? 0;
  const dying = safeCurrent === 0;
  const amount = parseInt(amountStr || '0', 10) || 0;

  // зелья и спасброски бросают формулу через сокет и применяют эффект только
  // когда сервер подтвердит результат (см. rollFormulaForEffect) — к этому
  // моменту current/max/temp/сейвы из пропсов могли уже устареть, поэтому
  // применение читает самые свежие значения через ref, а не из замыкания на
  // момент клика
  const latest = useRef({ current: safeCurrent, max: safeMax, temp: safeTemp, successes: safeSuccesses, failures: safeFailures });
  latest.current = { current: safeCurrent, max: safeMax, temp: safeTemp, successes: safeSuccesses, failures: safeFailures };

  function handleOpen() {
    setAmountStr('');
    setEditingMax(false);
    setOpened(true);
  }

  function handleClose() {
    setOpened(false);
  }

  function pressDigit(d) {
    setAmountStr((prev) => {
      if (prev === '0') return d === '0' ? '0' : d;
      if (prev.length >= 4) return prev;
      return prev + d;
    });
  }

  function backspace() {
    setAmountStr((prev) => prev.slice(0, -1));
  }

  function applyTemp() {
    if (amount === 0) return;
    onChangeTemp(Math.max(0, safeTemp + amount));
    setAmountStr('');
  }

  function applyHeal(value) {
    if (value === 0) return;
    const { current: c, max: m } = latest.current;
    const next = Math.min(m, Math.max(0, c + value));
    onChangeCurrent(next);
    // любое лечение выше 0 отменяет текущую попытку спасброска от смерти
    if (c === 0 && next > 0) {
      onChangeDeathSaveSuccesses(0);
      onChangeDeathSaveFailures(0);
    }
  }

  function applyTypedHeal() {
    applyHeal(amount);
    setAmountStr('');
  }

  // урон сначала снимает временные хиты, остаток уходит с текущих
  function applyDamage(value) {
    if (value === 0) return;
    const absorbed = Math.min(safeTemp, value);
    const remaining = value - absorbed;
    if (absorbed > 0) onChangeTemp(safeTemp - absorbed);
    if (remaining > 0) onChangeCurrent(Math.max(0, safeCurrent - remaining));
  }

  function applyTypedDamage() {
    applyDamage(amount);
    setAmountStr('');
  }

  function drinkPotion(potion) {
    rollFormulaForEffect(
      potion.formula,
      (total, breakdown) => {
        applyHeal(Math.max(0, total));
        notifications.show({
          title: potion.name,
          message: `${breakdown} = ${total} HP`,
          color: 'green',
          autoClose: 4000,
        });
      },
      (e) => notifications.show({ title: 'Некорректная формула зелья', message: e.message, color: 'red' }),
    );
  }

  // применяет результат броска d20 к спасброскам от смерти: 1 = 2 провала,
  // 2-9 = 1 провал, 10-19 = 1 успех, 20 = 2 успеха (не мгновенное воскрешение).
  // 3 успеха стабилизируют персонажа на 1 HP и сбрасывают оба счётчика,
  // 3 провала просто блокируют кнопку броска — чекбоксы всё ещё правятся вручную
  function applyDeathSaveRoll(total, breakdown) {
    const { successes, failures } = latest.current;
    let outcome;

    if (total === 1 || total <= 9) {
      const nextFailures = Math.min(3, failures + (total === 1 ? 2 : 1));
      onChangeDeathSaveFailures(nextFailures);
      outcome = total === 1 ? 'критический провал' : 'провал';
      if (nextFailures >= 3) outcome += ', персонаж мёртв';
    } else if (total <= 19) {
      const stabilized = finishDeathSaveSuccess(Math.min(3, successes + 1));
      outcome = stabilized ? 'успех!' : 'успех!';
    } else {
      // 20
      const stabilized = finishDeathSaveSuccess(Math.min(3, successes + 2));
      outcome = stabilized ? 'критический успех!' : 'критический успех!';
    }

    notifications.show({
      title: 'Спасбросок от смерти',
      message: `${breakdown} = ${total} — ${outcome}`,
      color: total <= 9 ? 'red' : 'green',
      autoClose: 5000,
    });
  }

  // возвращает true, если этим успехом персонаж стабилизировался
  function finishDeathSaveSuccess(nextSuccesses) {
    if (nextSuccesses >= 3) {
      onChangeDeathSaveSuccesses(0);
      onChangeDeathSaveFailures(0);
      onChangeCurrent(1);
      return true;
    }
    onChangeDeathSaveSuccesses(nextSuccesses);
    return false;
  }

  function rollDeathSave() {
    if (safeFailures >= 3) return;
    rollFormulaForEffect(
      '1d20',
      (total, breakdown) => applyDeathSaveRoll(total, breakdown),
      (e) => notifications.show({ title: 'Ошибка броска', message: e.message, color: 'red' }),
    );
  }

  function toggleFailure(index) {
    const next = index + 1;
    onChangeDeathSaveFailures(safeFailures === next ? index : next);
  }

  function toggleSuccess(index) {
    const next = index + 1;
    if (safeSuccesses === next) {
      onChangeDeathSaveSuccesses(index);
      return;
    }
    finishDeathSaveSuccess(next);
  }

  return (
    <>
      <UnstyledButton onClick={handleOpen} style={styles.wrap} aria-label="открыть здоровье">
        <Text size="10px" c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }}>HP</Text>
        {dying ? (
          <D20Icon size={20} color="var(--lss-red)" />
        ) : (
          <Text fw={700} size="lg" className="mono" style={{ color: 'var(--health)' }}>
            {current ?? '—'} / {max ?? '—'}{temp ? ` (+${temp})` : ''}
          </Text>
        )}
      </UnstyledButton>

      <Modal
        opened={opened}
        onClose={handleClose}
        centered
        size="sm"
        closeButtonProps={{ 'aria-label': 'Закрыть' }}
        title={dying ? (
          <Group gap={6} justify="center">
            {[2, 1, 0].map((i) => (
              <DeathSaveBox key={`f${i}`} filled={i < safeFailures} color="var(--lss-red)" onClick={() => toggleFailure(i)} aria-label={`провал ${i + 1}`} />
            ))}
            <UnstyledButton
              onClick={rollDeathSave}
              disabled={safeFailures >= 3}
              aria-label="бросить спасбросок от смерти"
              style={{
                width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(255, 255, 255, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: safeFailures >= 3 ? 0.4 : 1, cursor: safeFailures >= 3 ? 'default' : 'pointer',
              }}
            >
              <D20Icon size={22} />
            </UnstyledButton>
            {[0, 1, 2].map((i) => (
              <DeathSaveBox key={`s${i}`} filled={i < safeSuccesses} color="var(--lss-green)" onClick={() => toggleSuccess(i)} aria-label={`успех ${i + 1}`} />
            ))}
          </Group>
        ) : (
          <Group gap={8}>
            <Text style={{ color: 'var(--health)' }}>♥</Text>
            <Text className="mono" fw={700} size="lg" style={{ color: 'var(--health)' }}>
              {safeCurrent} / {safeMax}
            </Text>
            {safeTemp > 0 && <Text className="mono" size="sm" c="dimmed">(+{safeTemp})</Text>}
            <UnstyledButton onClick={() => setEditingMax((v) => !v)} aria-label="изменить максимум HP" style={{ marginLeft: 4 }}>
              <Text size="xs" c="dimmed">✎</Text>
            </UnstyledButton>
          </Group>
        )}
      >
        <Stack gap="md">
          {editingMax && (
            <Group gap="xs" align="center">
              <Text size="sm" c="dimmed">Максимум HP</Text>
              <UnstyledButton onClick={() => onChangeMax(Math.max(0, safeMax - 1))} style={styles.smallStep} aria-label="уменьшить максимум">−</UnstyledButton>
              <Text className="mono" fw={600}>{safeMax}</Text>
              <UnstyledButton onClick={() => onChangeMax(safeMax + 1)} style={styles.smallStep} aria-label="увеличить максимум">+</UnstyledButton>
            </Group>
          )}

          <Group gap="xs">
            <Paper withBorder radius="md" style={{ flex: 1, display: 'flex', alignItems: 'center', height: 48, padding: '0 14px' }}>
              <Text className="mono" size="xl">{amountStr || '0'}</Text>
            </Paper>
            <UnstyledButton
              onClick={backspace}
              aria-label="стереть цифру"
              style={{ width: 48, height: 48, borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ⌫
            </UnstyledButton>
          </Group>

          <SimpleGrid cols={4} spacing="xs">
            {['7', '8', '9'].map((d) => <DigitButton key={d} label={d} onClick={() => pressDigit(d)} />)}
            <PotionButton potion={POTIONS[0]} onClick={() => drinkPotion(POTIONS[0])} />

            {['4', '5', '6'].map((d) => <DigitButton key={d} label={d} onClick={() => pressDigit(d)} />)}
            <PotionButton potion={POTIONS[1]} onClick={() => drinkPotion(POTIONS[1])} />

            {['1', '2', '3'].map((d) => <DigitButton key={d} label={d} onClick={() => pressDigit(d)} />)}
            <PotionButton potion={POTIONS[2]} onClick={() => drinkPotion(POTIONS[2])} />

            <DigitButton label="0" onClick={() => pressDigit('0')} />
            <div />
            <div />
            <PotionButton potion={POTIONS[3]} onClick={() => drinkPotion(POTIONS[3])} />
          </SimpleGrid>

          <Group gap="xs" grow>
            <ActionButton label="Временные" color="var(--lss-blue)" onClick={applyTemp} />
            <ActionButton label="Лечение" color="var(--lss-green)" onClick={applyTypedHeal} />
            <ActionButton label="Урон" color="var(--lss-red)" onClick={applyTypedDamage} />
            <UnstyledButton
              disabled
              aria-label="настройки (скоро)"
              style={{
                height: 40, width: 40, flexGrow: 0, borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0.4, cursor: 'default',
              }}
            >
              ⚙
            </UnstyledButton>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function D20Icon({ size = 20, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round">
      <polygon points="12,2 21,7.5 21,16.5 12,22 3,16.5 3,7.5" />
      <path d="M12 2 L12 12 M21 7.5 L12 12 M21 16.5 L12 12 M12 22 L12 12 M3 16.5 L12 12 M3 7.5 L12 12" />
    </svg>
  );
}

function DigitButton({ label, onClick }) {
  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        height: 56, borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 600,
      }}
    >
      {label}
    </UnstyledButton>
  );
}

function ActionButton({ label, color, onClick }) {
  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        height: 40, borderRadius: 8, border: `1px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.3,
      }}
    >
      {label}
    </UnstyledButton>
  );
}

function DeathSaveBox({ filled, color, onClick, 'aria-label': ariaLabel }) {
  return (
    <UnstyledButton
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: 20, height: 20, borderRadius: 4,
        border: `1.5px solid ${color}`,
        backgroundColor: filled ? color : 'transparent',
      }}
    />
  );
}

function PotionButton({ potion, onClick }) {
  return (
    <UnstyledButton
      onClick={onClick}
      aria-label={`выпить ${potion.name} (${potion.formula})`}
      title={potion.name}
      style={{
        height: 56, borderRadius: 8, border: '1px solid var(--lss-green)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: 'var(--lss-green)', gap: 2,
      }}
    >
      <Text size="lg">🧪</Text>
      <Text size="10px" fw={700} className="mono">{potion.formula}</Text>
    </UnstyledButton>
  );
}

const styles = {
  wrap: { textAlign: 'center', padding: '2px 6px' },
  smallStep: {
    width: 28, height: 28, borderRadius: 6, border: '1px solid rgba(255, 255, 255, 0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};
