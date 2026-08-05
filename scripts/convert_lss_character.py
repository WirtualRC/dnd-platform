"""Конвертер экспорта персонажа с longstoryshort.app (LSS) в формат
импорта нашей платформы (см. backend/app/characters/routes.py:import_character).

Использование:
    python scripts/convert_lss_character.py "input.json" "output.json"

Результат — файл вида {"version": 1, "name", "avatar_url", "sheet_data"},
который импортируется через кнопку "Импорт" на странице библиотеки персонажей.

Ограничения (LSS-формат не содержит нужных данных для полного переноса):
  - Заклинания (data.spells.prepared/book) — это только id из библиотеки
    заклинаний LSS, без текста/описаний, поэтому не переносятся вообще.
    Настраивать заклинания и spellcasting.save_bonus/attack_bonus придётся
    вручную после импорта.
  - LSS "items" (магические предметы) — это произвольный текст, а не
    структурированный список, поэтому попадает в sheet_data.text.equipment
    (снаряжение), а не в sheet_data.items (структурированный инвентарь
    остаётся пустым — модификаторов предметов LSS не знает).
  - LSS "features"/"traits" (архетип/боевой стиль/иммунитеты/умения-ресурсы)
    и "prof" (владения/языки) — тоже текст, попадают в sheet_data.text.features
    (способности), а не в структурированный sheet_data.features (с
    модификаторами).
  - LSS "traits" (класс.умения/ресурсы) — не путать с нашим text.traits:
    у нас это поле подписано "Черты характера" (личностные черты), поэтому
    туда переносится LSS "personality", а не LSS "traits".
"""
import json
import re
import sys


def doc_to_text(doc, resources):
    """Тексты LSS хранятся как tiptap-документы ({type:'doc', content:[...]});
    resource-узлы — ссылки на классовые ресурсы (id -> resources[id])."""
    if not doc or not isinstance(doc, dict):
        return ''
    lines = []
    for node in doc.get('content') or []:
        ntype = node.get('type')
        if ntype == 'paragraph':
            parts = []
            for child in node.get('content') or []:
                if child.get('type') == 'text':
                    parts.append(child.get('text', ''))
                elif child.get('type') == 'resource':
                    parts.append(_resource_label(child, resources))
            lines.append(''.join(parts))
        elif ntype == 'resource':
            lines.append(_resource_label(node, resources))
    # схлопываем подряд идущие пустые строки, но сохраняем разбиение на абзацы
    text = '\n'.join(lines)
    return re.sub(r'\n{3,}', '\n\n', text).strip()


def _resource_label(node, resources):
    rid = (node.get('attrs') or {}).get('id')
    res = (resources or {}).get(rid)
    if not res:
        return ''
    return f"[{res.get('name', '?')}: {res.get('current', 0)}/{res.get('max', 0)}]"


def extract_field_text(field, resources):
    if not field:
        return ''
    return doc_to_text((field.get('value') or {}).get('data'), resources)


DAMAGE_RE = re.compile(r'^(\d+d\d+)([+-]\d+)?$')


def parse_damage(dmg):
    """"2d6+5" -> ("2d6", 5); "1d4" -> ("1d4", 0);
    строки с несколькими костями ("2d6+6+3d10") не парсим — оставляем как есть."""
    dmg = (dmg or '').strip()
    m = DAMAGE_RE.match(dmg)
    if not m:
        return dmg, 0
    dice, bonus = m.group(1), m.group(2)
    return dice, int(bonus) if bonus else 0


def convert(lss_raw):
    outer = json.loads(lss_raw) if isinstance(lss_raw, str) else lss_raw
    data = json.loads(outer['data']) if isinstance(outer.get('data'), str) else outer['data']

    resources = data.get('resources') or {}
    info = data.get('info') or {}
    vitality = data.get('vitality') or {}
    coins = data.get('coins') or {}
    stats_src = data.get('stats') or {}
    saves_src = data.get('saves') or {}
    skills_src = data.get('skills') or {}
    text_src = data.get('text') or {}
    spells_info = data.get('spellsInfo') or {}
    spells_src = data.get('spells') or {}

    stats = {}
    for code, s in stats_src.items():
        stats[code] = {'score': s.get('score', 10), 'score_bonus': 0}

    saves = {}
    for code, s in saves_src.items():
        bonus = s.get('customModifier')
        saves[code] = {'prof': bool(s.get('isProf')), 'bonus': bonus if isinstance(bonus, (int, float)) else 0}

    # ключи навыков в LSS используют пробелы ("sleight of hand",
    # "animal handling"), у нас — подчёркивания
    SKILL_KEY_MAP = {'sleight of hand': 'sleight_of_hand', 'animal handling': 'animal_handling'}
    skills = {}
    for lss_key, s in skills_src.items():
        key = SKILL_KEY_MAP.get(lss_key, lss_key)
        prof_val = s.get('isProf') or 0
        bonus = s.get('customModifier')
        skills[key] = {
            'stat': s.get('baseStat'),
            'prof': prof_val >= 1,
            'expertity': prof_val >= 2,
            'bonus': bonus if isinstance(bonus, (int, float)) else 0,
        }

    class_name = info.get('charClass', {}).get('value') or ''
    subclass = info.get('charSubclass', {}).get('value') or ''
    if subclass:
        class_name = f"{class_name} ({subclass})".strip()

    attacks = []
    for i, w in enumerate(data.get('weaponsList') or []):
        dice, bonus = parse_damage((w.get('dmg') or {}).get('value'))
        ability = w.get('ability')
        if ability == 'none':
            ability = None
        attacks.append({
            'id': f'lss-atk-{i}',
            'name': (w.get('name') or {}).get('value') or '',
            'type': 'attack',
            'action': True,
            'bonusAction': False,
            'reaction': False,
            'ability': ability,
            'prof': bool(w.get('isProf')),
            'damage': dice,
            'attack_bonus': (w.get('modBonus') or {}).get('value') or 0,
            'damage_bonus': bonus,
            'desc': '',
        })

    slots = {}
    for tier in range(1, 10):
        slot = spells_src.get(f'slots-{tier}')
        if not slot or 'value' not in slot:
            continue
        max_slots = slot.get('value', 0)
        filled = slot.get('filled', 0)
        slots[str(tier)] = {'current': max(0, max_slots - filled), 'max': max_slots}

    # свободнотекстовые поля без структурного аналога в нашем формате
    # (цели/заметки/квента) — собираем в bio ("История")
    bio_sections = []
    quenta = extract_field_text(text_src.get('allies'), resources)
    if quenta:
        label = text_src.get('allies', {}).get('customLabel') or 'Квента'
        bio_sections.append(f"## {label}\n{quenta}")
    quests = extract_field_text(text_src.get('quests'), resources)
    if quests:
        bio_sections.append(f"## Цели/квесты\n{quests}")
    for i in range(1, 7):
        val = extract_field_text(text_src.get(f'notes-{i}'), resources)
        if val:
            bio_sections.append(f"## Заметка {i}\n{val}")

    # "способности" (text.features) собирают: умения/ресурсы класса из LSS
    # 'traits' (например "Второе дыхание") + владения/языки из LSS 'prof' —
    # ни то ни другое не бонусные модификаторы, оставляем текстом
    features_sections = []
    own_features = extract_field_text(text_src.get('features'), resources)
    if own_features:
        features_sections.append(own_features)
    lss_traits = extract_field_text(text_src.get('traits'), resources)
    if lss_traits:
        features_sections.append(f"## Умения и ресурсы\n{lss_traits}")
    prof_text = extract_field_text(text_src.get('prof'), resources)
    if prof_text:
        features_sections.append(f"## Владения и языки\n{prof_text}")

    # "снаряжение" (text.equipment) — обычное снаряжение + маг.предметы из LSS 'items'
    equipment_sections = []
    own_equipment = extract_field_text(text_src.get('equipment'), resources)
    if own_equipment:
        equipment_sections.append(own_equipment)
    items_text = extract_field_text(text_src.get('items'), resources)
    if items_text:
        equipment_sections.append(f"## Магические предметы\n{items_text}")

    # LSS 'personality' — единственное поле, семантически совпадающее
    # с "Чертами характера" (text.traits) в нашем формате
    personality_text = extract_field_text(text_src.get('personality'), resources)

    sheet_data = {
        'race': info.get('race', {}).get('value') or '',
        'class_name': class_name,
        'level': info.get('level', {}).get('value') or 1,
        'proficiency_bonus': data.get('proficiency') or 2,
        'background': info.get('background', {}).get('value') or '',
        'inspiration': 1 if data.get('inspiration') else 0,
        'conditions': [c if isinstance(c, str) else c.get('name', '') for c in (data.get('conditions') or [])],
        'stats': stats,
        'saves': saves,
        'skills': skills,
        'vitality': {
            'ac': vitality.get('ac', {}).get('value') or 10,
            'speed': vitality.get('speed', {}).get('value') or 30,
            'hp_current': vitality.get('hp-current', {}).get('value') or 0,
            'hp_max': vitality.get('hp-max', {}).get('value') or 0,
            'hp_temp': vitality.get('hp-temp', {}).get('value') or 0,
            'initiative_bonus': 0,
            'exhaustion': 0,
            'death_save_successes': vitality.get('deathSuccesses') or 0,
            'death_save_failures': vitality.get('deathFails') or 0,
        },
        'coins': {
            'cp': coins.get('cp', {}).get('value') or 0,
            'sp': coins.get('sp', {}).get('value') or 0,
            'ep': coins.get('ep', {}).get('value') or 0,
            'gp': coins.get('gp', {}).get('value') or 0,
            'pp': coins.get('pp', {}).get('value') or 0,
        },
        'items': [],
        'features': [],
        'attacks': attacks,
        'spells': [],
        'spellcasting': {
            'ability': (spells_info.get('base') or {}).get('code') or None,
            'save_bonus': 0,
            'attack_bonus': 0,
            'slots': slots,
        },
        'text': {
            'features': '\n\n'.join(features_sections),
            'equipment': '\n\n'.join(equipment_sections),
            'traits': personality_text,
            'ideals': extract_field_text(text_src.get('ideals'), resources),
            'bonds': extract_field_text(text_src.get('bonds'), resources),
            'flaws': extract_field_text(text_src.get('flaws'), resources),
            'bio': '\n\n'.join(bio_sections),
        },
    }

    avatar = data.get('avatar') or {}
    avatar_url = avatar.get('jpeg') or avatar.get('webp')

    return {
        'version': 1,
        'name': (data.get('name') or {}).get('value') or 'Без имени',
        'avatar_url': avatar_url,
        'sheet_data': sheet_data,
    }


def main():
    if len(sys.argv) != 3:
        print('Использование: python convert_lss_character.py <input.json> <output.json>')
        sys.exit(1)
    with open(sys.argv[1], encoding='utf-8') as f:
        raw = f.read()
    result = convert(raw)
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"Готово: {sys.argv[2]}")
    print("Заклинания не перенесены — LSS-экспорт содержит только их id, без текста; добавьте вручную.")


if __name__ == '__main__':
    main()
