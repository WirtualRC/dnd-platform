import { Paper, Text, UnstyledButton, Stack } from '@mantine/core';

export default function InspirationStat({ value, onChange }) {
  const count = value || 0;

  function handleClick() {
    onChange((count + 1) % 4); // 0 -> 1 -> 2 -> 3 -> 0
  }

  return (
    <Paper withBorder p="xs" style={styles.box}>
      <Stack gap="0" align="stretch">
        <Text size="10px" c="dimmed" tt="uppercase" style={{ letterSpacing: 0.4 }}>Вдохновение</Text>
        <UnstyledButton onClick={handleClick} aria-label={`вдохновение: ${count}`}>
          <Text fw={700} size="29" style={{ opacity: count > 0 ? 1 : 0.1, lineHeight: 1 }} align="center">✨</Text>
        </UnstyledButton>
      </Stack>
    </Paper>
  );
}

const styles = {
  box: { textAlign: 'center', minWidth: 88 },
};
