import { Group, Button } from '@mantine/core';
import { useNavigate, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: 'Библиотека персонажей' },
  { path: '/profile', label: 'Мой профиль' },
  { path: '/room', label: 'Комната' },
];

export default function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Group gap="xs" mb="md" py="xs" style={{ borderBottom: '1px solid var(--border)' }}>
      {NAV_ITEMS.map((item) => (
        <Button
          key={item.path}
          variant={location.pathname === item.path ? 'light' : 'subtle'}
          color="gray"
          size="xs"
          onClick={() => navigate(item.path)}
        >
          {item.label}
        </Button>
      ))}
    </Group>
  );
}
