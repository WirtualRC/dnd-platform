import { useState } from 'react';
import { FileButton, Button, Group, TextInput, Avatar, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCharacterStore } from '../../store/useCharacterStore';

// Общее поле "картинка" — для аватара персонажа и для иконок действий/
// предметов, которые потом показываются в хотбаре боевой карты. Можно и
// вставить готовый URL (как раньше), и загрузить файл — тогда бэкенд
// провалидирует его и положит в uploads/characters/<id>/.
export default function IconUploadField({ label, value, onChange, size = 48 }) {
  const uploadImage = useCharacterStore((s) => s.uploadImage);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch (e) {
      notifications.show({ title: 'Не удалось загрузить картинку', message: e.message, color: 'red' });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {label && <Text size="sm" fw={500} mb={4}>{label}</Text>}
      <Group gap="xs" align="center" wrap="nowrap">
        <Avatar src={value || undefined} size={size} radius="sm" />
        <TextInput
          style={{ flex: 1 }}
          placeholder="URL картинки"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
        />
        <FileButton onChange={handleFile} accept="image/png,image/jpeg,image/gif,image/webp">
          {(props) => <Button {...props} variant="light" loading={uploading}>Загрузить</Button>}
        </FileButton>
      </Group>
    </div>
  );
}
