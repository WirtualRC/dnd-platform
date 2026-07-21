import { Group, Text, Badge, Switch } from '@mantine/core';
import { describeModifier } from '../../utils/dnd';

export default function ItemCard({ item, onEdit, onToggleEquipped }) {
  return (
    <Group
      wrap="nowrap" gap="sm" p="sm"
      style={{ border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
      onClick={onEdit}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" fw={600}>{item.name || 'Без названия'}</Text>
        {item.description && <Text size="xs" c="dimmed">{item.description}</Text>}
      </div>

      {item.quantity != null && <Badge variant="light">{item.quantity} шт.</Badge>}
      {item.modifier && <Badge variant="light" color="lssBlue">{describeModifier(item.modifier)}</Badge>}
      {item.usable && <Badge variant="light" color="teal">в бою</Badge>}

      <Switch
        checked={item.equipped !== false}
        onChange={(e) => onToggleEquipped(e.currentTarget.checked)}
        onClick={(e) => e.stopPropagation()}
        label={item.equipped !== false ? 'Надето' : 'В сумке'}
        size="xs"
      />
    </Group>
  );
}
