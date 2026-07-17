import os
import uuid
from pathlib import Path
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from PIL import Image

from ..extensions import db
from ..models import Room, RoomMembership, RoomRole, RoomMode, Character, BattleMap, Token
# from ..utils.permissions import require_gm

rooms_bp = Blueprint('rooms', __name__)


# ============================================================================
# КОМНАТЫ
# ============================================================================

@rooms_bp.route('', methods=['POST'])
@login_required
def create_room():
    """Создание новой комнаты. Текущий пользователь автоматически становится GM."""
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({"error": "Room name is required"}), 400

    room_name = data['name'].strip()
    if len(room_name) > 100:
        return jsonify({"error": "Room name too long"}), 400

    # Создаем комнату
    new_room = Room(name=room_name, gm_id=current_user.id)
    db.session.add(new_room)
    db.session.flush()  # Получаем ID комнаты, но еще не коммитим

    # Добавляем создателя как GM
    membership = RoomMembership(room_id=new_room.id, user_id=current_user.id, role=RoomRole.GM)
    db.session.add(membership)

    # Создаем пустую боевую карту для комнаты
    battle_map = BattleMap(room_id=new_room.id)
    db.session.add(battle_map)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating room: {e}")
        return jsonify({"error": "Failed to create room"}), 500

    return jsonify({
        "message": "Room created successfully",
        "room": {
            "id": new_room.id,
            "name": new_room.name,
            "invite_code": new_room.invite_code,
            "mode": new_room.mode.value
        }
    }), 201


@rooms_bp.route('/join', methods=['POST'])
@login_required
def join_room():
    """Вход в комнату по invite_code."""
    data = request.get_json()
    if not data or not data.get('invite_code'):
        return jsonify({"error": "Invite code is required"}), 400

    invite_code = data['invite_code'].strip().upper()

    # Ищем комнату по коду
    room = Room.query.filter_by(invite_code=invite_code).first()
    if not room:
        return jsonify({"error": "Invalid invite code"}), 404

    # Проверяем, не состоит ли уже пользователь в комнате
    existing_membership = RoomMembership.query.filter_by(
        room_id=room.id, user_id=current_user.id
    ).first()
    if existing_membership:
        return jsonify({"message": "Already a member of this room", "room_id": room.id}), 200

    # Добавляем пользователя как игрока
    membership = RoomMembership(room_id=room.id, user_id=current_user.id, role=RoomRole.PLAYER)
    db.session.add(membership)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error joining room: {e}")
        return jsonify({"error": "Failed to join room"}), 500

    return jsonify({
        "message": "Joined room successfully",
        "room": {
            "id": room.id,
            "name": room.name,
            "invite_code": room.invite_code,
            "mode": room.mode.value
        }
    }), 200


@rooms_bp.route('/<int:room_id>', methods=['GET'])
@login_required
def get_room(room_id):
    """Получение информации о комнате."""
    room = Room.query.get_or_404(room_id)

    # Проверяем, что пользователь состоит в комнате
    membership = RoomMembership.query.filter_by(room_id=room.id, user_id=current_user.id).first()
    if not membership:
        return jsonify({"error": "Access denied"}), 403

    # Собираем список участников
    members = []
    for m in room.memberships:
        members.append({
            "user_id": m.user.id,
            "username": m.user.username,
            "role": m.role.value
        })

    return jsonify({
        "id": room.id,
        "name": room.name,
        "invite_code": room.invite_code,
        "mode": room.mode.value,
        "gm_id": room.gm_id,
        "members": members
    }), 200


# ============================================================================
# ПЕРСОНАЖИ В КОМНАТЕ (управление составом игроков)
# ============================================================================

@rooms_bp.route('/<int:room_id>/characters', methods=['GET'])
@login_required
def get_room_characters(room_id):
    """Получение списка персонажей, активных в этой комнате."""
    room = Room.query.get_or_404(room_id)

    if not RoomMembership.query.filter_by(room_id=room.id, user_id=current_user.id).first():
        return jsonify({"error": "Access denied"}), 403

    characters = []
    for char in room.characters:
        characters.append({
            "id": char.id,
            "name": char.name,
            "owner_id": char.owner_id,
            "avatar_url": char.avatar_url,
            "sheet_data": char.sheet_data,
            "updated_at": char.updated_at.isoformat()
        })

    return jsonify({"characters": characters}), 200


@rooms_bp.route('/<int:room_id>/characters/assign', methods=['POST'])
@login_required
def assign_character_to_room(room_id):
    """Добавление существующего персонажа в комнату (сделать его активным в игре)."""
    room = Room.query.get_or_404(room_id)

    membership = RoomMembership.query.filter_by(room_id=room.id, user_id=current_user.id).first()
    # Проверка доступа к комнате
    if not membership:
        return jsonify({"error": "Access denied"}), 403

    data = request.get_json()
    if not data or not data.get('character_id'):
        return jsonify({"error": "character_id is required"}), 400

    char_id = data['character_id']
    character = Character.query.get_or_404(char_id)

    # Проверка, что это мой персонаж
    if character.owner_id != current_user.id:
        return jsonify({"error": "Permission denied"}), 403

    # # Если персонаж уже в другой комнате, сначала "отвяжем" его оттуда
    # # (В LSS это выглядит как "выйти из другой игры")
    # if character.room_id is not None and character.room_id != room.id:
    #     character.room_id = None
    membership.active_character_id = character.id

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error assigning character: {e}")
        return jsonify({"error": "Failed to assign character"}), 500

    return jsonify({
        "message": "Character assigned to room successfully",
        "character": {
            "id": character.id,
            "name": character.name,
            "room_id": character.room_id
        }
    }), 200


@rooms_bp.route('/<int:room_id>/characters/<int:char_id>/unassign', methods=['POST'])
@login_required
def unassign_character_from_room(room_id, char_id):
    """Удаление персонажа из комнаты (он остается в библиотеке пользователя)."""
    room = Room.query.get_or_404(room_id)
    character = Character.query.get_or_404(char_id)

    membership = RoomMembership.query.filter_by(room_id=room.id, user_id=current_user.id).first()
    # Проверка доступа
    if not membership:
        return jsonify({"error": "Access denied"}), 403

    # Проверка, что персонаж принадлежит этой комнате
    # if character.room_id != room.id:
    #     return jsonify({"error": "Character is not in this room"}), 400

    # Проверка прав: убрать может либо владелец, либо GM
    if membership.active_character_id:
        char = Character.query.get(membership.active_character_id)
        if char.owner_id != current_user.id and room.gm_id != current_user.id:
            return jsonify({"error": "Permission denied"}), 403

    # Отвязываем от комнаты
    membership.active_character_id = None

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error unassigning character: {e}")
        return jsonify({"error": "Failed to unassign character"}), 500

    return jsonify({
        "message": "Character removed from room successfully",
        "character": {
            "id": character.id,
            "name": character.name,
            "room_id": None
        }
    }), 200


# ============================================================================
# БОЕВАЯ КАРТА
# ============================================================================

@rooms_bp.route('/<int:room_id>/battle-map', methods=['GET'])
@login_required
def get_battle_map(room_id):
    """Получение состояния боевой карты."""
    room = Room.query.get_or_404(room_id)
 
    if not RoomMembership.query.filter_by(room_id=room.id, user_id=current_user.id).first():
        return jsonify({"error": "Access denied"}), 403
 
    battle_map = room.battle_map
    if not battle_map:
        return jsonify({"error": "Battle map not found"}), 404
 
    # Фон — это тот же Token с layer=0, отдельного поля для него нет.
    # Сортируем по layer, чтобы фронтенд мог просто отрендерить по порядку
    # (Konva.Layer использует порядок добавления как z-index).
    objects = []
    for token in sorted(battle_map.tokens, key=lambda t: t.layer):
        objects.append({
            "id": token.id,
            "character_id": token.character_id,
            "label": token.label,
            "image_url": token.image_url,
            "pos_x": token.pos_x,
            "pos_y": token.pos_y,
            "width": token.width,
            "height": token.height,
            "rotation": token.rotation,
            "layer": token.layer,
            "locked": token.locked,
            "visible_to_players": token.visible_to_players,
        })
 
    return jsonify({
        "id": battle_map.id,
        "grid_size": battle_map.grid_size,
        "width": battle_map.width,
        "height": battle_map.height,
        "objects": objects,
    }), 200


# ============================================================================
# ЗАГРУЗКА ФАЙЛОВ
# ============================================================================

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    """Проверка расширения файла."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@rooms_bp.route('/<int:room_id>/images', methods=['POST'])
@login_required
def upload_image(room_id):
    """Загрузка изображения (карта или токен)."""
    room = Room.query.get_or_404(room_id)

    # Проверяем, что пользователь состоит в комнате
    if not RoomMembership.query.filter_by(room_id=room.id, user_id=current_user.id).first():
        return jsonify({"error": "Access denied"}), 403

    # Проверяем наличие файла
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "File type not allowed"}), 400

    # Валидация через Pillow (проверяем, что это действительно изображение)
    try:
        img = Image.open(file)
        img.verify()  # Проверяем целостность файла
        file.seek(0)  # Сбрасываем указатель после verify()
    except Exception:
        return jsonify({"error": "Invalid image file"}), 400

    # Генерируем уникальное имя файла
    filename = secure_filename(file.filename)
    unique_filename = f"{uuid.uuid4().hex}_{filename}"

    # Создаем директорию для комнаты, если её нет
    upload_dir = Path(current_app.config['UPLOAD_DIR']) / f"room_{room.id}"
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Сохраняем файл
    file_path = upload_dir / unique_filename
    file.save(file_path)

    # Формируем URL для доступа к файлу
    # В проде здесь нужно будет настроить раздачу статических файлов через nginx
    file_url = f"/uploads/room_{room.id}/{unique_filename}"

    return jsonify({
        "message": "File uploaded successfully",
        "url": file_url
    }), 201