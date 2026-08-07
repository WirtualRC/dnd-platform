"""Рассылка результата броска в Discord-вебхуки персонажа.

Общий код для двух путей: сокет-хендлеры (бросок транслируется в комнату)
и REST-роут /characters/<id>/roll-presets/notify (локальный бросок с листа
персонажа вне комнаты/трансляции) — уведомление в Discord не должно
зависеть от того, транслируется ли бросок в комнату прямо сейчас."""

from urllib.parse import urlsplit, urlunsplit

from flask import request as flask_request

from ..extensions import socketio
from ..models import Character, CharacterRollPresetLink
from .discord_webhook import send_discord_roll

_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _public_origin():
    """request.host_url отражает то, как Flask увидел запрос — а cloudflared
    (см. деплой в CLAUDE.md) терминирует HTTPS на своей стороне и проксирует
    к нам уже обычным HTTP, поэтому host_url всегда приходит с http://, даже
    когда реальный публичный адрес (тот самый tunnel-домен) на деле только
    https. Discord такой http-URL снаружи не достаёт (у trycloudflare.com нет
    рабочего http на публичной стороне) — форсируем https, но только не для
    localhost/127.0.0.1 в dev, где ни один из вариантов не достижим извне и
    смена схемы ничего не меняет по существу."""
    parts = urlsplit(flask_request.host_url)
    scheme = 'https' if parts.hostname not in _LOOPBACK_HOSTS else parts.scheme
    return urlunsplit((scheme, parts.netloc, '', '', ''))


def _absolute_avatar_url(avatar_url):
    """avatar_url в БД иногда хранится как относительный /uploads/... путь
    (старые персонажи, заведённые до того как аплоад стал класть в БД сразу
    абсолютный URL — см. useCharacterStore.uploadImage на фронте). Отдавать
    такой путь напрямую в Discord бессмысленно, зато сервер сам прекрасно
    знает свой собственный публичный origin (тот же, с которого его дёрнул
    сокет/REST-запрос) — используем его, а не полагаться на то, что было
    когда-то сохранено в avatar_url."""
    if not avatar_url:
        return None
    if avatar_url.startswith('/'):
        return _public_origin() + avatar_url
    return avatar_url


def dispatch_roll_webhooks(character_id, label, formula, breakdown, total):
    """Рассылает результат броска во все Discord-вебхуки, включённые для
    этого персонажа (см. CharacterRollPresetLink). Каждая отправка уходит
    в отдельный background task — недоступный/медленный вебхук у одного
    пресета не должен задерживать вызывающий хендлер/роут."""
    if not character_id:
        return
    character = Character.query.get(character_id)
    if not character:
        return

    avatar_url = _absolute_avatar_url(character.avatar_url)
    links = CharacterRollPresetLink.query.filter_by(character_id=character_id, enabled=True).all()
    for link in links:
        preset = link.preset
        socketio.start_background_task(
            send_discord_roll,
            preset.webhook_url,
            preset.color,
            character_name=character.name,
            character_avatar_url=avatar_url,
            label=label,
            formula=formula,
            breakdown=breakdown,
            result=total,
        )
