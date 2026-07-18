from flask_login import current_user
from flask_socketio import emit, join_room as sio_join_room, leave_room as sio_leave_room

from ..extensions import db, socketio
from ..models import RoomMembership, DiceRoll, Room, RoomMode, Token, Character, BattleMap
from ..utils.dice import roll, InvalidDiceFormula
from ..utils.permissions import is_gm, is_character_owner


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

    # право подписать бросок персонажем — владение персонажем (или GM,
    # который может кидать за NPC/монстров), то же правило, что и у токенов.
    # CharacterRoomLink здесь сознательно не проверяется — это не про "можно
    # ли действовать", а про то, что показывать GM в ростере комнаты вне боя.
    if character_id is not None and not (is_character_owner(character_id, current_user.id) or is_gm(room_id, current_user.id)):
        emit('error', {'message': 'Нельзя подписывать бросок чужим персонажем'})
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
        created_by_user_id=current_user.id,
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
        'created_by_user_id': token.created_by_user_id,
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


@socketio.on('token_update_state')
def handle_update_state(data):
    """Обновляет боевое состояние токена — HP и в будущем состояния/заряды
    ресурсов — ОДНИМ событием вместо отдельного на каждый стат.

    Специально не объединено с token_transform_* (позиция/поворот): та
    пара нужна именно из-за троттлинга на каждый кадр драга, а это —
    редкие, всегда мгновенно коммитящиеся изменения с одинаковыми правами
    (GM или владелец персонажа), так что им один общий event подходит.

    patch — частичный словарь, мержится в раздел vitality:
        {"hp_current": 3}
        {"hp_current": 3, "hp_temp": 0}
    Когда появятся состояния/ресурсы — либо расширить ALLOWED_VITALITY_KEYS,
    либо завести соседний top-level раздел в data (например "conditions")
    по той же схеме, не заводя новый socket-event.
    """
    ALLOWED_VITALITY_KEYS = {'hp_current', 'hp_temp'}

    room_id = data.get('room_id')
    token_id = data.get('token_id')
    patch = data.get('patch') or {}

    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    if not patch or not set(patch.keys()) <= ALLOWED_VITALITY_KEYS:
        emit('error', {'message': f'Патч может содержать только поля {ALLOWED_VITALITY_KEYS}'})
        return
    if any(not isinstance(v, int) or v < 0 for v in patch.values()):
        emit('error', {'message': 'Значения HP должны быть неотрицательными целыми числами'})
        return

    token = Token.query.get(token_id)
    if not token or token.battle_map.room_id != room_id:
        emit('error', {'message': 'Токен не найден в этой комнате'})
        return

    is_owner = token.character_id is not None and is_character_owner(token.character_id, current_user.id)
    if not (is_gm(room_id, current_user.id) or is_owner):
        emit('error', {'message': 'Недостаточно прав менять состояние этого токена'})
        return

    if token.instance_data is not None:
        # клонированный экземпляр — правим только его личную копию
        new_data = dict(token.instance_data)
        new_data['vitality'] = {**new_data.get('vitality', {}), **patch}
        token.instance_data = new_data
    elif token.character_id is not None:
        # обычный токен 1:1 — правим напрямую в листе персонажа
        character = Character.query.get(token.character_id)
        new_data = dict(character.sheet_data)
        new_data['vitality'] = {**new_data.get('vitality', {}), **patch}
        character.sheet_data = new_data
    else:
        emit('error', {'message': 'У токена нет данных персонажа для отслеживания состояния'})
        return

    db.session.commit()

    emit('token_state_changed', {
        'token_id': token.id,
        'vitality_patch': patch,
    }, room=str(room_id))


def _can_move_token(token, room_id: int, user_id: int) -> bool:
    """Кто имеет право двигать конкретный токен.

    locked=True — трогать может только GM. С character_id — GM или
    владелец персонажа. Без character_id (пропсы, картинки из Ctrl+V) —
    GM или тот, кто конкретно ЭТОТ токен создал (created_by_user_id)."""
    if token.locked:
        return is_gm(room_id, user_id)
    if is_gm(room_id, user_id):
        return True
    if token.character_id is not None:
        return is_character_owner(token.character_id, user_id)
    return token.created_by_user_id == user_id


@socketio.on('token_transform_live')
def handle_token_transform_live(data):
    """Высокочастотное событие во время драга — НИКОГДА не пишет в БД,
    только ретранслирует позицию остальным участникам комнаты.
    Намеренно тихо игнорирует некорректные вызовы без emit('error', ...):
    на каждый кадр драга слать ошибку было бы спамом, а ценность
    отдельного кадра всё равно нулевая уже к следующему кадру."""
    room_id = data.get('room_id')
    token_id = data.get('token_id')

    if not room_id or not _is_member(room_id, current_user.id):
        return

    token = Token.query.get(token_id)
    if not token or token.battle_map.room_id != room_id:
        return

    if not _can_move_token(token, room_id, current_user.id):
        return

    # include_self=False: у отправителя уже есть локальное оптимистичное
    # положение курсора, дублировать его самому себе незачем
    emit('token_moved_live', {
        'token_id': token_id,
        'pos_x': data.get('pos_x'),
        'pos_y': data.get('pos_y'),
    }, room=str(room_id), include_self=False)


@socketio.on('token_transform_commit')
def handle_token_transform_commit(data):
    """Одна запись в БД на весь драг/ресайз/поворот — вызывается на отпускание."""
    room_id = data.get('room_id')
    token_id = data.get('token_id')
    pos_x = data.get('pos_x')
    pos_y = data.get('pos_y')
    rotation = data.get('rotation')
    width = data.get('width')
    height = data.get('height')

    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    token = Token.query.get(token_id)
    if not token or token.battle_map.room_id != room_id:
        emit('error', {'message': 'Токен не найден в этой комнате'})
        return

    if not _can_move_token(token, room_id, current_user.id):
        emit('error', {'message': 'Недостаточно прав перемещать этот токен'})
        return

    if not isinstance(pos_x, (int, float)) or not isinstance(pos_y, (int, float)):
        emit('error', {'message': 'Некорректные координаты'})
        return

    battle_map = token.battle_map
    token.pos_x = max(0, min(float(pos_x), battle_map.width))
    token.pos_y = max(0, min(float(pos_y), battle_map.height))

    if rotation is not None:
        if not isinstance(rotation, (int, float)):
            emit('error', {'message': 'Некорректный угол поворота'})
            return
        token.rotation = float(rotation) % 360

    # ресайз — оба поля опциональны, но если переданы, должны быть в
    # разумных пределах: не меньше 10px (не превратить токен в невидимую
    # точку) и не больше 2000px (не растянуть на всю карту случайным
    # драгом угла на порядок больше, чем размер самой карты)
    for field_name, value in (('width', width), ('height', height)):
        if value is None:
            continue
        if not isinstance(value, (int, float)) or not (10 <= value <= 2000):
            emit('error', {'message': f'Некорректный размер токена ({field_name})'})
            return
    if width is not None:
        token.width = float(width)
    if height is not None:
        token.height = float(height)

    db.session.commit()

    emit('token_moved_committed', {
        'token_id': token.id,
        'pos_x': token.pos_x,
        'pos_y': token.pos_y,
        'rotation': token.rotation,
        'width': token.width,
        'height': token.height,
    }, room=str(room_id))


@socketio.on('token_remove')
def handle_token_remove(data):
    """Удаление токена с карты. Права те же, что на перемещение — кто
    может двигать токен, тот может его и убрать: GM всегда, владелец
    персонажа — свой токен, создатель пропса без персонажа — свой пропс."""
    room_id = data.get('room_id')
    token_id = data.get('token_id')

    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    token = Token.query.get(token_id)
    if not token or token.battle_map.room_id != room_id:
        emit('error', {'message': 'Токен не найден в этой комнате'})
        return

    if not _can_move_token(token, room_id, current_user.id):
        emit('error', {'message': 'Недостаточно прав удалить этот токен'})
        return

    db.session.delete(token)
    db.session.commit()

    emit('token_removed', {'token_id': token_id}, room=str(room_id))


@socketio.on('spell_cast')
def handle_spell_cast(data):
    """Каст действия из sheet_data.actions персонажа.

    Никакого справочника заклинаний нет — action целиком берётся из
    актуального листа персонажа по id, который сам персонаж и хранит.
    Если у действия есть damage-формула — кидаем её тем же roll(), что и
    обычный dice_roll, и пишем в тот же DiceRoll (это то же самое действие,
    просто инициированное кастом, а не кнопкой "бросить"). Разрешение
    попаданий/спасбросков по целям — вне охвата этого черновика, просто
    визуальная вспышка области поражения для всех в комнате."""
    room_id = data.get('room_id')
    character_id = data.get('character_id')
    action_id = data.get('action_id')
    target_x = data.get('target_x')
    target_y = data.get('target_y')

    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    if not (is_character_owner(character_id, current_user.id) or is_gm(room_id, current_user.id)):
        emit('error', {'message': 'Нельзя кастовать чужим персонажем'})
        return

    if not isinstance(target_x, (int, float)) or not isinstance(target_y, (int, float)):
        emit('error', {'message': 'Некорректная точка цели'})
        return

    character = Character.query.get(character_id)
    if not character:
        emit('error', {'message': 'Персонаж не найден'})
        return

    action = next(
        (a for a in character.sheet_data.get('actions', []) if a.get('id') == action_id),
        None,
    )
    if not action:
        emit('error', {'message': 'Действие не найдено в листе персонажа'})
        return

    payload = {
        'room_id': room_id,
        'user': current_user.username,
        'character_id': character_id,
        'action_name': action.get('name'),
        'target_x': target_x,
        'target_y': target_y,
        'aoe': action.get('aoe') or None,
    }

    damage_formula = action.get('damage')
    if isinstance(damage_formula, str) and damage_formula:
        try:
            result = roll(damage_formula)
        except InvalidDiceFormula:
            # формула вроде "special" (см. контрзаклинание) — не ошибка,
            # просто нечего катить, эффект всё равно показываем
            pass
        else:
            dice_roll = DiceRoll(
                room_id=room_id, user_id=current_user.id, character_id=character_id,
                formula=result.formula, result=result.total, breakdown=result.breakdown,
            )
            db.session.add(dice_roll)
            db.session.commit()
            payload['damage_result'] = {
                'formula': result.formula, 'result': result.total, 'breakdown': result.breakdown,
            }
            emit('dice_roll', {
                'id': dice_roll.id, 'user': current_user.username, 'character_id': character_id,
                'formula': result.formula, 'result': result.total, 'breakdown': result.breakdown,
                'created_at': dice_roll.created_at.isoformat(),
            }, room=str(room_id))

    emit('spell_cast_effect', payload, room=str(room_id))