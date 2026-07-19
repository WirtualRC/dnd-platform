from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user

from ..extensions import db, socketio
from ..models import Character, RoomMembership

characters_bp = Blueprint('characters', __name__)


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
    """Получение одного персонажа для редактирования на странице листа."""
    character = Character.query.get_or_404(char_id)
    if character.owner_id != current_user.id:
        return jsonify({"error": "Permission denied"}), 403

    return jsonify({
        "id": character.id,
        "name": character.name,
        "avatar_url": character.avatar_url,
        "sheet_data": character.sheet_data,
        "updated_at": character.updated_at.isoformat()
    }), 200


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
    """Обновление данных моего персонажа."""
    character = Character.query.get_or_404(char_id)

    if character.owner_id != current_user.id:
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
    memberships = RoomMembership.query.filter_by(active_character_id=character.id).all()
    if memberships:
        vitality = character.sheet_data.get("vitality", {})
        payload = {
            "character_id": character.id,
            "name": character.name,
            "avatar_url": character.avatar_url,
            "hp_current": vitality.get("hp_current"),
            "hp_max": vitality.get("hp_max"),
            "ac": vitality.get("ac"),
        }
        for m in memberships:
            socketio.emit('character_updated', payload, room=str(m.room_id))

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