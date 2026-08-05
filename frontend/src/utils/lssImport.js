// Конвертер экспорта персонажа с longstoryshort.app (LSS) в наш формат
// импорта персонажа ({version:1, name, avatar_url, sheet_data}, см.
// backend/app/characters/routes.py:import_character). JS-порт
// scripts/convert_lss_character.py — держите оба в синхроне при правках
// маппинга полей, скрипт полезен для пакетной конвертации вне браузера.
//
// Ограничения (LSS-формат не содержит нужных данных для полного переноса):
//  - Заклинания (data.spells.prepared/book) — только id из библиотеки
//    заклинаний LSS, без текста, поэтому не переносятся вообще.
//  - LSS "items" (магические предметы) — произвольный текст, попадает в
//    sheet_data.text.equipment, а не в структурированный sheet_data.items.
//  - LSS "features"/"traits" (архетип/умения-ресурсы) и "prof" (владения/
//    языки) — тоже текст, попадают в sheet_data.text.features, а не в
//    структурированный sheet_data.features (с модификаторами).
//  - LSS "traits" — не путать с нашим text.traits ("Черты характера",
//    личностные черты): туда переносится LSS "personality", а не LSS "traits".

function resourceLabel(node, resources) {
  const rid = node.attrs?.id;
  const res = resources?.[rid];
  if (!res) return '';
  return `[${res.name ?? '?'}: ${res.current ?? 0}/${res.max ?? 0}]`;
}

// Тексты LSS хранятся как tiptap-документы ({type:'doc', content:[...]});
// resource-узлы — ссылки на классовые ресурсы (id -> resources[id])
function docToText(doc, resources) {
  if (!doc || typeof doc !== 'object') return '';
  const lines = [];
  for (const node of doc.content || []) {
    if (node.type === 'paragraph') {
      const parts = [];
      for (const child of node.content || []) {
        if (child.type === 'text') parts.push(child.text || '');
        else if (child.type === 'resource') parts.push(resourceLabel(child, resources));
      }
      lines.push(parts.join(''));
    } else if (node.type === 'resource') {
      lines.push(resourceLabel(node, resources));
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function extractFieldText(field, resources) {
  if (!field) return '';
  return docToText(field.value?.data, resources);
}

const DAMAGE_RE = /^(\d+d\d+)([+-]\d+)?$/;

// "2d6+5" -> ["2d6", 5]; "1d4" -> ["1d4", 0];
// строки с несколькими костями ("2d6+6+3d10") не парсим — оставляем как есть
function parseDamage(dmg) {
  const trimmed = (dmg || '').trim();
  const m = DAMAGE_RE.exec(trimmed);
  if (!m) return [trimmed, 0];
  return [m[1], m[2] ? parseInt(m[2], 10) : 0];
}

const SKILL_KEY_MAP = { 'sleight of hand': 'sleight_of_hand', 'animal handling': 'animal_handling' };

export function isLssExport(payload) {
  return typeof payload?.data === 'string' && payload?.jsonType === 'character';
}

export function convertLssExport(rawText) {
  const outer = JSON.parse(rawText);
  if (!isLssExport(outer)) {
    throw new Error('Это не похоже на экспорт персонажа с Long Story Short');
  }
  const data = JSON.parse(outer.data);

  const resources = data.resources || {};
  const info = data.info || {};
  const vitality = data.vitality || {};
  const coins = data.coins || {};
  const textSrc = data.text || {};
  const spellsInfo = data.spellsInfo || {};
  const spellsSrc = data.spells || {};

  const stats = {};
  for (const [code, s] of Object.entries(data.stats || {})) {
    stats[code] = { score: s.score ?? 10, score_bonus: 0 };
  }

  const saves = {};
  for (const [code, s] of Object.entries(data.saves || {})) {
    const bonus = s.customModifier;
    saves[code] = { prof: !!s.isProf, bonus: typeof bonus === 'number' ? bonus : 0 };
  }

  const skills = {};
  for (const [lssKey, s] of Object.entries(data.skills || {})) {
    const key = SKILL_KEY_MAP[lssKey] || lssKey;
    const profVal = s.isProf || 0;
    const bonus = s.customModifier;
    skills[key] = {
      stat: s.baseStat,
      prof: profVal >= 1,
      expertity: profVal >= 2,
      bonus: typeof bonus === 'number' ? bonus : 0,
    };
  }

  let className = info.charClass?.value || '';
  const subclass = info.charSubclass?.value || '';
  if (subclass) className = `${className} (${subclass})`.trim();

  const attacks = (data.weaponsList || []).map((w, i) => {
    const [dice, bonus] = parseDamage(w.dmg?.value);
    let ability = w.ability;
    if (ability === 'none') ability = null;
    return {
      id: `lss-atk-${i}`,
      name: w.name?.value || '',
      type: 'attack',
      action: true,
      bonusAction: false,
      reaction: false,
      ability: ability ?? null,
      prof: !!w.isProf,
      damage: dice,
      attack_bonus: w.modBonus?.value || 0,
      damage_bonus: bonus,
      desc: '',
    };
  });

  const slots = {};
  for (let tier = 1; tier <= 9; tier++) {
    const slot = spellsSrc[`slots-${tier}`];
    if (!slot || slot.value === undefined) continue;
    const maxSlots = slot.value ?? 0;
    const filled = slot.filled ?? 0;
    slots[String(tier)] = { current: Math.max(0, maxSlots - filled), max: maxSlots };
  }

  // свободнотекстовые поля без структурного аналога в нашем формате
  // (цели/заметки/квента) — собираем в bio ("История")
  const bioSections = [];
  const quenta = extractFieldText(textSrc.allies, resources);
  if (quenta) bioSections.push(`## ${textSrc.allies?.customLabel || 'Квента'}\n${quenta}`);
  const quests = extractFieldText(textSrc.quests, resources);
  if (quests) bioSections.push(`## Цели/квесты\n${quests}`);
  for (let i = 1; i <= 6; i++) {
    const val = extractFieldText(textSrc[`notes-${i}`], resources);
    if (val) bioSections.push(`## Заметка ${i}\n${val}`);
  }

  // "способности" (text.features): умения/ресурсы класса из LSS 'traits'
  // (например "Второе дыхание") + владения/языки из LSS 'prof' — ни то ни
  // другое не бонусные модификаторы, оставляем текстом
  const featuresSections = [];
  const ownFeatures = extractFieldText(textSrc.features, resources);
  if (ownFeatures) featuresSections.push(ownFeatures);
  const lssTraits = extractFieldText(textSrc.traits, resources);
  if (lssTraits) featuresSections.push(`## Умения и ресурсы\n${lssTraits}`);
  const profText = extractFieldText(textSrc.prof, resources);
  if (profText) featuresSections.push(`## Владения и языки\n${profText}`);

  // "снаряжение" (text.equipment): обычное снаряжение + маг.предметы из LSS 'items'
  const equipmentSections = [];
  const ownEquipment = extractFieldText(textSrc.equipment, resources);
  if (ownEquipment) equipmentSections.push(ownEquipment);
  const itemsText = extractFieldText(textSrc.items, resources);
  if (itemsText) equipmentSections.push(`## Магические предметы\n${itemsText}`);

  // LSS 'personality' — единственное поле, семантически совпадающее
  // с "Чертами характера" (text.traits) в нашем формате
  const personalityText = extractFieldText(textSrc.personality, resources);

  const sheetData = {
    race: info.race?.value || '',
    class_name: className,
    level: info.level?.value || 1,
    proficiency_bonus: data.proficiency || 2,
    background: info.background?.value || '',
    inspiration: data.inspiration ? 1 : 0,
    conditions: (data.conditions || []).map((c) => (typeof c === 'string' ? c : c.name || '')),
    stats,
    saves,
    skills,
    vitality: {
      ac: vitality.ac?.value ?? 10,
      speed: vitality.speed?.value ?? 30,
      hp_current: vitality['hp-current']?.value ?? 0,
      hp_max: vitality['hp-max']?.value ?? 0,
      hp_temp: vitality['hp-temp']?.value ?? 0,
      initiative_bonus: 0,
      exhaustion: 0,
      death_save_successes: vitality.deathSuccesses || 0,
      death_save_failures: vitality.deathFails || 0,
    },
    coins: {
      cp: coins.cp?.value || 0,
      sp: coins.sp?.value || 0,
      ep: coins.ep?.value || 0,
      gp: coins.gp?.value || 0,
      pp: coins.pp?.value || 0,
    },
    items: [],
    features: [],
    attacks,
    spells: [],
    spellcasting: {
      ability: spellsInfo.base?.code || null,
      save_bonus: 0,
      attack_bonus: 0,
      slots,
    },
    text: {
      features: featuresSections.join('\n\n'),
      equipment: equipmentSections.join('\n\n'),
      traits: personalityText,
      ideals: extractFieldText(textSrc.ideals, resources),
      bonds: extractFieldText(textSrc.bonds, resources),
      flaws: extractFieldText(textSrc.flaws, resources),
      bio: bioSections.join('\n\n'),
    },
  };

  const avatar = data.avatar || {};

  return {
    version: 1,
    name: data.name?.value || 'Без имени',
    avatar_url: avatar.jpeg || avatar.webp || null,
    sheet_data: sheetData,
  };
}
