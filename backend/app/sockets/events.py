from flask_login import current_user
from flask_socketio import emit, join_room as sio_join_room, leave_room as sio_leave_room

from ..extensions import db, socketio
from ..models import RoomMembership, DiceRoll, Room, RoomMode, Token, Character, BattleMap
from ..utils.dice import roll, InvalidDiceFormula
from ..utils.permissions import is_character_in_room, is_gm, is_character_owner


def _is_member(room_id: int, user_id: int) -> bool:
    return RoomMembership.query.filter_by(room_id=room_id, user_id=user_id).first() is not None


@socketio.on('connect')
def handle_connect():
    # current_user здесь работает благодаря тому, что Flask-SocketIO
    # прогоняет handshake через ту же Flask-сессию (ту же куку), что и
    # обычные REST-запросы — отдельного механизма логина для сокета не нужно.
    if not current_user.is_authenticated:
        return False  # False из connect-хендлера отклоняет соединение


@socketio.on('join_room')
def handle_join_room(data):
    room_id = data.get('room_id')
    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    sio_join_room(str(room_id))
    emit('room_joined', {
        'room_id': room_id,
        'username': current_user.username,
    }, room=str(room_id))


@socketio.on('leave_room')
def handle_leave_room(data):
    room_id = data.get('room_id')
    if room_id:
        sio_leave_room(str(room_id))


@socketio.on('dice_roll')
def handle_dice_roll(data):
    room_id = data.get('room_id')
    formula = (data.get('formula') or '').strip()
    character_id = data.get('character_id')

    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    # если бросок привязывают к персонажу — проверяем, что персонаж
    # действительно в этой комнате, а не подставлен чужой char_id
    if character_id is not None and not is_character_in_room(character_id, room_id):
        emit('error', {'message': 'Персонаж не привязан к этой комнате'})
        return

    try:
        result = roll(formula)
    except InvalidDiceFormula as e:
        emit('error', {'message': str(e)})
        return

    dice_roll = DiceRoll(
        room_id=room_id,
        user_id=current_user.id,
        character_id=character_id,
        formula=result.formula,
        result=result.total,
        breakdown=result.breakdown,
    )
    db.session.add(dice_roll)
    db.session.commit()

    emit('dice_roll', {
        'id': dice_roll.id,
        'user': current_user.username,
        'character_id': character_id,
        'formula': result.formula,
        'result': result.total,
        'breakdown': result.breakdown,
        'created_at': dice_roll.created_at.isoformat(),
    }, room=str(room_id))


@socketio.on('mode_change')
def handle_mode_change(data):
    room_id = data.get('room_id')
    new_mode = data.get('mode')

    # менять режим может только GM — это то самое место, где пригодился
    # is_gm из permissions.py, написанный ещё для REST
    if not room_id or not is_gm(room_id, current_user.id):
        emit('error', {'message': 'Только GM может менять режим комнаты'})
        return

    valid_modes = {m.value for m in RoomMode}
    if new_mode not in valid_modes:
        emit('error', {'message': f'Некорректный режим: {new_mode!r}, ожидается одно из {valid_modes}'})
        return

    room = Room.query.get(room_id)
    if not room:
        emit('error', {'message': 'Комната не найдена'})
        return

    room.mode = RoomMode(new_mode)
    db.session.commit()

    # рассылаем всем в комнате, включая самого GM — фронтенд не должен
    # менять локальный стейт до подтверждения от сервера
    emit('mode_changed', {
        'room_id': room_id,
        'mode': room.mode.value,
    }, room=str(room_id))


@socketio.on('token_add')
def handle_token_add(data):
    """Добавление токена на карту.

    as_instance решает КЛИЕНТ, а не бэкенд угадыванием по количеству уже
    существующих токенов — см. обсуждение с групповым спавном саммонов:
    первый элементаль в партии из восьми ничем не должен отличаться от
    седьмого, а угадывание по "уже есть токен?" ломается именно на первом.

    as_instance=False (по умолчанию): токен 1:1 с персонажем — HP и всё
    остальное живёт прямо в Character.sheet_data, как для обычного PC.

    as_instance=True: делаем независимый снимок sheet_data в instance_data
    этого токена. Дальше он живёт своей жизнью, шаблон не трогается.
    """
    room_id = data.get('room_id')
    battle_map_id = data.get('battle_map_id')
    character_id = data.get('character_id')
    as_instance = bool(data.get('as_instance', False))

    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    battle_map = BattleMap.query.get(battle_map_id)
    if not battle_map or battle_map.room_id != room_id:
        emit('error', {'message': 'Карта не найдена или не принадлежит этой комнате'})
        return

    character = None
    if character_id is not None:
        character = Character.query.get(character_id)
        if character is None:
            emit('error', {'message': 'Персонаж не найден'})
            return
        # токен персонажа может поставить либо сам владелец (в т.ч. саммоны
        # игрока), либо GM комнаты (монстры/NPC мастера)
        if not (is_character_owner(character_id, current_user.id) or is_gm(room_id, current_user.id)):
            emit('error', {'message': 'Недостаточно прав добавить токен этого персонажа'})
            return

    token = Token(
        battle_map_id=battle_map_id,
        character_id=character.id if character else None,
        instance_data=dict(character.sheet_data) if (character and as_instance) else None,
        label=data.get('label'),
        image_url=data.get('image_url') or (character.avatar_url if character else None),
        pos_x=data.get('pos_x', 0),
        pos_y=data.get('pos_y', 0),
        width=data.get('width', 50),
        height=data.get('height', 50),
        rotation=data.get('rotation', 0),
        layer=data.get('layer', 10),
        locked=data.get('locked', False),
        visible_to_players=data.get('visible_to_players', True),
    )
    db.session.add(token)
    db.session.commit()

    emit('token_added', {
        'id': token.id,
        'battle_map_id': token.battle_map_id,
        'character_id': token.character_id,
        'label': token.label,
        'image_url': token.image_url,
        'pos_x': token.pos_x,
        'pos_y': token.pos_y,
        'width': token.width,
        'height': token.height,
        'rotation': token.rotation,
        'layer': token.layer,
        'locked': token.locked,
        'visible_to_players': token.visible_to_players,
        'has_instance_data': token.instance_data is not None,
    }, room=str(room_id))


@socketio.on('token_apply_damage')
def handle_apply_damage(data):
    """Меняет hp_current конкретного токена.

    Ключевой момент: пишем либо в token.instance_data (если это клон —
    саммон/монстр), либо напрямую в character.sheet_data (если это живой
    токен персонажа 1:1). Какой из двух — решает наличие instance_data у
    самого токена, а не что-то, что нужно передавать заново с фронтенда.
    """
    room_id = data.get('room_id')
    token_id = data.get('token_id')
    new_hp = data.get('hp_current')

    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    token = Token.query.get(token_id)
    if not token or token.battle_map.room_id != room_id:
        emit('error', {'message': 'Токен не найден в этой комнате'})
        return

    is_owner = token.character_id is not None and is_character_owner(token.character_id, current_user.id)
    if not (is_gm(room_id, current_user.id) or is_owner):
        emit('error', {'message': 'Недостаточно прав менять HP этого токена'})
        return

    if not isinstance(new_hp, int) or new_hp < 0:
        emit('error', {'message': 'Некорректное значение HP'})
        return

    if token.instance_data is not None:
        # клонированный экземпляр — правим только его личную копию
        new_data = dict(token.instance_data)
        new_data['vitality'] = {**new_data.get('vitality', {}), 'hp_current': new_hp}
        token.instance_data = new_data
    elif token.character_id is not None:
        # обычный токен 1:1 — правим напрямую в листе персонажа
        character = Character.query.get(token.character_id)
        new_data = dict(character.sheet_data)
        new_data['vitality'] = {**new_data.get('vitality', {}), 'hp_current': new_hp}
        character.sheet_data = new_data
    else:
        emit('error', {'message': 'У токена нет данных персонажа для отслеживания HP'})
        return

    db.session.commit()

    emit('token_hp_changed', {
        'token_id': token.id,
        'hp_current': new_hp,
    }, room=str(room_id))