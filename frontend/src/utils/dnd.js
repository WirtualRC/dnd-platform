export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_LABELS = {
  str: 'Сила', dex: 'Ловкость', con: 'Телосложение',
  int: 'Интеллект', wis: 'Мудрость', cha: 'Харизма',
};

export const SKILLS = [
  ['athletics', 'Атлетика', 'str'],
  ['acrobatics', 'Акробатика', 'dex'],
  ['sleight_of_hand', 'Ловкость рук', 'dex'],
  ['stealth', 'Скрытность', 'dex'],
  ['arcana', 'Магия', 'int'],
  ['history', 'История', 'int'],
  ['investigation', 'Анализ', 'int'],
  ['nature', 'Природа', 'int'],
  ['religion', 'Религия', 'int'],
  ['animal_handling', 'Уход за животными', 'wis'],
  ['insight', 'Проницательность', 'wis'],
  ['medicine', 'Медицина', 'wis'],
  ['perception', 'Восприятие', 'wis'],
  ['survival', 'Выживание', 'wis'],
  ['deception', 'Обман', 'cha'],
  ['intimidation', 'Запугивание', 'cha'],
  ['performance', 'Выступление', 'cha'],
  ['persuasion', 'Убеждение', 'cha'],
];

// Модификатор всегда вычисляется из score+score_bonus, никогда не хранится —
// иначе рассинхрон при смене score без пересчёта (см. разбор LSS-экспорта).
export function abilityModifier(scoreData) {
  const score = (scoreData?.score ?? 10) + (scoreData?.score_bonus ?? 0);
  return Math.floor((score - 10) / 2);
}

export function formatMod(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function saveBonus(sheetData, ability) {
  const mod = abilityModifier(sheetData.stats?.[ability]);
  const saveData = sheetData.saves?.[ability] || {};
  const profBonus = saveData.prof ? (sheetData.proficiency_bonus ?? 2) : 0;
  return mod + profBonus + (saveData.bonus ?? 0);
}

export function skillBonus(sheetData, skillKey, abilityKey) {
  const mod = abilityModifier(sheetData.stats?.[abilityKey]);
  const skillData = sheetData.skills?.[skillKey] || {};
  const profBonus = sheetData.proficiency_bonus ?? 2;
  const profPart = skillData.expertity ? profBonus * 2 : skillData.prof ? profBonus : 0;
  return mod + profPart + (skillData.bonus ?? 0);
}

export function generateActionId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return 'a' + Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export const generateId = generateActionId;

// Цели автобонусов от предметов/способностей — та же система ключей,
// что уже используется для stats/saves/skills. Намеренно НЕ включает
// ac/speed и т.п. — они пока нигде не суммируются в расчётах, а
// показывать их как выбираемую опцию, которая молча ничего не делает,
// было бы хуже, чем не показывать вовсе.
export const MODIFIER_TARGETS = [
  ...ABILITIES.map((a) => ({ value: `ability_check:${a}`, label: `Проверка: ${ABILITY_LABELS[a]}` })),
  ...ABILITIES.map((a) => ({ value: `save:${a}`, label: `Спасбросок: ${ABILITY_LABELS[a]}` })),
  ...SKILLS.map(([key, label]) => ({ value: `skill:${key}`, label: `Навык: ${label}` })),
  { value: 'initiative', label: 'Инициатива' },
];

function modifierLabel(target) {
  return MODIFIER_TARGETS.find((t) => t.value === target)?.label || target;
}

export function describeModifier(modifier) {
  if (!modifier) return null;
  const label = modifierLabel(modifier.target);
  if (modifier.type === 'bonus') {
    const v = modifier.value ?? 0;
    return `${v >= 0 ? '+' : ''}${v} ${label}`;
  }
  if (modifier.type === 'advantage') return `Преим.: ${label}`;
  if (modifier.type === 'disadvantage') return `Помеха: ${label}`;
  return label;
}

// Собирает суммарный бонус + флаги преим./помехи от ВСЕХ надетых
// предметов и способностей, чей target совпадает с запрошенным.
// Неэкипированные предметы (equipped === false) не учитываются —
// сняла кольцо, бонус пропал.
function activeModifiers(sheetData, target) {
  const equippedItems = (sheetData.items || []).filter((i) => i.equipped !== false && i.modifier);
  const features = (sheetData.features || []).filter((f) => f.modifier);

  let bonus = 0, advantage = false, disadvantage = false;
  for (const entry of [...equippedItems, ...features]) {
    const m = entry.modifier;
    if (!m || m.target !== target) continue;
    if (m.type === 'bonus') bonus += Number(m.value) || 0;
    if (m.type === 'advantage') advantage = true;
    if (m.type === 'disadvantage') disadvantage = true;
  }
  return { bonus, advantage, disadvantage };
}

// *Total-функции — то, что реально кидается и показывается игроку:
// чистый расчёт (abilityModifier/saveBonus/skillBonus) + автобонусы от
// предметов/способностей. Чистые функции выше остаются нетронутыми —
// они всё ещё нужны как база для этого расчёта.
export function abilityCheckTotal(sheetData, abilityKey) {
  const base = abilityModifier(sheetData.stats?.[abilityKey]);
  const mods = activeModifiers(sheetData, `ability_check:${abilityKey}`);
  return { value: base + mods.bonus, advantage: mods.advantage, disadvantage: mods.disadvantage };
}

export function saveTotal(sheetData, abilityKey) {
  const base = saveBonus(sheetData, abilityKey);
  const mods = activeModifiers(sheetData, `save:${abilityKey}`);
  return { value: base + mods.bonus, advantage: mods.advantage, disadvantage: mods.disadvantage };
}

export function skillTotal(sheetData, skillKey, abilityKey) {
  const base = skillBonus(sheetData, skillKey, abilityKey);
  const mods = activeModifiers(sheetData, `skill:${skillKey}`);
  return { value: base + mods.bonus, advantage: mods.advantage, disadvantage: mods.disadvantage };
}

export function initiativeTotal(sheetData) {
  const base = abilityModifier(sheetData.stats?.dex) + (sheetData.vitality?.initiative_bonus || 0);
  const mods = activeModifiers(sheetData, 'initiative');
  return { value: base + mods.bonus, advantage: mods.advantage, disadvantage: mods.disadvantage };
}

// --- атаки: модификатор характеристики в 5e добавляется живым расчётом
// и к броску атаки, и к урону оружия — никогда не хранится в строке
// урона напрямую (см. разбор LSS-схемы и bugфикс с mod/score) ---
export function weaponAttackTotal(sheetData, attack) {
  const mod = abilityModifier(sheetData.stats?.[attack.ability]);
  const prof = attack.prof ? (sheetData.proficiency_bonus ?? 2) : 0;
  return mod + prof + (attack.attack_bonus || 0);
}

// Готовая для показа/броска строка урона: "кости" + вычисленный бонус,
// а не то, что хранится сырым в attack.damage
export function weaponDamageFormula(sheetData, attack) {
  const mod = abilityModifier(sheetData.stats?.[attack.ability]) + (attack.damage_bonus || 0);
  const dice = attack.damage || '0';
  if (!mod) return dice;
  return `${dice}${mod >= 0 ? '+' : ''}${mod}`;
}

// --- заклинания ---
export function spellSaveDC(sheetData) {
  const sc = sheetData.spellcasting || {};
  if (!sc.ability) return null;
  const mod = abilityModifier(sheetData.stats?.[sc.ability]);
  return 8 + (sheetData.proficiency_bonus ?? 2) + mod + (sc.save_bonus || 0);
}

export function spellAttackTotal(sheetData) {
  const sc = sheetData.spellcasting || {};
  if (!sc.ability) return null;
  const mod = abilityModifier(sheetData.stats?.[sc.ability]);
  return (sheetData.proficiency_bonus ?? 2) + mod + (sc.attack_bonus || 0);
}

export const CASTING_TIME_ABBR = { action: 'Д', bonusAction: 'БД', reaction: 'Р' };

export function castingTimeLabel(entry) {
  return ['action', 'bonusAction', 'reaction']
    .filter((k) => entry[k])
    .map((k) => CASTING_TIME_ABBR[k])
    .join('/') || '—';
}

export function spellTierLabel(tier) {
  return tier === 0 ? 'Заговор' : `Уровень ${tier}`;
}
