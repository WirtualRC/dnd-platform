import { useState } from 'react';
import { Modal, NumberInput, UnstyledButton, Text } from '@mantine/core';

/**
 * Текст вместо инпута + модалка по клику. Специально не инпут прямо в
 * шапке — под текстовое значение позже встанет иконка (щит для КД и
 * т.п.), а с инпутом это не сочетается вёрсткой.
 */
export default function EditableNumberStat({ label, value, displayValue, onChange, suffix, accent }) {
  const [opened, setOpened] = useState(false);
  const shown = displayValue ?? value;

  return (
    <>
      <UnstyledButton onClick={() => setOpened(true)} style={styles.wrap} aria-label={`открыть ${label}`}>
        <Text size="10px" c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }}>{label}</Text>
        <Text fw={700} size="lg" className="mono" style={accent ? { color: `var(--${accent})` } : undefined}>
          {shown ?? '—'}{suffix || ''}
        </Text>
      </UnstyledButton>

      <Modal opened={opened} onClose={() => setOpened(false)} title={label} centered size="xs" closeButtonProps={{ 'aria-label': 'Закрыть' }}>
        <NumberInput
          value={value ?? 0}
          onChange={(v) => onChange(typeof v === 'number' ? v : 0)}
          autoFocus
          size="lg"
          aria-label={label}
        />
      </Modal>
    </>
  );
}

const styles = {
  wrap: { textAlign: 'center', padding: '2px 6px' },
};
