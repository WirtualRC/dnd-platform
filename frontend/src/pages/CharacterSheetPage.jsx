import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Tabs, SimpleGrid, Paper, Textarea, Button, TextInput, Stack, Group, Text, Grid } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useCharacterStore } from '../store/useCharacterStore';
import { useRoomStore } from '../store/useRoomStore';
import { useAuthStore } from '../store/useAuthStore';
import { ABILITIES, ABILITY_LABELS, generateId, spellSaveDC, spellAttackTotal } from '../utils/dnd';
import AppHeader from '../components/AppHeader';
import CharacterHeader from '../components/CharacterSheet/CharacterHeader';
import AbilityBlock from '../components/CharacterSheet/AbilityBlock';
import ItemCard from '../components/CharacterSheet/ItemCard';
import ItemModal from '../components/CharacterSheet/ItemModal';
import FeatureCard from '../components/CharacterSheet/FeatureCard';
import FeatureModal from '../components/CharacterSheet/FeatureModal';
import AttackRow from '../components/CharacterSheet/AttackRow';
import AttackModal from '../components/CharacterSheet/AttackModal';
import SpellRow from '../components/CharacterSheet/SpellRow';
import SpellModal from '../components/CharacterSheet/SpellModal';
import StatusRow from '../components/CharacterSheet/StatusRow';
import SpellcastingSettingsModal from '../components/CharacterSheet/SpellcastingSettingsModal';
import StatWithModal from '../components/CharacterSheet/StatWithModal';

const BLANK_ITEM = () => ({ id: generateId(), name: '', description: '', equipped: true, quantity: null, modifier: null, usable: null });
const BLANK_FEATURE = () => ({ id: generateId(), name: '', description: '', modifier: null });
const BLANK_ATTACK = () => ({ id: generateId(), name: '', type: 'attack', action: true, bonusAction: false, reaction: false, ability: 'str', prof: true, damage: '', attack_bonus: 0, damage_bonus: 0, desc: '' });
const BLANK_SPELL = () => ({ id: generateId(), name: '', type: 'spell', action: true, bonusAction: false, reaction: false, concentration: false, tier: 0, range: null, singleTarget: true, aoe: null, damage: '', bonusPerTier: null, save: null, desc: '' });

export default function CharacterSheetPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isViewOnly = searchParams.get('view') === '1';
  const {
    current, isLoading, error,
    loadCharacter, updateSheetField, updateName, updateAvatarUrl, clearError,
  } = useCharacterStore();
  const room = useRoomStore((s) => s.current);

  const [editingItem, setEditingItem] = useState(null);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingFeature, setEditingFeature] = useState(null);
  const [featureModalOpen, setFeatureModalOpen] = useState(false);
  const [editingAttack, setEditingAttack] = useState(null);
  const [attackModalOpen, setAttackModalOpen] = useState(false);
  const [editingSpell, setEditingSpell] = useState(null);
  const [spellModalOpen, setSpellModalOpen] = useState(false);
  const [spellcastingModalOpen, setSpellcastingModalOpen] = useState(false);

  // room_id из текущей комнаты (если есть) — бэкенд принимает его как
  // подтверждение прав GM на чужого персонажа (см. characters/routes.py:
  // _can_edit_character). Для владельца ничего не меняет: он и так может
  // редактировать своих персонажей, room_id тогда просто игнорируется.
  useEffect(() => { loadCharacter(id, useRoomStore.getState().current?.id); }, [id]);

  // Открытие карточки в библиотеке (не через иконку-глаз) означает "хочу
  // играть этим персонажем" — если сейчас есть комната, персонаж становится
  // в ней активным автоматически, и его броски начинают транслироваться
  // (см. utils/roll.js: broadcastCharacterId читается оттуда же). Режим
  // просмотра (?view=1) — намеренно без побочных эффектов: посмотреть
  // чужого/своего персонажа для сверки, не встревая в текущую игру.
  useEffect(() => {
    const charId = parseInt(id, 10);
    const currentRoom = useRoomStore.getState().current;

    if (isViewOnly || !currentRoom) {
      useRoomStore.getState().setBroadcastCharacter(null);
      return undefined;
    }

    const authUser = useAuthStore.getState().user;
    const myMembership = currentRoom.members.find((m) => m.user_id === authUser?.id);
    if (myMembership?.active_character?.id !== charId) {
      useRoomStore.getState().setActiveCharacter(charId);
    }
    useRoomStore.getState().setBroadcastCharacter(charId);

    return () => { useRoomStore.getState().setBroadcastCharacter(null); };
  }, [id, isViewOnly]);

  // блок с кнопкой "назад"/статусом сохранения убрали — навигация уже есть
  // в AppHeader, а ошибки сохранения теперь всплывают уведомлением, а не
  // висят отдельной строкой на странице
  useEffect(() => {
    if (error) {
      notifications.show({ title: 'Не удалось сохранить', message: error, color: 'red' });
      clearError();
    }
  }, [error, clearError]);

  if (isLoading || !current) {
    return <div className="theme-dark" style={styles.loading}>Загрузка листа…</div>;
  }

  const sheet = current.sheet_data || {};
  const set = (path, value) => updateSheetField(path, value);

  function openItemModal(item) { setEditingItem(item || BLANK_ITEM()); setItemModalOpen(true); }
  function saveItem(data) {
    const items = sheet.items || [];
    const idx = items.findIndex((i) => i.id === data.id);
    set(['items'], idx >= 0 ? items.map((i, ix) => (ix === idx ? data : i)) : [...items, data]);
  }
  function updateItemField(itemId, patch) {
    set(['items'], (sheet.items || []).map((i) => (i.id === itemId ? { ...i, ...patch } : i)));
  }
  function deleteItem(itemId) { set(['items'], (sheet.items || []).filter((i) => i.id !== itemId)); }

  function openFeatureModal(feature) { setEditingFeature(feature || BLANK_FEATURE()); setFeatureModalOpen(true); }
  function saveFeature(data) {
    const features = sheet.features || [];
    const idx = features.findIndex((f) => f.id === data.id);
    set(['features'], idx >= 0 ? features.map((f, ix) => (ix === idx ? data : f)) : [...features, data]);
  }
  function deleteFeature(featureId) { set(['features'], (sheet.features || []).filter((f) => f.id !== featureId)); }

  function openAttackModal(attack) { setEditingAttack(attack || BLANK_ATTACK()); setAttackModalOpen(true); }
  function saveAttack(data) {
    const attacks = sheet.attacks || [];
    const idx = attacks.findIndex((a) => a.id === data.id);
    set(['attacks'], idx >= 0 ? attacks.map((a, ix) => (ix === idx ? data : a)) : [...attacks, data]);
  }
  function deleteAttack(attackId) { set(['attacks'], (sheet.attacks || []).filter((a) => a.id !== attackId)); }

  function openSpellModal(spell) { setEditingSpell(spell || BLANK_SPELL()); setSpellModalOpen(true); }
  function saveSpell(data) {
    const spells = sheet.spells || [];
    const idx = spells.findIndex((s) => s.id === data.id);
    set(['spells'], idx >= 0 ? spells.map((s, ix) => (ix === idx ? data : s)) : [...spells, data]);
  }
  function deleteSpell(spellId) { set(['spells'], (sheet.spells || []).filter((s) => s.id !== spellId)); }

  const sortedSpells = [...(sheet.spells || [])].sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0));
  const spellDC = spellSaveDC(sheet);
  const spellAttack = spellAttackTotal(sheet);

  return (
    <div className="theme-dark" style={styles.page}>
      <div style={styles.container}>
        <AppHeader />

        {room && (
          <Text size="xs" c={isViewOnly ? 'dimmed' : 'lssBlue.4'} mb="sm">
            {isViewOnly
              ? `Режим просмотра — активный персонаж в «${room.name}» не изменится`
              : `Играешь этим персонажем в «${room.name}» — броски видны в комнате`}
          </Text>
        )}

        <CharacterHeader
          current={current}
          sheet={sheet}
          updateName={updateName}
          updateAvatarUrl={updateAvatarUrl}
          set={set}
        />

        {/* Разделение на две колонки под шапкой: слева — характеристики,
            видны всегда; справа — переключаемые вкладки с остальным. */}
        <Grid gutter="md">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <SimpleGrid cols={2} spacing="sm">
              {ABILITIES.map((ab) => (
                <AbilityBlock
                  key={ab}
                  label={ABILITY_LABELS[ab]}
                  abilityKey={ab}
                  sheet={sheet}
                  onChangeAbility={(data) => set(['stats', ab], data)}
                  onChangeSave={(data) => set(['saves', ab], data)}
                  onChangeSkill={(key, data) => set(['skills', key], data)}
                />
              ))}
            </SimpleGrid>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <StatusRow sheet={sheet} set={set} />

            <Tabs defaultValue="equipment" keepMounted={false}>
              <Tabs.List>
                <Tabs.Tab value="equipment">Снаряжение</Tabs.Tab>
                <Tabs.Tab value="features">Способности</Tabs.Tab>
                <Tabs.Tab value="attacks">Атаки</Tabs.Tab>
                <Tabs.Tab value="spells">Заклинания</Tabs.Tab>
                <Tabs.Tab value="bio">Био</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="equipment" pt="md">
                <Paper withBorder p="md" mb="md">
                  <Textarea
                    label="Прочее снаряжение (текстом)"
                    value={sheet.text?.equipment || ''}
                    onChange={(e) => set(['text', 'equipment'], e.target.value)}
                    autosize minRows={2}
                    placeholder="Факел, верёвка 15м, спальный мешок..."
                  />
                </Paper>

                <Group justify="space-between" mb="sm">
                  <Text size="sm" fw={600} c="dimmed" tt="uppercase">Предметы с бонусами</Text>
                  <Button size="xs" variant="light" onClick={() => openItemModal(null)}>+ Добавить предмет</Button>
                </Group>
                <Stack gap="xs">
                  {(sheet.items || []).map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onEdit={() => openItemModal(item)}
                      onToggleEquipped={(equipped) => updateItemField(item.id, { equipped })}
                    />
                  ))}
                  {(sheet.items || []).length === 0 && (
                    <Text size="sm" c="dimmed">Пока нет предметов с автобонусом — добавь кольцо, оружие или зелье выше.</Text>
                  )}
                </Stack>

                <ItemModal
                  opened={itemModalOpen} onClose={() => setItemModalOpen(false)} item={editingItem}
                  onSave={saveItem} onDelete={() => editingItem && deleteItem(editingItem.id)}
                />
              </Tabs.Panel>

              <Tabs.Panel value="features" pt="md">
                <Paper withBorder p="md" mb="md">
                  <Textarea
                    label="Прочие способности (текстом)"
                    value={sheet.text?.features || ''}
                    onChange={(e) => set(['text', 'features'], e.target.value)}
                    autosize minRows={2}
                    placeholder="Тёмное зрение, устойчивость к яду..."
                  />
                </Paper>

                <Group justify="space-between" mb="sm">
                  <Text size="sm" fw={600} c="dimmed" tt="uppercase">Способности с бонусами</Text>
                  <Button size="xs" variant="light" onClick={() => openFeatureModal(null)}>+ Добавить способность</Button>
                </Group>
                <Stack gap="xs">
                  {(sheet.features || []).map((feature) => (
                    <FeatureCard key={feature.id} feature={feature} onEdit={() => openFeatureModal(feature)} />
                  ))}
                  {(sheet.features || []).length === 0 && (
                    <Text size="sm" c="dimmed">Пока нет способностей с автобонусом — например, боевой стиль или расовая черта.</Text>
                  )}
                </Stack>

                <FeatureModal
                  opened={featureModalOpen} onClose={() => setFeatureModalOpen(false)} feature={editingFeature}
                  onSave={saveFeature} onDelete={() => editingFeature && deleteFeature(editingFeature.id)}
                />
              </Tabs.Panel>

              <Tabs.Panel value="attacks" pt="md">
                <Paper withBorder p="md">
                  {(sheet.attacks || []).map((attack) => (
                    <AttackRow key={attack.id} attack={attack} sheet={sheet} onEdit={() => openAttackModal(attack)} />
                  ))}
                  {(sheet.attacks || []).length === 0 && (
                    <Text size="sm" c="dimmed" mb="sm">Пока нет атак — добавь удар мечом или выстрел из лука.</Text>
                  )}
                  <Button variant="light" mt="sm" onClick={() => openAttackModal(null)}>+ Добавить атаку</Button>
                </Paper>

                <AttackModal
                  opened={attackModalOpen} onClose={() => setAttackModalOpen(false)} attack={editingAttack}
                  onSave={saveAttack} onDelete={() => editingAttack && deleteAttack(editingAttack.id)}
                />
              </Tabs.Panel>

              <Tabs.Panel value="spells" pt="md">
                <Paper withBorder p="md" mb="md">
                  <Group gap="xl">
                    <StatWithModal
                      label="Спасбросок (от заклинаний)"
                      base={spellDC}
                      manualBonus={sheet.spellcasting?.save_bonus}
                      onChangeManualBonus={(v) => set(['spellcasting', 'save_bonus'], v)}
                      rollable={false}
                    />
                    <StatWithModal
                      label="Атака заклинанием"
                      base={spellAttack}
                      manualBonus={sheet.spellcasting?.attack_bonus}
                      onChangeManualBonus={(v) => set(['spellcasting', 'attack_bonus'], v)}
                      rollable
                    />
                  </Group>
                </Paper>

                <Group mb="sm">
                  <Button size="xs" variant="subtle" onClick={() => setSpellcastingModalOpen(true)}>Настройка заклинаний</Button>
                  <Button size="xs" variant="light" onClick={() => openSpellModal(null)}>+ Добавить заклинание</Button>
                </Group>

                <Paper withBorder p={0}>
                  {sortedSpells.map((spell) => (
                    <SpellRow key={spell.id} spell={spell} sheet={sheet} onEdit={() => openSpellModal(spell)} />
                  ))}
                  {sortedSpells.length === 0 && (
                    <Text size="sm" c="dimmed" p="md">Пока нет заклинаний — добавь первое выше.</Text>
                  )}
                </Paper>

                <SpellModal
                  opened={spellModalOpen} onClose={() => setSpellModalOpen(false)} spell={editingSpell}
                  onSave={saveSpell} onDelete={() => editingSpell && deleteSpell(editingSpell.id)}
                />
                <SpellcastingSettingsModal
                  opened={spellcastingModalOpen} onClose={() => setSpellcastingModalOpen(false)}
                  spellcasting={sheet.spellcasting} onSave={(data) => set(['spellcasting'], data)}
                />
              </Tabs.Panel>

              <Tabs.Panel value="bio" pt="md">
                <Paper withBorder p="md">
                  <TextInput
                    label="Предыстория (класс/архетип, например «Солдат»)"
                    value={sheet.background || ''}
                    onChange={(e) => set(['background'], e.target.value)}
                    mb="md"
                  />
                  <SimpleGrid cols={2} spacing="md">
                    <Textarea label="Черты характера" value={sheet.text?.traits || ''} onChange={(e) => set(['text', 'traits'], e.target.value)} autosize minRows={3} />
                    <Textarea label="Идеалы" value={sheet.text?.ideals || ''} onChange={(e) => set(['text', 'ideals'], e.target.value)} autosize minRows={3} />
                    <Textarea label="Привязанности" value={sheet.text?.bonds || ''} onChange={(e) => set(['text', 'bonds'], e.target.value)} autosize minRows={3} />
                    <Textarea label="Слабости" value={sheet.text?.flaws || ''} onChange={(e) => set(['text', 'flaws'], e.target.value)} autosize minRows={3} />
                  </SimpleGrid>
                  <Textarea
                    label="История" value={sheet.text?.bio || ''} onChange={(e) => set(['text', 'bio'], e.target.value)}
                    autosize minRows={5} mt="md"
                  />
                </Paper>
              </Tabs.Panel>
            </Tabs>
          </Grid.Col>
        </Grid>
      </div>
    </div>
  );
}

const styles = {
  loading: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-secondary)' },
  page: { minHeight: '100vh', background: 'var(--bg)', padding: '16px 16px 60px' },
  container: { maxWidth: 1200, margin: '0 auto' },
};
