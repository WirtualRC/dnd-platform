from functools import wraps
from flask import jsonify
from flask_login import current_user

from ..models import RoomMembership, RoomRole, Character, CharacterRoomLink


def is_gm(room_id: int, user_id: int) -> bool:
    """
    Вспомогательная функция для проверки, является ли пользователь GM в данной комнате.
    Идеально подходит для использования внутри SocketIO событий, где декораторы
    работают не так, как в обычных HTTP-роутах.
    """
    membership = RoomMembership.query.filter_by(
        room_id=room_id,
        user_id=user_id
    ).first()

    return membership is not None and membership.role == RoomRole.GM


def require_gm(f):
    """
    Декоратор для REST-роутов. Проверяет, что текущий пользователь аутентифицирован
    и имеет роль GM в комнате, ID которой передан в аргументах роута (например, <int:room_id>).

    Использование:
        @rooms_bp.route('/<int:room_id>/mode', methods=['PUT'])
        @require_gm
        def change_mode(room_id):
            ...

    Примечание: декоратор сам проверяет аутентификацию и возвращает чистый JSON 401,
    поэтому дополнительный @login_required над ним не нужен — он не даст ничего,
    кроме риска не так обработать неаутентифицированный запрос (редиректом вместо JSON),
    если login_manager.unauthorized_handler не переопределён под API.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({"error": "Authentication required"}), 401

        room_id = kwargs.get('room_id')
        if room_id is None:
            return jsonify({"error": "Room ID is required for this action"}), 400

        if not is_gm(room_id, current_user.id):
            return jsonify({"error": "Permission denied. GM access required."}), 403

        return f(*args, **kwargs)

    return decorated_function


def is_character_owner(character_id: int, user_id: int) -> bool:
    """Проверка, является ли пользователь владельцем персонажа."""
    character = Character.query.get(character_id)
    return character is not None and character.owner_id == user_id


def is_character_in_room(character_id: int, room_id: int) -> bool:
    """
    Проверка, что персонаж реально привязан к этой комнате через CharacterRoomLink.
    Без этой проверки GM любой комнаты мог бы действовать на персонажей из чужих
    комнат — достаточно было подставить свой room_id в URL с чужим char_id.
    """
    link = CharacterRoomLink.query.filter_by(
        character_id=character_id,
        room_id=room_id
    ).first()
    return link is not None


def require_character_owner_or_gm(f):
    """
    Декоратор для REST-роутов. Проверяет, что пользователь либо владелец персонажа,
    либо GM именно той комнаты, к которой персонаж реально привязан.
    Ожидает аргументы <int:room_id> и <int:char_id> в роуте.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({"error": "Authentication required"}), 401

        room_id = kwargs.get('room_id')
        char_id = kwargs.get('char_id')

        if room_id is None or char_id is None:
            return jsonify({"error": "Room ID and Character ID are required"}), 400

        # Владелец может управлять своим персонажем независимо от комнаты в URL
        if is_character_owner(char_id, current_user.id):
            return f(*args, **kwargs)

        # GM — только если персонаж действительно привязан к его комнате
        if is_gm(room_id, current_user.id) and is_character_in_room(char_id, room_id):
            return f(*args, **kwargs)

        return jsonify({"error": "Permission denied. You must be the character owner or the room GM."}), 403

    return decorated_function