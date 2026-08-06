"""Бэкенд-порт небольшой части frontend/src/utils/dnd.js — только то, что
нужно серверу для отдачи корректных "боевых" КД/ХП токена (battle map,
инициатива), а не голого значения из vitality. Основной расчёт (проверки,
спасброски, навыки) остаётся полностью на фронтенде, бэкенду они не нужны.
"""


def _active_modifier_bonus(sheet_data, target):
    """Порт activeModifiers() из dnd.js: суммарный бонус от экипированных
    предметов (equipped не False) и способностей персонажа, чей
    modifier.target совпадает с запрошенным. advantage/disadvantage тут не
    нужны — они не влияют на КД/макс. ХП."""
    sheet_data = sheet_data or {}
    equipped_items = [
        item for item in (sheet_data.get('items') or [])
        if item.get('equipped') is not False and item.get('modifier')
    ]
    features = [f for f in (sheet_data.get('features') or []) if f.get('modifier')]

    bonus = 0
    for entry in equipped_items + features:
        modifier = entry.get('modifier') or {}
        if modifier.get('target') != target or modifier.get('type') != 'bonus':
            continue
        try:
            bonus += int(modifier.get('value') or 0)
        except (TypeError, ValueError):
            pass
    return bonus


def effective_ac(sheet_data):
    """acTotal() из dnd.js. None, если у токена вообще нет базового
    значения КД (безличный проп без листа) — сохраняем это отличие от
    "явного нуля", а не подменяем его на 0, как делает фронтенд."""
    vitality = (sheet_data or {}).get('vitality') or {}
    base = vitality.get('ac')
    if base is None:
        return None
    return base + _active_modifier_bonus(sheet_data, 'ac')


def effective_hp_max(sheet_data):
    """База + hpMaxBonus() из dnd.js. hp_current бонусам не подвержен —
    это уже "текущее" значение, которое пишется напрямую, а не выводится."""
    vitality = (sheet_data or {}).get('vitality') or {}
    base = vitality.get('hp_max')
    if base is None:
        return None
    return base + _active_modifier_bonus(sheet_data, 'hp_max')
