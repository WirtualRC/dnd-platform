import { useState } from 'react';
import { Modal, Text, Group, Stack, SimpleGrid, UnstyledButton, Menu, Paper } from '@mantine/core';

const CURRENCIES = [
  { key: 'gp', label: 'З', name: 'Золото', color: '#e0b34e' },
  { key: 'sp', label: 'С', name: 'Серебро', color: '#cdd1d6' },
  { key: 'cp', label: 'М', name: 'Медь', color: '#c17a4d' },
  { key: 'pp', label: 'П', name: 'Платина', color: '#eef0f2' },
  { key: 'ep', label: 'Э', name: 'Электрум', color: '#5aa9e6' },
];

// стандартные курсы D&D 5e, всё выражено в золотых
const RATE_TO_GP = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };

function formatNumber(n) {
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

function Coin({ currency, size = 22 }) {
  return (
    <span
      className="mono"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%',
        border: `1.5px solid ${currency.color}`, color: currency.color,
        fontSize: size * 0.5, fontWeight: 700, flexShrink: 0,
      }}
    >
      {currency.label}
    </span>
  );
}

export default function CurrencyModal({ opened, onClose, coins, onChange }) {
  const [activeKey, setActiveKey] = useState('gp');
  const [amountStr, setAmountStr] = useState('');

  const safeCoins = coins || {};
  const total = CURRENCIES.reduce((sum, c) => sum + (safeCoins[c.key] || 0) * RATE_TO_GP[c.key], 0);
  const amount = parseInt(amountStr || '0', 10) || 0;
  const active = CURRENCIES.find((c) => c.key === activeKey);
  const previews = CURRENCIES.filter((c) => c.key !== activeKey);

  function pressDigit(d) {
    setAmountStr((prev) => {
      if (prev === '0') return d === '0' ? '0' : d;
      if (prev.length >= 9) return prev;
      return prev + d;
    });
  }

  function backspace() {
    setAmountStr((prev) => prev.slice(0, -1));
  }

  function apply(sign) {
    if (amount === 0) return;
    const next = { ...safeCoins };
    next[activeKey] = Math.max(0, (safeCoins[activeKey] || 0) + sign * amount);
    onChange(next);
    setAmountStr('');
  }

  function handleClose() {
    setAmountStr('');
    onClose();
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      centered
      size="sm"
      closeButtonProps={{ 'aria-label': 'Закрыть' }}
      title={(
        <Text>
          Всего в золоте:{' '}
          <Text span fw={700} style={{ color: CURRENCIES[0].color }}>{formatNumber(total)}</Text>
        </Text>
      )}
    >
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="lg">
            {CURRENCIES.slice(0, 3).map((c) => (
              <Group key={c.key} gap={6}>
                <Coin currency={c} />
                <Text className="mono" fw={600}>{safeCoins[c.key] || 0}</Text>
              </Group>
            ))}
          </Group>
          <Group gap="lg">
            {CURRENCIES.slice(3).map((c) => (
              <Group key={c.key} gap={6}>
                <Coin currency={c} />
                <Text className="mono" fw={600}>{safeCoins[c.key] || 0}</Text>
              </Group>
            ))}
          </Group>
        </Group>

        <Group gap="xs">
          <Paper withBorder radius="md" style={{ flex: 1, display: 'flex', alignItems: 'center', height: 48, padding: '0 10px' }}>
            <Menu position="bottom-start">
              <Menu.Target>
                <UnstyledButton style={{ display: 'flex', alignItems: 'center', gap: 4 }} aria-label="выбрать валюту">
                  <Coin currency={active} />
                  <Text size="xs" c="dimmed">▾</Text>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                {CURRENCIES.map((c) => (
                  <Menu.Item key={c.key} onClick={() => setActiveKey(c.key)} leftSection={<Coin currency={c} size={18} />}>
                    {c.name}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            <Text className="mono" size="xl" ml="sm">{amountStr}</Text>
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
          <PreviewCell currency={previews[0]} value={amount * RATE_TO_GP[activeKey] / RATE_TO_GP[previews[0].key]} />

          {['4', '5', '6'].map((d) => <DigitButton key={d} label={d} onClick={() => pressDigit(d)} />)}
          <PreviewCell currency={previews[1]} value={amount * RATE_TO_GP[activeKey] / RATE_TO_GP[previews[1].key]} />

          {['1', '2', '3'].map((d) => <DigitButton key={d} label={d} onClick={() => pressDigit(d)} />)}
          <PreviewCell currency={previews[2]} value={amount * RATE_TO_GP[activeKey] / RATE_TO_GP[previews[2].key]} />

          <DigitButton label="0" onClick={() => pressDigit('0')} />
          <ActionButton label="ОТДАТЬ" color="var(--lss-red)" onClick={() => apply(-1)} />
          <ActionButton label="ВЗЯТЬ" color="var(--lss-green)" onClick={() => apply(1)} />
          <PreviewCell currency={previews[3]} value={amount * RATE_TO_GP[activeKey] / RATE_TO_GP[previews[3].key]} />
        </SimpleGrid>
      </Stack>
    </Modal>
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
        height: 56, borderRadius: 8, border: `1px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 0.3,
      }}
    >
      {label}
    </UnstyledButton>
  );
}

function PreviewCell({ currency, value }) {
  return (
    <Group gap={4} justify="center" style={{ height: 56 }}>
      <Text size="xs" c="dimmed">=</Text>
      <Text size="xs" c="dimmed" className="mono">{formatNumber(value)}</Text>
      <Coin currency={currency} size={18} />
    </Group>
  );
}
