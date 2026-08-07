import re

from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from requests import RequestException

from ..extensions import db, socketio
from ..models import (
    Character, RoomMembership, CharacterRoomLink, Token, BattleMap,
    RollWebhookPreset, CharacterRollPresetLink,
)
from ..utils.permissions import is_gm
from ..utils.uploads import save_uploaded_image, InvalidImageUpload
from ..utils.discord_webhook import is_discord_webhook_url, send_discord_test
from ..utils.roll_webhooks import dispatch_roll_webhooks

characters_bp = Blueprint('characters', __name__)

_HEX_COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


def _character_linked_to_room(character_id: int, room_id: int) -> bool:
    """Персонаж реально относится к этой комнате — либо формально в
    ростере (CharacterRoomLink), либо просто стоит токеном на её карте
    (тот же критерий, что и в get_character_full_in_room): GM может вести
    бой персонажем игрока, ни разу не добавленным в ростер явно."""
    if CharacterRoomLink.query.filter_by(character_id=character_id, room_id=room_id).first():
        return True
    return (
        Token.query.join(BattleMap)
        .filter(BattleMap.room_id == room_id, Token.character_id == character_id)
        .first()
        is not None
    )


def _can_edit_character(character: Character, room_id) -> bool:
    """Владелец — всегда. GM — только в контексте своей же комнаты
    (room_id из query, не с потолка) и только если персонаж действительно
    в этой комнате — иначе GM любой комнаты мог бы редактировать чужого
    персонажа, просто подставив свой room_id к чужому char_id в URL."""
    if character.owner_id == current_user.id:
        return True
    if room_id is None:
        return False
    return is_gm(room_id, current_user.id) and _character_linked_to_room(character.id, room_id)


@characters_bp.route('', methods=['GET'])
@login_required
def get_my_characters():
    """Получение списка всех моих персонажей (личная библиотека)."""
    characters = Character.query.filter_by(owner_id=current_user.id).all()

    result = []
    for char in characters:
        result.append({
            "id": char.id,
            "name": char.name,
            "avatar_url": char.avatar_url,
            "sheet_data": char.sheet_data,
            "updated_at": char.updated_at.isoformat()
        })

    return jsonify({"characters": result}), 200


@characters_bp.route('/<int:char_id>', methods=['GET'])
@login_required
def get_character(char_id):
    """Получение одного персонажа для редактирования на странице листа.

    ?room_id=<id> — опциональный контекст: GM комнаты открывает лист
    персонажа игрока (например с боевой карты) с теми же правами на
    просмотр и редактирование, что и у владельца. Без room_id — обычная
    личная библиотека, доступна только владельцу."""
    character = Character.query.get_or_404(char_id)
    room_id = request.args.get('room_id', type=int)
    if not _can_edit_character(character, room_id):
        return jsonify({"error": "Permission denied"}), 403

    return jsonify({
        "id": character.id,
        "name": character.name,
        "avatar_url": character.avatar_url,
        "sheet_data": character.sheet_data,
        "updated_at": character.updated_at.isoformat()
    }), 200


@characters_bp.route('/<int:char_id>/images', methods=['POST'])
@login_required
def upload_character_image(char_id):
    """Загрузка картинки для листа персонажа: аватар самого персонажа или
    иконка конкретного действия/предмета (кладётся в sheet_data обычным
    PUT после того, как фронт получит url отсюда). ?room_id= — тот же
    GM-контекст, что и у GET/PUT (см. _can_edit_character) — иконки для
    хотбара GM тоже может поставить персонажу игрока, ведя его в бою."""
    character = Character.query.get_or_404(char_id)
    room_id = request.args.get('room_id', type=int)
    if not _can_edit_character(character, room_id):
        return jsonify({"error": "Permission denied"}), 403

    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    try:
        url = save_uploaded_image(request.files['file'], f"characters/{char_id}")
    except InvalidImageUpload as e:
        return jsonify({"error": str(e)}), 400

    return jsonify({"url": url}), 201


@characters_bp.route('', methods=['POST'])
@login_required
def create_character():
    """Создание нового персонажа в личную библиотеку (без привязки к комнате)."""
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({"error": "Character name is required"}), 400

    char_name = data['name'].strip()
    if len(char_name) > 100:
        return jsonify({"error": "Character name too long"}), 400

    new_char = Character(
        name=char_name,
        owner_id=current_user.id,
        # room_id больше не существует как поле — персонаж привязывается
        # к комнатам через CharacterRoomLink отдельным запросом
        avatar_url=data.get('avatar_url'),
        sheet_data=data.get('sheet_data', {})
    )
    db.session.add(new_char)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating character: {e}")
        return jsonify({"error": "Failed to create character"}), 500

    return jsonify({
        "message": "Character created successfully",
        "character": {
            "id": new_char.id,
            "name": new_char.name,
            "sheet_data": new_char.sheet_data
        }
    }), 201


@characters_bp.route('/<int:char_id>', methods=['PUT'])
@login_required
def update_character(char_id):
    """Обновление персонажа — своего, либо (с ?room_id=) персонажа игрока
    из комнаты, где current_user — GM (см. _can_edit_character)."""
    character = Character.query.get_or_404(char_id)
    room_id = request.args.get('room_id', type=int)

    if not _can_edit_character(character, room_id):
        return jsonify({"error": "Permission denied"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    if 'name' in data:
        character.name = data['name'].strip()
    if 'avatar_url' in data:
        character.avatar_url = data['avatar_url']
    if 'sheet_data' in data:
        character.sheet_data = data['sheet_data']

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating character: {e}")
        return jsonify({"error": "Failed to update character"}), 500

    # обычный PUT ничего не знает о комнатах (в URL их нет), но если этот
    # персонаж сейчас active_character_id в одной или нескольких комнатах —
    # те, кто смотрит на ростер в этот момент, должны увидеть изменение
    # без перезагрузки страницы. Один персонаж может быть активен сразу в
    # нескольких комнатах (см. CharacterRoomLink), поэтому рассылаем всем.
    # Отдельно добавляем комнаты, где персонаж просто стоит токеном на
    # карте (не обязательно "активен" в ростере) — иначе правка состояний
    # с листа не долетала бы живьём до панели токена на боевой карте.
    active_room_ids = {
        m.room_id for m in RoomMembership.query.filter_by(active_character_id=character.id).all()
    }
    token_room_ids = {
        bm.room_id for bm in BattleMap.query.join(Token).filter(Token.character_id == character.id).all()
    }
    room_ids = active_room_ids | token_room_ids
    if room_ids:
        vitality = character.sheet_data.get("vitality", {})
        payload = {
            "character_id": character.id,
            "name": character.name,
            "avatar_url": character.avatar_url,
            "hp_current": vitality.get("hp_current"),
            "hp_max": vitality.get("hp_max"),
            "ac": vitality.get("ac"),
            "conditions": character.sheet_data.get("conditions", []),
        }
        for room_id in room_ids:
            socketio.emit('character_updated', payload, room=str(room_id))

    return jsonify({
        "message": "Character updated successfully",
        "character": {
            "id": character.id,
            "name": character.name,
            "sheet_data": character.sheet_data,
            "updated_at": character.updated_at.isoformat()
        }
    }), 200


@characters_bp.route('/<int:char_id>', methods=['DELETE'])
@login_required
def delete_character(char_id):
    """Полное удаление персонажа из библиотеки."""
    character = Character.query.get_or_404(char_id)

    if character.owner_id != current_user.id:
        return jsonify({"error": "Permission denied"}), 403

    try:
        db.session.delete(character)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting character: {e}")
        return jsonify({"error": "Failed to delete character"}), 500

    return jsonify({"message": "Character deleted successfully"}), 200


@characters_bp.route('/<int:char_id>/export', methods=['GET'])
@login_required
def export_character(char_id):
    """Отдаёт персонажа как самодостаточный JSON — скачал, скинул другу,
    он импортирует. Никаких ссылок на комнаты/room_id внутри — экспорт
    только того, что реально принадлежит персонажу как сущности."""
    character = Character.query.get_or_404(char_id)
    if character.owner_id != current_user.id:
        return jsonify({"error": "Permission denied"}), 403

    return jsonify({
        "version": 1,
        "name": character.name,
        "avatar_url": character.avatar_url,
        "sheet_data": character.sheet_data,
    }), 200


def _is_safe_avatar_url(url) -> bool:
    """Импортированный файл — недоверенные данные, потенциально от кого
    угодно. avatar_url всегда используется как src картинки, но лучше не
    пускать javascript:/data: и подобное на всякий случай."""
    if url is None:
        return True
    if not isinstance(url, str) or len(url) > 500:
        return False
    return url.startswith('http://') or url.startswith('https://') or url.startswith('/')


@characters_bp.route('/import', methods=['POST'])
@login_required
def import_character():
    """Принимает файл от export_character (свой или чужой) и создаёт
    нового персонажа в библиотеке текущего пользователя — независимую
    копию, не связанную с оригиналом."""
    payload = request.get_json()
    if not payload:
        return jsonify({"error": "No data provided"}), 400

    if payload.get('version') != 1:
        return jsonify({"error": "Неподдерживаемая версия файла персонажа"}), 400

    name = payload.get('name')
    if not name or not isinstance(name, str):
        return jsonify({"error": "Отсутствует или некорректно имя персонажа"}), 400

    sheet_data = payload.get('sheet_data')
    if not isinstance(sheet_data, dict):
        return jsonify({"error": "sheet_data должен быть объектом"}), 400

    avatar_url = payload.get('avatar_url')
    if not _is_safe_avatar_url(avatar_url):
        return jsonify({"error": "Некорректный avatar_url"}), 400

    new_char = Character(
        name=name.strip()[:100],
        owner_id=current_user.id,
        avatar_url=avatar_url,
        sheet_data=sheet_data,
    )
    db.session.add(new_char)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error importing character: {e}")
        return jsonify({"error": "Failed to import character"}), 500

    return jsonify({
        "message": "Character imported successfully",
        "character": {"id": new_char.id, "name": new_char.name},
    }), 201


def _serialize_preset(preset: RollWebhookPreset, enabled: bool) -> dict:
    return {
        "id": preset.id,
        "type": preset.type,
        "name": preset.name,
        "color": preset.color,
        "webhook_url": preset.webhook_url,
        "enabled": enabled,
    }


def _validate_preset_fields(data: dict):
    """Общая валидация полей пресета для создания/редактирования.
    Возвращает (name, color, webhook_url) или бросает ValueError с текстом
    ошибки для клиента."""
    name = (data.get('name') or '').strip()
    if not name or len(name) > 100:
        raise ValueError("Название пресета обязательно и не длиннее 100 символов")

    color = data.get('color') or ''
    if not _HEX_COLOR_RE.match(color):
        raise ValueError("Цвет должен быть в формате #RRGGBB")

    webhook_url = data.get('webhook_url') or ''
    if not is_discord_webhook_url(webhook_url):
        raise ValueError("URL вебхука должен быть настоящей ссылкой на Discord webhook")

    return name, color, webhook_url


@characters_bp.route('/<int:char_id>/roll-presets', methods=['GET'])
@login_required
def list_roll_presets(char_id):
    """Пресеты — личные для пользователя, а не персонажа (см. модель), но
    список отдаём в контексте конкретного персонажа: вместе с каждым
    пресетом отдаём, включён ли он для ЭТОГО персонажа, чтобы фронт мог
    сразу отрисовать галочки."""
    character = Character.query.get_or_404(char_id)
    if character.owner_id != current_user.id:
        return jsonify({"error": "Permission denied"}), 403

    presets = RollWebhookPreset.query.filter_by(owner_id=current_user.id).all()
    links = {
        link.preset_id: link.enabled
        for link in CharacterRollPresetLink.query.filter_by(character_id=char_id).all()
    }
    return jsonify({
        "presets": [_serialize_preset(p, links.get(p.id, False)) for p in presets]
    }), 200


@characters_bp.route('/<int:char_id>/roll-presets', methods=['POST'])
@login_required
def create_roll_preset(char_id):
    """Создаёт новый пресет и сразу включает его для этого персонажа —
    остальным персонажам пользователя пресет виден в списке, но выключен,
    пока не включат его сами (см. toggle_roll_preset)."""
    character = Character.query.get_or_404(char_id)
    if character.owner_id != current_user.id:
        return jsonify({"error": "Permission denied"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    try:
        name, color, webhook_url = _validate_preset_fields(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    preset = RollWebhookPreset(
        owner_id=current_user.id,
        type='discord',
        name=name,
        color=color,
        webhook_url=webhook_url,
    )
    db.session.add(preset)
    db.session.flush()  # нужен preset.id для ссылки на него из link

    link = CharacterRollPresetLink(character_id=char_id, preset_id=preset.id, enabled=True)
    db.session.add(link)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating roll preset: {e}")
        return jsonify({"error": "Failed to create preset"}), 500

    return jsonify({"preset": _serialize_preset(preset, True)}), 201


@characters_bp.route('/roll-presets/<int:preset_id>', methods=['PUT'])
@login_required
def update_roll_preset(preset_id):
    """Правка общих полей пресета — затрагивает всех персонажей,
    у которых он подключён (это тот же URL/цвет/имя, не копия)."""
    preset = RollWebhookPreset.query.get_or_404(preset_id)
    if preset.owner_id != current_user.id:
        return jsonify({"error": "Permission denied"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    try:
        name, color, webhook_url = _validate_preset_fields(data)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    preset.name = name
    preset.color = color
    preset.webhook_url = webhook_url

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating roll preset: {e}")
        return jsonify({"error": "Failed to update preset"}), 500

    return jsonify({"preset": _serialize_preset(preset, True)}), 200


@characters_bp.route('/roll-presets/<int:preset_id>', methods=['DELETE'])
@login_required
def delete_roll_preset(preset_id):
    """Удаляет пресет целиком — вместе со всеми подписками на него
    (cascade на CharacterRollPresetLink), у всех персонажей владельца."""
    preset = RollWebhookPreset.query.get_or_404(preset_id)
    if preset.owner_id != current_user.id:
        return jsonify({"error": "Permission denied"}), 403

    try:
        db.session.delete(preset)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting roll preset: {e}")
        return jsonify({"error": "Failed to delete preset"}), 500

    return jsonify({"message": "Preset deleted successfully"}), 200


@characters_bp.route('/<int:char_id>/roll-presets/<int:preset_id>/toggle', methods=['PUT'])
@login_required
def toggle_roll_preset(char_id, preset_id):
    """Включает/выключает конкретный пресет для конкретного персонажа —
    единственное, что в этой фиче реально привязано к персонажу, а не
    к пользователю целиком."""
    character = Character.query.get_or_404(char_id)
    preset = RollWebhookPreset.query.get_or_404(preset_id)
    if character.owner_id != current_user.id or preset.owner_id != current_user.id:
        return jsonify({"error": "Permission denied"}), 403

    data = request.get_json()
    if not data or 'enabled' not in data:
        return jsonify({"error": "enabled is required"}), 400

    link = CharacterRollPresetLink.query.filter_by(character_id=char_id, preset_id=preset_id).first()
    if link is None:
        link = CharacterRollPresetLink(character_id=char_id, preset_id=preset_id, enabled=bool(data['enabled']))
        db.session.add(link)
    else:
        link.enabled = bool(data['enabled'])

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error toggling roll preset: {e}")
        return jsonify({"error": "Failed to toggle preset"}), 500

    return jsonify({"preset": _serialize_preset(preset, link.enabled)}), 200


@characters_bp.route('/roll-presets/test', methods=['POST'])
@login_required
def test_roll_preset():
    """Кнопка "Проверить" в форме пресета — тестирует URL/цвет прямо из
    черновика формы, без необходимости сначала сохранять пресет."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    webhook_url = data.get('webhook_url') or ''
    if not is_discord_webhook_url(webhook_url):
        return jsonify({"error": "URL вебхука должен быть настоящей ссылкой на Discord webhook"}), 400

    color = data.get('color') or '#F44336'
    try:
        send_discord_test(webhook_url, color, character_name=current_user.username)
    except RequestException as e:
        current_app.logger.warning(f"Discord webhook test failed: {e}")
        return jsonify({"error": "Не удалось отправить сообщение — проверьте URL"}), 400

    return jsonify({"message": "Тестовое сообщение отправлено"}), 200


@characters_bp.route('/<int:char_id>/roll-presets/notify', methods=['POST'])
@login_required
def notify_roll_presets(char_id):
    """Уведомляет включённые для этого персонажа Discord-пресеты о броске,
    сделанном на листе персонажа БЕЗ трансляции в комнату (лист открыт не
    внутри активной комнаты, либо комната не подгружена в этой вкладке) —
    в отличие от dice_roll по сокету, здесь нет ни room_id, ни проверки
    членства в комнате, ни записи в DiceRoll: только рассылка вебхуков,
    чтобы Discord-уведомления не зависели от того, сейчас ли персонаж
    "в бою"/транслируется в какую-то комнату."""
    character = Character.query.get_or_404(char_id)
    if character.owner_id != current_user.id:
        return jsonify({"error": "Permission denied"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    formula = data.get('formula')
    result = data.get('result')
    if not isinstance(formula, str) or not isinstance(result, int):
        return jsonify({"error": "formula and result are required"}), 400

    dispatch_roll_webhooks(char_id, data.get('label'), formula, data.get('breakdown'), result)
    return jsonify({"message": "ok"}), 200