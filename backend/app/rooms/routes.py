from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user

from ..extensions import db, socketio
from ..models import Room, RoomMembership, RoomRole, BattleMap, Character, CharacterRoomLink
from ..utils.permissions import is_gm, is_character_owner, require_character_owner_or_gm, require_gm
from ..utils.uploads import save_uploaded_image, InvalidImageUpload

rooms_bp = Blueprint('rooms', __name__)


@rooms_bp.route('', methods=['GET'])
@login_required
def get_my_rooms():
    """Список комнат, в которых состоит текущий пользователь."""
    memberships = RoomMembership.query.filter_by(user_id=current_user.id).all()
    rooms = [{
        "id": m.room.id,
        "name": m.room.name,
        "invite_code": m.room.invite_code,
        "mode": m.room.mode.value,
        "role": m.role.value,
        "gm_id": m.room.gm_id,
    } for m in memberships]
    return jsonify({"rooms": rooms}), 200


@rooms_bp.route('', methods=['POST'])
@login_required
def create_room():
    """Создание комнаты. Текущий пользователь становится GM."""
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({"error": "Room name is required"}), 400

    room_name = data['name'].strip()
    if len(room_name) > 100:
        return jsonify({"error": "Room name too long"}), 400

    new_room = Room(name=room_name, gm_id=current_user.id)
    db.session.add(new_room)
    db.session.flush()

    membership = RoomMembership(room_id=new_room.id, user_id=current_user.id, role=RoomRole.GM)
    db.session.add(membership)

    battle_map = BattleMap(room_id=new_room.id, name="Карта 1")
    db.session.add(battle_map)
    db.session.flush()
    new_room.active_battle_map_id = battle_map.id

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating room: {e}")
        return jsonify({"error": "Failed to create room"}), 500

    return jsonify({
        "id": new_room.id,
        "name": new_room.name,
        "invite_code": new_room.invite_code,
        "mode": new_room.mode.value,
    }), 201


@rooms_bp.route('/join', methods=['POST'])
@login_required
def join_room_by_code():
    data = request.get_json()
    if not data or not data.get('invite_code'):
        return jsonify({"error": "Invite code is required"}), 400

    invite_code = data['invite_code'].strip().upper()
    room = Room.query.filter_by(invite_code=invite_code).first()
    if not room:
        return jsonify({"error": "Invalid invite code"}), 404

    existing = RoomMembership.query.filter_by(room_id=room.id, user_id=current_user.id).first()
    if existing:
        return jsonify({"id": room.id, "name": room.name, "already_member": True}), 200

    membership = RoomMembership(room_id=room.id, user_id=current_user.id, role=RoomRole.PLAYER)
    db.session.add(membership)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error joining room: {e}")
        return jsonify({"error": "Failed to join room"}), 500

    return jsonify({"id": room.id, "name": room.name, "already_member": False}), 200


@rooms_bp.route('/<int:room_id>', methods=['GET'])
@login_required
def get_room(room_id):
    room = Room.query.get_or_404(room_id)

    if not RoomMembership.query.filter_by(room_id=room.id, user_id=current_user.id).first():
        return jsonify({"error": "Access denied"}), 403

    return jsonify({
        "id": room.id,
        "name": room.name,
        "invite_code": room.invite_code,
        "mode": room.mode.value,
        "gm_id": room.gm_id,
        "members": [m.to_dict() for m in room.memberships],
    }), 200


@rooms_bp.route('/<int:room_id>/active-character', methods=['PUT'])
@login_required
def set_active_character(room_id):
    """Выбрать, каким персонажем этот участник сейчас играет в этой
    комнате — источник ростера вне боя (RoomMembership.active_character_id),
    независимо от того, стоит ли токен на карте вообще."""
    membership = RoomMembership.query.filter_by(room_id=room_id, user_id=current_user.id).first()
    if not membership:
        return jsonify({"error": "Access denied"}), 403

    data = request.get_json() or {}
    character_id = data.get('character_id')  # None — снять активного персонажа

    character = None
    if character_id is not None:
        character = Character.query.get(character_id)
        if not character or character.owner_id != current_user.id:
            return jsonify({"error": "Можно выбрать активным только своего персонажа"}), 403

    membership.active_character_id = character_id
    db.session.commit()

    socketio.emit('active_character_changed', {
        'room_id': room_id,
        **membership.to_dict(),
    }, room=str(room_id))

    return jsonify({"character_id": character_id}), 200


@rooms_bp.route('/<int:room_id>/characters/<int:char_id>/assign', methods=['POST'])
@require_character_owner_or_gm
def assign_character_to_room(room_id, char_id):
    """Привязать персонажа к комнате (через CharacterRoomLink, многие-ко-многим).

    require_character_owner_or_gm пропустит либо владельца персонажа, либо
    GM — но GM тут по факту не сработает: is_character_in_room до создания
    связи всегда False, так что декоратор пропустит только владельца. Это
    осознанно: назначить своего персонажа в игру — действие самого игрока,
    GM может только (позже) убрать persona из комнаты, не добавить чужого
    без ведома владельца.

    Дополнительно (декоратор этого не проверяет): владелец должен сам
    состоять в комнате — иначе можно было бы приписать своего персонажа
    в чужую комнату, ни разу не зайдя в неё по инвайт-коду.
    """
    if not RoomMembership.query.filter_by(room_id=room_id, user_id=current_user.id).first():
        return jsonify({"error": "Сначала нужно войти в комнату по коду приглашения"}), 403

    if CharacterRoomLink.query.filter_by(character_id=char_id, room_id=room_id).first():
        return jsonify({"message": "Персонаж уже привязан к этой комнате"}), 200

    link = CharacterRoomLink(character_id=char_id, room_id=room_id)
    db.session.add(link)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error assigning character: {e}")
        return jsonify({"error": "Failed to assign character"}), 500

    return jsonify({"message": "Character assigned to room successfully", "character_id": char_id, "room_id": room_id}), 201


@rooms_bp.route('/<int:room_id>/characters/<int:char_id>/unassign', methods=['POST'])
@require_character_owner_or_gm
def unassign_character_from_room(room_id, char_id):
    """Отвязать персонажа от комнаты — персонаж остаётся в библиотеке владельца,
    просто исчезает из ростера этой конкретной комнаты."""
    link = CharacterRoomLink.query.filter_by(character_id=char_id, room_id=room_id).first()
    if not link:
        return jsonify({"error": "Character is not in this room"}), 400

    try:
        db.session.delete(link)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error unassigning character: {e}")
        return jsonify({"error": "Failed to unassign character"}), 500

    return jsonify({"message": "Character removed from room successfully"}), 200


@rooms_bp.route('/<int:room_id>/dice-history', methods=['GET'])
@login_required
def get_dice_history(room_id):
    """История бросков — то, что подтянется при заходе в комнату/обновлении страницы,
    в дополнение к живым событиям dice_roll по сокету."""
    room = Room.query.get_or_404(room_id)
    if not RoomMembership.query.filter_by(room_id=room.id, user_id=current_user.id).first():
        return jsonify({"error": "Access denied"}), 403

    rolls = [
        {
            "id": r.id,
            "user": r.user.username,
            "character_id": r.character_id,
            "character_name": r.character.name if r.character else None,
            "formula": r.formula,
            "result": r.result,
            "breakdown": r.breakdown,
            "created_at": r.created_at.isoformat(),
        }
        for r in room.dice_rolls
    ]
    return jsonify({"rolls": rolls}), 200


@rooms_bp.route('/<int:room_id>/battle-maps', methods=['GET'])
@login_required
def list_battle_maps(room_id):
    """Список карт комнаты для переключателя — без токенов, только id/имя."""
    room = Room.query.get_or_404(room_id)
    if not RoomMembership.query.filter_by(room_id=room.id, user_id=current_user.id).first():
        return jsonify({"error": "Access denied"}), 403

    return jsonify({
        "maps": [{"id": m.id, "name": m.name} for m in room.battle_maps],
        "active_battle_map_id": room.active_battle_map_id,
    }), 200


@rooms_bp.route('/<int:room_id>/battle-maps', methods=['POST'])
@require_gm
def create_battle_map(room_id):
    """Создать новую боевую карту в комнате. Не делает её активной —
    переключение отдельное действие (сокет battle_map_switch), чтобы GM мог
    заранее подготовить карту, не прерывая текущий бой у стола."""
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({"error": "Название карты обязательно"}), 400
    if len(name) > 100:
        return jsonify({"error": "Название карты слишком длинное"}), 400

    battle_map = BattleMap(room_id=room_id, name=name)
    db.session.add(battle_map)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating battle map: {e}")
        return jsonify({"error": "Failed to create battle map"}), 500

    socketio.emit('battle_map_created', {
        'room_id': room_id, 'id': battle_map.id, 'name': battle_map.name,
    }, room=str(room_id))

    return jsonify({"id": battle_map.id, "name": battle_map.name}), 201


@rooms_bp.route('/<int:room_id>/battle-maps/<int:map_id>', methods=['PUT'])
@require_gm
def rename_battle_map(room_id, map_id):
    battle_map = BattleMap.query.get_or_404(map_id)
    if battle_map.room_id != room_id:
        return jsonify({"error": "Battle map not found"}), 404

    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({"error": "Название карты обязательно"}), 400
    if len(name) > 100:
        return jsonify({"error": "Название карты слишком длинное"}), 400

    battle_map.name = name
    db.session.commit()

    socketio.emit('battle_map_renamed', {
        'room_id': room_id, 'id': battle_map.id, 'name': battle_map.name,
    }, room=str(room_id))

    return jsonify({"id": battle_map.id, "name": battle_map.name}), 200


@rooms_bp.route('/<int:room_id>/battle-maps/<int:map_id>', methods=['DELETE'])
@require_gm
def delete_battle_map(room_id, map_id):
    room = Room.query.get_or_404(room_id)
    battle_map = BattleMap.query.get_or_404(map_id)
    if battle_map.room_id != room_id:
        return jsonify({"error": "Battle map not found"}), 404

    if len(room.battle_maps) <= 1:
        return jsonify({"error": "Нельзя удалить последнюю карту комнаты"}), 400

    # если удаляем активную карту — сразу назначаем активной другую, чтобы
    # у комнаты не осталось "дырки": фронтенду всегда есть что показать
    if room.active_battle_map_id == map_id:
        fallback = next(m for m in room.battle_maps if m.id != map_id)
        room.active_battle_map_id = fallback.id

    db.session.delete(battle_map)  # каскадом унесёт все токены этой карты
    db.session.commit()

    socketio.emit('battle_map_deleted', {
        'room_id': room_id, 'id': map_id,
        'active_battle_map_id': room.active_battle_map_id,
    }, room=str(room_id))

    return jsonify({"active_battle_map_id": room.active_battle_map_id}), 200


@rooms_bp.route('/<int:room_id>/battle-maps/<int:map_id>', methods=['GET'])
@login_required
def get_battle_map(room_id, map_id):
    if not RoomMembership.query.filter_by(room_id=room_id, user_id=current_user.id).first():
        return jsonify({"error": "Access denied"}), 403

    battle_map = BattleMap.query.get_or_404(map_id)
    if battle_map.room_id != room_id:
        return jsonify({"error": "Battle map not found"}), 404

    # скрытые от игроков токены (ловушки, засады) не должны утекать в
    # ответе не-GM участнику — фильтрация на клиенте не защита, JSON виден
    # в devtools независимо от того, что рисует интерфейс
    requester_is_gm = is_gm(room_id, current_user.id)

    objects = []
    templates = []
    for token in sorted(battle_map.tokens, key=lambda t: t.layer):
        if token.template:
            # представления приватны: видит создатель, владелец привязанного
            # персонажа, и GM (тому нужен полный обзор) — остальные не должны
            # получить их даже в сыром JSON, не только скрыть в интерфейсе
            is_visible = token.created_by_user_id == current_user.id or (
                token.character_id and is_character_owner(token.character_id, current_user.id)
            )
            if not is_visible:
                continue
            templates.append({
                "id": token.id,
                "battle_map_id": token.battle_map_id,
                "kind": token.template_kind,
                "character_id": token.character_id,
                "character_name": token.character.name if token.character else None,
                "label": token.label,
                "image_url": token.image_url,
                "created_by_user_id": token.created_by_user_id,
            })
            continue

        if not requester_is_gm and not token.visible_to_players:
            continue

        live_sheet = token.instance_data if token.instance_data is not None else (
            token.character.sheet_data if token.character else None
        )
        vitality = (live_sheet or {}).get("vitality", {})
        objects.append({
            "id": token.id,
            "character_id": token.character_id,
            "character_name": token.character.name if token.character else None,
            "created_by_user_id": token.created_by_user_id,
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
            "is_instance": token.instance_data is not None,
            "hp_current": vitality.get("hp_current"),
            "hp_max": vitality.get("hp_max"),
            "ac": vitality.get("ac"),
            "conditions": (live_sheet or {}).get("conditions", []),
        })

    # геометрия тумана войны не секрет (скрыто то, что под ней, а не сама
    # форма) — рассылается всем поровну, без GM/player-фильтрации, в
    # отличие от objects выше
    fog_shapes = [{
        "id": shape.id,
        "shape_type": shape.shape_type,
        "pos_x": shape.pos_x,
        "pos_y": shape.pos_y,
        "width": shape.width,
        "height": shape.height,
        "rotation": shape.rotation,
    } for shape in battle_map.fog_shapes]

    return jsonify({
        "id": battle_map.id,
        "name": battle_map.name,
        "grid_size": battle_map.grid_size,
        "width": battle_map.width,
        "height": battle_map.height,
        "objects": objects,
        "templates": templates,
        "fog_shapes": fog_shapes,
    }), 200


@rooms_bp.route('/<int:room_id>/characters/<int:char_id>/full', methods=['GET'])
@login_required
def get_character_full_in_room(room_id, char_id):
    """Полный лист персонажа в контексте комнаты. Доступен владельцу или
    GM этой комнаты — намеренно БЕЗ проверки CharacterRoomLink: если у
    персонажа есть токен на этой карте, GM должен видеть его лист
    независимо от того, был ли персонаж формально добавлен в ростер."""
    if not RoomMembership.query.filter_by(room_id=room_id, user_id=current_user.id).first():
        return jsonify({"error": "Access denied"}), 403

    character = Character.query.get_or_404(char_id)
    if character.owner_id != current_user.id and not is_gm(room_id, current_user.id):
        return jsonify({"error": "Permission denied"}), 403

    return jsonify({
        "id": character.id,
        "name": character.name,
        "avatar_url": character.avatar_url,
        "sheet_data": character.sheet_data,
    }), 200


@rooms_bp.route('/<int:room_id>/images', methods=['POST'])
@login_required
def upload_image(room_id):
    """Загрузка изображения (токен, фон, проп) для конкретной комнаты."""
    room = Room.query.get_or_404(room_id)
    if not RoomMembership.query.filter_by(room_id=room.id, user_id=current_user.id).first():
        return jsonify({"error": "Access denied"}), 403

    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    try:
        url = save_uploaded_image(request.files['file'], f"room_{room.id}")
    except InvalidImageUpload as e:
        return jsonify({"error": str(e)}), 400

    return jsonify({"url": url}), 201