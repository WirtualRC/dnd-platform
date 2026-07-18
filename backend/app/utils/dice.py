"""
Парсер и бросок формул костей вида "2d6+3", "d20", "5d20+3d10+5+4d6+2d10+6".

Чистая функция без побочных эффектов и без обращений к Flask/БД —
специально, чтобы можно было протестировать юнит-тестами без поднятия
приложения.
"""
import random
import re

# Термы: либо кости (NdM, N опционален), либо плоское число, каждый со
# своим знаком. Валидируем ПОЛНОЕ совпадение формулы этим же набором
# термов — иначе можно молча проигнорировать мусор в середине строки.
_TERM = r'(?:\d*d\d+|\d+)'
_FULL_PATTERN = re.compile(rf'^[+-]?{_TERM}(?:[+-]{_TERM})*$')
_TERM_PATTERN = re.compile(r'([+-]?)(?:(\d*)d(\d+)|(\d+))')

MAX_DICE_COUNT_PER_TERM = 100
MAX_TOTAL_DICE = 100  # суммарно по всей формуле, а не только по одному терму
MAX_TERMS = 20
ALLOWED_SIDES = {2, 3, 4, 6, 8, 10, 12, 20, 100}


class InvalidDiceFormula(ValueError):
    """Формула не распознана или выходит за разумные пределы."""


class DiceRollResult:
    def __init__(self, formula: str, dice_rolls: list[tuple[int, list[int]]], flat_modifier: int):
        self.formula = formula
        self.dice_rolls = dice_rolls  # [(sides, [rolls...]), ...] с учётом знака в самих rolls
        self.modifier = flat_modifier
        self.total = sum(r for _, rolls in dice_rolls for r in rolls) + flat_modifier

    @property
    def breakdown(self) -> str:
        parts = []
        for sides, rolls in self.dice_rolls:
            sign = '-' if rolls and rolls[0] < 0 else '+'
            abs_rolls = [abs(r) for r in rolls]
            parts.append(f"{sign} d{sides}[{', '.join(map(str, abs_rolls))}]")
        if self.modifier:
            parts.append(f"{'+' if self.modifier > 0 else '-'} {abs(self.modifier)}")
        text = ' '.join(parts)
        return text[2:] if text.startswith('+ ') else text  # убираем ведущий "+ "

    def to_dict(self) -> dict:
        return {"formula": self.formula, "result": self.total, "breakdown": self.breakdown}


def roll(formula: str) -> DiceRollResult:
    """Парсит и кидает формулу. Бросает InvalidDiceFormula при некорректном вводе."""
    if not formula or len(formula) > 200:
        raise InvalidDiceFormula("Пустая или слишком длинная формула")

    clean = formula.strip().replace(" ", "").lower()
    if not _FULL_PATTERN.match(clean):
        raise InvalidDiceFormula(f"Некорректная формула броска: {formula!r}")

    terms = list(_TERM_PATTERN.finditer(clean))
    if len(terms) > MAX_TERMS:
        raise InvalidDiceFormula(f"Слишком много термов в формуле (максимум {MAX_TERMS})")

    dice_rolls: list[tuple[int, list[int]]] = []
    flat_modifier = 0
    total_dice = 0

    for m in terms:
        sign_str, count_str, sides_str, flat_str = m.groups()
        sign = -1 if sign_str == '-' else 1

        if flat_str is not None:
            flat_modifier += sign * int(flat_str)
            continue

        count = int(count_str) if count_str else 1
        sides = int(sides_str)

        if count < 1 or count > MAX_DICE_COUNT_PER_TERM:
            raise InvalidDiceFormula(f"Количество костей в d{sides} должно быть от 1 до {MAX_DICE_COUNT_PER_TERM}")
        if sides not in ALLOWED_SIDES:
            raise InvalidDiceFormula(f"Неподдерживаемая кость: d{sides}")

        total_dice += count
        if total_dice > MAX_TOTAL_DICE:
            raise InvalidDiceFormula(f"Суммарно по формуле нельзя кидать больше {MAX_TOTAL_DICE} костей")

        rolls = [sign * random.randint(1, sides) for _ in range(count)]
        dice_rolls.append((sides, rolls))

    return DiceRollResult(clean, dice_rolls, flat_modifier)