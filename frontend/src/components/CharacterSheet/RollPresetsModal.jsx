import { useState, useEffect } from 'react';
import {
  Modal, Stack, Group, Text, Badge, Switch, UnstyledButton, TextInput, Select, ColorInput, Button, Divider,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRollPresetsStore } from '../../store/useRollPresetsStore';

const TYPE_OPTIONS = [{ value: 'discord', label: 'Discord' }];

const EMPTY_DRAFT = { name: '', color: '#F44336', webhook_url: '' };

export default function RollPresetsModal({ opened, onClose, characterId }) {
  const { presets, loadPresets, createPreset, updatePreset, deletePreset, togglePreset, testPreset } = useRollPresetsStore();
  const [view, setView] = useState('list');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (opened && characterId) {
      loadPresets(characterId);
      setView('list');
    }
  }, [opened, characterId]);

  function patch(fields) { setDraft((d) => ({ ...d, ...fields })); }

  function openCreate() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setView('form');
  }

  function openEdit(preset) {
    setEditingId(preset.id);
    setDraft({ name: preset.name, color: preset.color, webhook_url: preset.webhook_url });
    setView('form');
  }

  async function handleToggle(preset, checked) {
    try {
      await togglePreset(characterId, preset.id, checked);
    } catch (e) {
      notifications.show({ title: 'Не удалось изменить пресет', message: e.message, color: 'red' });
    }
  }

  async function handleCopy(url) {
    try {
      await navigator.clipboard.writeText(url);
      notifications.show({ message: 'URL скопирован', color: 'lssBlue', autoClose: 1500 });
    } catch {
      // буфер обмена недоступен (например нет разрешения) — тихо игнорируем
    }
  }

  async function handleTest() {
    setIsTesting(true);
    try {
      await testPreset({ webhook_url: draft.webhook_url, color: draft.color });
      notifications.show({ title: 'Готово', message: 'Тестовое сообщение отправлено', color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Не удалось отправить', message: e.message, color: 'red' });
    } finally {
      setIsTesting(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      if (editingId) {
        await updatePreset(editingId, draft);
      } else {
        await createPreset(characterId, draft);
      }
      setView('list');
    } catch (e) {
      notifications.show({ title: 'Не удалось сохранить пресет', message: e.message, color: 'red' });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!editingId) return;
    setIsSaving(true);
    try {
      await deletePreset(editingId);
      setView('list');
    } catch (e) {
      notifications.show({ title: 'Не удалось удалить пресет', message: e.message, color: 'red' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={view === 'list' ? 'Настройки бросков' : (editingId ? 'Изменить пресет' : 'Новый пресет')}
      centered
      size="sm"
      closeButtonProps={{ 'aria-label': 'Закрыть' }}
    >
      {view === 'list' ? (
        <Stack gap="sm">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Пресеты</Text>
            <Button size="xs" variant="light" onClick={openCreate}>+</Button>
          </Group>

          {presets.length === 0 && (
            <Text size="sm" c="dimmed">Пока нет ни одного пресета</Text>
          )}

          {presets.map((preset) => (
            <Group key={preset.id} justify="space-between" wrap="nowrap" gap="xs">
              <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                <Badge variant="outline" size="xs">DISCORD</Badge>
                <Badge color={preset.color} variant="filled" style={{ flexShrink: 0 }}>{preset.name}</Badge>
                <Switch checked={preset.enabled} onChange={(e) => handleToggle(preset, e.currentTarget.checked)} />
              </Group>
              <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
                <Text size="xs" c="dimmed" truncate style={{ maxWidth: 140 }}>{preset.webhook_url}</Text>
                <UnstyledButton onClick={() => handleCopy(preset.webhook_url)} aria-label="скопировать URL" title="Скопировать URL">⧉</UnstyledButton>
                <UnstyledButton onClick={() => openEdit(preset)} aria-label="изменить пресет" title="Изменить">✎</UnstyledButton>
              </Group>
            </Group>
          ))}
        </Stack>
      ) : (
        <Stack gap="sm">
          <Select label="Тип пресета" data={TYPE_OPTIONS} value="discord" allowDeselect={false} readOnly />
          <TextInput label="Название пресета" value={draft.name} onChange={(e) => patch({ name: e.target.value })} autoFocus />
          <ColorInput label="Цвет сообщений" value={draft.color} onChange={(color) => patch({ color })} />
          <TextInput
            label="URL вебхука"
            placeholder="https://discord.com/api/webhooks/..."
            value={draft.webhook_url}
            onChange={(e) => patch({ webhook_url: e.target.value })}
          />
          <Button variant="light" size="xs" onClick={handleTest} loading={isTesting} disabled={!draft.webhook_url}>
            Проверить
          </Button>

          <Divider />
          <Group justify="space-between">
            {editingId ? (
              <Button variant="subtle" color="red" onClick={handleDelete} disabled={isSaving}>Удалить</Button>
            ) : <div />}
            <Group>
              <Button variant="subtle" onClick={() => setView('list')}>Отмена</Button>
              <Button onClick={handleSave} loading={isSaving} disabled={!draft.name.trim() || !draft.webhook_url.trim()}>
                {editingId ? 'Обновить' : 'Создать'}
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
