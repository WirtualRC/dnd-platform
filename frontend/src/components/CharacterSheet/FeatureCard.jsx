import { Group, Text, Badge } from '@mantine/core';
import { describeModifier } from '../../utils/dnd';

export default function FeatureCard({ feature, onEdit }) {
  return (
    <Group
      wrap="nowrap" gap="sm" p="sm"
      style={{ border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
      onClick={onEdit}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" fw={600}>{feature.name || 'Без названия'}</Text>
        {feature.description && <Text size="xs" c="dimmed">{feature.description}</Text>}
      </div>
      {feature.modifier && <Badge variant="light" color="lssBlue">{describeModifier(feature.modifier)}</Badge>}
    </Group>
  );
}
