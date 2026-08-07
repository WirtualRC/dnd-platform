"""Отправка результатов бросков в Discord через вебхук пользователя.

URL вебхука приходит от пользователя и используется сервером для исходящего
запроса — без проверки хоста это была бы классическая SSRF-дыра (можно было
бы подсунуть внутренний адрес вместо discord.com). Поэтому валидация URL
обязательна и на сохранении пресета, и перед каждой отправкой."""

import re
from urllib.parse import urlparse

import requests

_ALLOWED_HOSTS = {"discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"}
_TIMEOUT = 5

# Термы формулы в исходном порядке — тот же паттерн, что и в dice.py/dice.js,
# только здесь используется для восстановления порядка, а не для вычисления.
_FORMULA_TERM_RE = re.compile(r'([+-]?)(?:(\d*)d(\d+)|(\d+))')
# Кубный терм в уже готовой строке breakdown ("2d6[6,1]") — оттуда берём
# фактически выпавшие значения, а не порядок (порядок даёт formula).
_BREAKDOWN_DICE_RE = re.compile(r'd\d+\[([\d,\s]+)\]')


def is_discord_webhook_url(url: str) -> bool:
    if not isinstance(url, str) or len(url) > 500:
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and parsed.hostname in _ALLOWED_HOSTS
        and parsed.path.startswith("/api/webhooks/")
    )


def _color_to_int(color: str) -> int:
    try:
        return int((color or "").lstrip("#"), 16)
    except ValueError:
        return 0x5865F2  # discord blurple как безопасный дефолт


def _is_absolute_http_url(url) -> bool:
    """avatar_url персонажа в dev нередко указывает на localhost/127.0.0.1
    (см. API_ORIGIN в client.js) — синтаксически валидный URL, но недоступный
    снаружи для Discord. Плюс на всякий случай отсекаем совсем не-URL значения
    (относительный путь, мусор). Используется и как предфильтр, и как повод
    вообще не пытаться отправить thumbnail заведомо нерабочим URL-ом."""
    if not isinstance(url, str):
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def _build_roll_lines(formula, breakdown, total):
    """Восстанавливает из formula (сохраняет исходный порядок термов, в т.ч.
    несколько отдельных плоских чисел, которые dice.py при вычислении total
    складывает в один общий модификатор) и breakdown (даёт фактически
    выпавшие значения каждого кубного терма) две строки в стиле референсного
    Discord-бота: сначала числа, потом нотация кубов (NкM), без квадратных
    скобок и запятых.

    Особые случаи вроде броска с преимуществом/помехой не разбираются
    отдельно — там breakdown устроен иначе (показывает оба d20 вместо
    одного выбранного), поэтому контрольная сумма ниже не сойдётся с total,
    и вызывающий получит None и откатится на старый однострочный формат."""
    if not formula or not breakdown:
        return None
    try:
        dice_rolls_lists = iter(
            [int(x) for x in m.group(1).split(',')] for m in _BREAKDOWN_DICE_RE.finditer(breakdown)
        )
        value_parts = []
        formula_parts = []
        running_total = 0
        is_first = True
        for m in _FORMULA_TERM_RE.finditer(formula):
            sign_str, count_str, sides_str, flat_str = m.groups()
            sign = '-' if sign_str == '-' else '+'

            if flat_str is not None:
                value = int(flat_str)
                value_str = str(value)
                formula_str = str(value)
            else:
                rolls = next(dice_rolls_lists)
                value = sum(rolls)
                # несколько костей в терме показываются как сумма отдельных
                # значений через " + " ("(1 + 5 + 4)"), а не общий итог терма —
                # для одной кости результат тот же ("(15)")
                value_str = f"({' + '.join(map(str, rolls))})"
                formula_str = f"({count_str or '1'}к{sides_str})"

            running_total += value if sign == '+' else -value
            prefix = '' if is_first and sign == '+' else f"{sign} "
            value_parts.append(f"{prefix}{value_str}")
            formula_parts.append(f"{prefix}{formula_str}")
            is_first = False

        if not value_parts or running_total != total:
            return None
        return ' '.join(value_parts), ' '.join(formula_parts)
    except (StopIteration, ValueError):
        return None


def send_discord_roll(webhook_url, color, *, character_name, character_avatar_url, label, formula, breakdown, result):
    """Бросок уже решён и записан в DiceRoll — эта функция только отдаёт
    его в Discord, поэтому не бросает исключений наружу (вызывается в
    background task сокет-хендлера, отправлять там больше некому)."""
    lines = _build_roll_lines(formula, breakdown, result)
    footer_text = None
    if lines:
        values_line, formula_line = lines
        roll_text = values_line
        # "-# " (subtext-маркдаун) в description даёт только серый цвет, а не
        # уменьшенный размер шрифта — а вот footer у Discord-эмбедов всегда
        # рендерится и мельче, и серым независимо от клиента, поэтому строку
        # с нотацией кубов уносим туда, а не пытаемся стилизовать маркдауном
        footer_text = formula_line
    else:
        # откат для случаев, которые _build_roll_lines не берётся разбирать
        # (например бросок с преимуществом/помехой) — старый однострочный вид
        roll_text = (breakdown or formula).replace(',', ', ')
    embed = {
        "title": character_name or "Бросок",
        "description": f"**{label or formula} — {result}**\n\n{roll_text}",
        "color": _color_to_int(color),
    }
    if footer_text:
        embed["footer"] = {"text": footer_text}
    if _is_absolute_http_url(character_avatar_url):
        embed["thumbnail"] = {"url": character_avatar_url}

    try:
        response = requests.post(webhook_url, json={"embeds": [embed]}, timeout=_TIMEOUT)
        # Discord иногда отклоняет весь запрос (400) из-за одного плохого поля —
        # если это могло быть превью (например URL синтаксически валиден, но
        # ведёт на недоступный извне localhost), тихо повторяем без него, а не
        # теряем сообщение целиком.
        if response.status_code >= 400 and "thumbnail" in embed:
            del embed["thumbnail"]
            requests.post(webhook_url, json={"embeds": [embed]}, timeout=_TIMEOUT)
    except requests.RequestException:
        pass


def send_discord_test(webhook_url, color, character_name=None):
    """Используется кнопкой "Проверить" в форме пресета — в отличие от
    send_discord_roll, здесь исключение важно вернуть вызывающему REST-роуту,
    чтобы показать пользователю, что вебхук не сработал."""
    embed = {
        "title": character_name or "Тестовое сообщение",
        "description": "Это тестовое сообщение от D&D платформы — вебхук настроен верно.",
        "color": _color_to_int(color),
    }
    response = requests.post(webhook_url, json={"embeds": [embed]}, timeout=_TIMEOUT)
    response.raise_for_status()
