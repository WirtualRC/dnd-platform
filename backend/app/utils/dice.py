"""
Парсер и бросок формул костей вида "2d6+3", "d20", "4d8-1".

Чистая функция без побочных эффектов и без обращений к Flask/БД —
специально, чтобы можно было протестировать юнит-тестами без поднятия
приложения (см. обсуждение в разговоре про структуру sockets/events.py).
"""
import random
import re

# count опционален ("d20" == "1d20"), modifier опционален
_PATTERN = re.compile(r'^(\d*)d(\d+)([+-]\d+)?$')

# Разумные лимиты — это пользовательский ввод, летящий по сокету без
# ограничения частоты на этом уровне, так что не доверяем ему количество
# костей и размер грани без проверки.
MAX_DICE_COUNT = 100
ALLOWED_SIDES = {2, 3, 4, 6, 8, 10, 12, 20, 100}


class InvalidDiceFormula(ValueError):
    """Формула не распознана или выходит за разумные пределы."""


class DiceRollResult:
    def __init__(self, formula: str, rolls: list[int], modifier: int):
        self.formula = formula
        self.rolls = rolls
        self.modifier = modifier
        self.total = sum(rolls) + modifier

    @property
    def breakdown(self) -> str:
        rolls_str = "[" + ", ".join(str(r) for r in self.rolls) + "]"
        if self.modifier > 0:
            return f"{rolls_str} + {self.modifier}"
        if self.modifier < 0:
            return f"{rolls_str} - {abs(self.modifier)}"
        return rolls_str

    def to_dict(self) -> dict:
        return {
            "formula": self.formula,
            "result": self.total,
            "breakdown": self.breakdown,
        }


def roll(formula: str) -> DiceRollResult:
    """Парсит и кидает формулу. Бросает InvalidDiceFormula при некорректном вводе."""
    if not formula or len(formula) > 20:
        raise InvalidDiceFormula("Пустая или слишком длинная формула")

    clean = formula.strip().replace(" ", "").lower()
    match = _PATTERN.match(clean)
    if not match:
        raise InvalidDiceFormula(f"Некорректная формула броска: {formula!r}")

    count_str, sides_str, mod_str = match.groups()
    count = int(count_str) if count_str else 1
    sides = int(sides_str)
    modifier = int(mod_str) if mod_str else 0

    if count < 1 or count > MAX_DICE_COUNT:
        raise InvalidDiceFormula(f"Количество костей должно быть от 1 до {MAX_DICE_COUNT}")
    if sides not in ALLOWED_SIDES:
        raise InvalidDiceFormula(f"Неподдерживаемая кость: d{sides}")

    rolls = [random.randint(1, sides) for _ in range(count)]
    return DiceRollResult(clean, rolls, modifier)