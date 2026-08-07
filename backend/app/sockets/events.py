import random

from flask_login import current_user
from flask_socketio import emit, join_room as sio_join_room, leave_room as sio_leave_room

from ..extensions import db, socketio
from ..models import RoomMembership, DiceRoll, Room, RoomMode, Token, Character, BattleMap, FogShape
from ..utils.dice import roll, InvalidDiceFormula
from ..utils.permissions import is_gm, is_character_owner
from ..utils.dnd import effective_ac, effective_hp_max
from ..utils.roll_webhooks import dispatch_roll_webhooks


def _is_member(room_id: int, user_id: int) -> bool:
    return RoomMembership.query.filter_by(room_id=room_id, user_id=user_id).first() is not None


def _serialize_placed_token(token):
    """Общая форма для token_added — используется и обычным token_add, и
    place_template (клонирование представления на карту), чтобы фронтенд
    рендерил токен одинаково независимо от способа его появления."""
    live_sheet = token.instance_data if token.instance_data is not None else (
        token.character.sheet_data if token.character else None
    )
    vitality = (live_sheet or {}).get('vitality', {})
    return {
        'id': token.id,
        'battle_map_id': token.battle_map_id,
        'character_id': token.character_id,
        'character_name': token.character.name if token.character else None,
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
        'is_instance': token.instance_data is not None,
        'hp_current': vitality.get('hp_current'),
        'hp_max': effective_hp_max(live_sheet),
        'ac': effective_ac(live_sheet),
        'conditions': (live_sheet or {}).get('conditions', []),
        'in_initiative': token.in_initiative,
        'initiative_order': token.initiative_order,
        'initiative_stats_visible_to_players': token.initiative_stats_visible_to_players,
    }


def _serialize_template(token):
    """Представление — заготовка со своей иконкой, ещё не размещённая на
    карте. Позиция/поворот/HP тут бессмысленны и намеренно не отдаются."""
    return {
        'id': token.id,
        'battle_map_id': token.battle_map_id,
        'kind': token.template_kind,
        'character_id': token.character_id,
        'character_name': token.character.name if token.character else None,
        'label': token.label,
        'image_url': token.image_url,
        'created_by_user_id': token.created_by_user_id,
    }


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
    sio_join_room(f'user_{room_id}_{current_user.id}')  # личный канал — адресные приватные рассылки

    membership = RoomMembership.query.filter_by(room_id=room_id, user_id=current_user.id).first()
    emit('room_joined', {
        'room_id': room_id,
        **membership.to_dict(),
    }, room=str(room_id))


@socketio.on('leave_room')
def handle_leave_room(data):
    room_id = data.get('room_id')
    if room_id:
        sio_leave_room(str(room_id))


@socketio.on('dice_roll')
def handle_dice_roll(data):
    room_id = data.get('room_id')
    character_id = data.get('character_id')
    advantage = bool(data.get('advantage'))
    disadvantage = bool(data.get('disadvantage'))
    label = data.get('label')

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

    if advantage or disadvantage:
        # d20 с преимуществом/помехой — не обычная формула из dice.py
        # (два d20 и выбор одного — это правило, не арифметика), поэтому
        # отдельная ветка: клиент шлёт целый bonus, а не строку формулы.
        # Бросок всегда решает сервер, даже здесь — иначе это можно было
        # бы подделать на клиенте перед отправкой.
        bonus = data.get('bonus')
        if not isinstance(bonus, int):
            emit('error', {'message': 'Для броска с преимуществом/помехой нужен целый bonus'})
            return

        r1, r2 = random.randint(1, 20), random.randint(1, 20)
        if advantage and not disadvantage:
            chosen, roll_type = max(r1, r2), 'преимущество'
        elif disadvantage and not advantage:
            chosen, roll_type = min(r1, r2), 'помеха'
        else:
            # оба флага разом — по правилам 5e гасят друг друга, обычный бросок
            chosen, roll_type = r1, 'обычный бросок'

        sign = '+' if bonus >= 0 else '-'
        final_formula = f"1d20{sign}{abs(bonus)}"
        final_total = chosen + bonus
        # для тоста/лога комнаты — показываем оба брошенных d20 и то, что
        # был выбор (важный контекст при преимуществе/помехе)
        final_breakdown = f"d20[{r1}, {r2}] ({roll_type}) {sign} {abs(bonus)}"
        # для Discord — отдельная версия только с выбранным значением: формат
        # там строится по formula+breakdown (см. _build_roll_lines), и с
        # обоими d20 в скобках сумма не сойдётся с final_total, а с одним
        # выбранным работает так же, как для обычного броска
        discord_breakdown = f"d20[{chosen}] {sign} {abs(bonus)}"
        discord_label = f"{label} ({roll_type})" if label and roll_type != 'обычный бросок' else label
    else:
        formula = (data.get('formula') or '').strip()
        try:
            result = roll(formula)
        except InvalidDiceFormula as e:
            emit('error', {'message': str(e)})
            return
        final_formula = result.formula
        final_total = result.total
        final_breakdown = result.breakdown
        discord_breakdown = final_breakdown
        discord_label = label

    dice_roll = DiceRoll(
        room_id=room_id,
        user_id=current_user.id,
        character_id=character_id,
        formula=final_formula,
        result=final_total,
        breakdown=final_breakdown,
    )
    db.session.add(dice_roll)
    db.session.commit()

    emit('dice_roll', {
        'id': dice_roll.id,
        'user': current_user.username,
        'character_id': character_id,
        'character_name': dice_roll.character.name if dice_roll.character else None,
        'formula': final_formula,
        'result': final_total,
        'breakdown': final_breakdown,
        'label': label,
        'created_at': dice_roll.created_at.isoformat(),
    }, room=str(room_id))

    dispatch_roll_webhooks(character_id, discord_label, final_formula, discord_breakdown, final_total)


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


@socketio.on('battle_map_switch')
def handle_battle_map_switch(data):
    """Переключение активной карты комнаты — GM готовит несколько карт
    заранее и переключается между ними, все участники видят одну и ту же
    активную карту одновременно (тот же принцип, что и mode_change)."""
    room_id = data.get('room_id')
    battle_map_id = data.get('battle_map_id')

    if not room_id or not is_gm(room_id, current_user.id):
        emit('error', {'message': 'Только GM может переключать карту'})
        return

    battle_map = BattleMap.query.get(battle_map_id)
    if not battle_map or battle_map.room_id != room_id:
        emit('error', {'message': 'Карта не найдена или не принадлежит этой комнате'})
        return

    room = Room.query.get(room_id)
    if not room:
        emit('error', {'message': 'Комната не найдена'})
        return

    room.active_battle_map_id = battle_map_id
    db.session.commit()

    emit('battle_map_switched', {
        'room_id': room_id,
        'battle_map_id': battle_map_id,
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
    client_nonce = data.get('client_nonce')

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

    # client_nonce — сквозной идентификатор, который клиент присылает сам
    # (например, при вставке картинки Ctrl+V), чтобы потом опознать в общей
    # рассылке token_added именно свой запрос и узнать id для undo. Никак
    # не используется сервером, просто эхом возвращается отправителю.
    payload = _serialize_placed_token(token)
    if client_nonce is not None:
        payload['client_nonce'] = client_nonce
    emit('token_added', payload, room=str(room_id))


@socketio.on('template_create')
def handle_template_create(data):
    """Создаёт представление — ещё не размещённую на карте заготовку токена
    со своей иконкой. Живёт в плавающей панели между играми (не расходуется
    при перетаскивании — см. place_template), пока его явно не удалят."""
    room_id = data.get('room_id')
    battle_map_id = data.get('battle_map_id')
    kind = data.get('kind')
    character_id = data.get('character_id')

    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    if kind not in ('pc', 'npc'):
        emit('error', {'message': "kind должен быть 'pc' или 'npc'"})
        return

    battle_map = BattleMap.query.get(battle_map_id)
    if not battle_map or battle_map.room_id != room_id:
        emit('error', {'message': 'Карта не найдена или не принадлежит этой комнате'})
        return

    if kind == 'pc' and character_id is None:
        emit('error', {'message': "Представление на вкладке «Персонажи» обязательно привязывается к листу"})
        return

    character = None
    if character_id is not None:
        character = Character.query.get(character_id)
        if character is None:
            emit('error', {'message': 'Персонаж не найден'})
            return
        if not (is_character_owner(character_id, current_user.id) or is_gm(room_id, current_user.id)):
            emit('error', {'message': 'Недостаточно прав привязать этого персонажа'})
            return

    template = Token(
        battle_map_id=battle_map_id,
        character_id=character.id if character else None,
        created_by_user_id=current_user.id,
        label=data.get('label') or (character.name if character else None),
        image_url=data.get('image_url') or (character.avatar_url if character else None),
        template=True,
        template_kind=kind,
    )
    db.session.add(template)
    db.session.commit()

    # приватно: только создателю (его личный канал) и в GM-канал — если
    # создатель сам GM, придёт дважды в один и тот же сокет, но это
    # безобидно (фронтенд не даст задублировать по id)
    payload = _serialize_template(template)
    emit('template_created', payload, room=f'user_{room_id}_{current_user.id}')


@socketio.on('template_delete')
def handle_template_delete(data):
    room_id = data.get('room_id')
    template_id = data.get('template_id')

    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    template = Token.query.get(template_id)
    if not template or not template.template or template.battle_map.room_id != room_id:
        emit('error', {'message': 'Представление не найдено в этой комнате'})
        return

    # удалить может создатель представления, владелец привязанного
    # персонажа, или GM — то же деление прав, что и у самих токенов
    is_owner = template.character_id is not None and is_character_owner(template.character_id, current_user.id)
    is_creator = template.created_by_user_id == current_user.id
    if not (is_gm(room_id, current_user.id) or is_owner or is_creator):
        emit('error', {'message': 'Недостаточно прав удалить это представление'})
        return

    creator_id = template.created_by_user_id
    db.session.delete(template)
    db.session.commit()

    payload = {'template_id': template_id}
    emit('template_deleted', payload, room=f'user_{room_id}_{creator_id}')


@socketio.on('place_template')
def handle_place_template(data):
    """Перетаскивание представления на карту — клонирует его в реальный
    размещённый токен (template=False), оригинал остаётся в панели.

    Инстансирование решает НЕ клиент, а сама вкладка представления:
    kind='pc'  — всегда живая связь 1:1, instance_data не создаётся (на
                 этом будет держаться будущий "Отряд на карте").
    kind='npc' — если есть character_id, ВСЕГДА снимок instance_data —
                 то же правило, что и у явного as_instance=True в token_add.
    """
    room_id = data.get('room_id')
    template_id = data.get('template_id')
    pos_x = data.get('pos_x')
    pos_y = data.get('pos_y')

    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    if not isinstance(pos_x, (int, float)) or not isinstance(pos_y, (int, float)):
        emit('error', {'message': 'Некорректная точка размещения'})
        return

    template = Token.query.get(template_id)
    if not template or not template.template or template.battle_map.room_id != room_id:
        emit('error', {'message': 'Представление не найдено в этой комнате'})
        return

    if template.character_id is not None and not (
        is_character_owner(template.character_id, current_user.id) or is_gm(room_id, current_user.id)
    ):
        emit('error', {'message': 'Недостаточно прав разместить токен этого персонажа'})
        return

    as_instance = template.template_kind == 'npc' and template.character_id is not None

    token = Token(
        battle_map_id=template.battle_map_id,
        character_id=template.character_id,
        instance_data=dict(template.character.sheet_data) if as_instance else None,
        created_by_user_id=current_user.id,
        label=template.label,
        image_url=template.image_url,
        pos_x=pos_x,
        pos_y=pos_y,
        width=data.get('width', 50),
        height=data.get('height', 50),
        layer=10,
    )
    db.session.add(token)
    db.session.commit()

    emit('token_added', _serialize_placed_token(token), room=str(room_id))


@socketio.on('token_update_state')
def handle_update_state(data):
    """Обновляет боевое состояние токена — HP и состояния (conditions) —
    ОДНИМ событием вместо отдельного на каждый стат.

    Специально не объединено с token_transform_* (позиция/поворот): та
    пара нужна именно из-за троттлинга на каждый кадр драга, а это —
    редкие, всегда мгновенно коммитящиеся изменения с одинаковыми правами
    (GM или владелец персонажа), так что им один общий event подходит.

    patch — частичный словарь:
        {"hp_current": 3}                — мержится в раздел vitality
        {"hp_current": 3, "hp_temp": 0}
        {"conditions": ["Отравлен"]}      — заменяет соседний top-level
                                             раздел conditions целиком
    Оба раздела можно передать одним патчем.
    """
    ALLOWED_VITALITY_KEYS = {'hp_current', 'hp_temp'}

    room_id = data.get('room_id')
    token_id = data.get('token_id')
    patch = data.get('patch') or {}

    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    unknown_keys = set(patch.keys()) - ALLOWED_VITALITY_KEYS - {'conditions'}
    if not patch or unknown_keys:
        emit('error', {'message': f'Патч может содержать только поля {ALLOWED_VITALITY_KEYS | {"conditions"}}'})
        return

    vitality_patch = {k: v for k, v in patch.items() if k in ALLOWED_VITALITY_KEYS}
    if vitality_patch and any(not isinstance(v, int) or isinstance(v, bool) or v < 0 for v in vitality_patch.values()):
        emit('error', {'message': 'Значения HP должны быть неотрицательными целыми числами'})
        return

    conditions = patch.get('conditions')
    if conditions is not None and (
        not isinstance(conditions, list) or not all(isinstance(c, str) for c in conditions)
    ):
        emit('error', {'message': 'conditions должен быть списком строк'})
        return

    token = Token.query.get(token_id)
    if not token or token.battle_map.room_id != room_id:
        emit('error', {'message': 'Токен не найден в этой комнате'})
        return

    if not _can_manage_token(token, room_id, current_user.id):
        emit('error', {'message': 'Недостаточно прав менять состояние этого токена'})
        return

    if token.instance_data is not None:
        # клонированный экземпляр (или безличный проп, уже получивший свой
        # instance_data ниже) — правим только его личную копию
        new_data = dict(token.instance_data)
        if vitality_patch:
            new_data['vitality'] = {**new_data.get('vitality', {}), **vitality_patch}
        if conditions is not None:
            new_data['conditions'] = conditions
        token.instance_data = new_data
    elif token.character_id is not None:
        # обычный токен 1:1 — правим напрямую в листе персонажа
        character = Character.query.get(token.character_id)
        new_data = dict(character.sheet_data)
        if vitality_patch:
            new_data['vitality'] = {**new_data.get('vitality', {}), **vitality_patch}
        if conditions is not None:
            new_data['conditions'] = conditions
        character.sheet_data = new_data
    elif conditions is not None and not vitality_patch:
        # безличный проп/NPC без привязанного листа (например, NPC-токен
        # без выбора персонажа в представлении) — HP тут отслеживать
        # неоткуда (нет sheet_data.vitality с hp_max), но состояния —
        # чистый список тегов, ему для этого лист не нужен. Заводим
        # instance_data только под conditions, дальнейшие правки пойдут
        # веткой выше.
        token.instance_data = {'conditions': conditions}
    else:
        emit('error', {'message': 'У токена нет данных персонажа для отслеживания HP'})
        return

    db.session.commit()

    _emit_token_patch_filtered(room_id, 'token_state_changed', token, {
        'token_id': token.id,
        'vitality_patch': vitality_patch,
        'conditions': conditions,
    }, sensitive_keys={'hp_current', 'hp_max', 'hp_temp', 'ac'})


def _can_move_token(token, room_id: int, user_id: int) -> bool:
    """Кто имеет право двигать конкретный токен.

    locked=True — не двигает никто, вообще никто, включая GM: закреп это
    явная защита от случайного сдвига мышкой, а не право доступа, так что
    у него нет обхода через роль. Чтобы подвинуть закреплённый токен,
    сначала снимают закреп (см. token_update_props / _can_manage_token —
    то право НЕ проверяет locked, им открепить может GM или владелец).
    Дальше, без учёта locked: с character_id — GM или владелец персонажа.
    Без character_id (пропсы, картинки из Ctrl+V) — GM или тот, кто
    конкретно ЭТОТ токен создал (created_by_user_id)."""
    if token.locked:
        return False
    if is_gm(room_id, user_id):
        return True
    if token.character_id is not None:
        return is_character_owner(token.character_id, user_id)
    return token.created_by_user_id == user_id


def _can_manage_token(token, room_id: int, user_id: int) -> bool:
    """Кто может менять метаданные токена (закреп, слой) — в отличие от
    _can_move_token, здесь текущее значение locked не в счёт: иначе игрок,
    закрепивший свой же токен, тут же терял бы право сам его открепить, и
    открепить смог бы только GM. Права те же, что и на создание токена:
    GM, владелец персонажа или создатель безличного пропса. Те же права
    используются и для инициативы (добавить/убрать/переставить/скрыть ХП-КД)."""
    if is_gm(room_id, user_id):
        return True
    if token.character_id is not None:
        return is_character_owner(token.character_id, user_id)
    return token.created_by_user_id == user_id


def _emit_token_patch_filtered(room_id, event, token, payload, sensitive_keys):
    """Рассылает payload комнате как обычно, но если у токена скрыты ХП/КД
    в инициативе (in_initiative и не initiative_stats_visible_to_players),
    всем кроме ГМ отправляет копию, где sensitive_keys обнулены — на
    верхнем уровне и внутри вложенных dict-значений (например
    vitality_patch). Обнуляем явным None, а не выбрасываем ключ: фронтенд
    мержит такие патчи слепым спредом (см. token_state_changed/
    token_props_updated в useBattleMapStore.js), так что просто опущенный
    ключ оставил бы у игрока последнее известное (уже неактуальное)
    значение вместо реального сокрытия."""
    hide = token.in_initiative and not token.initiative_stats_visible_to_players
    if not hide:
        emit(event, payload, room=str(room_id))
        return

    def _scrub(value):
        if isinstance(value, dict):
            return {k: (None if k in sensitive_keys else v) for k, v in value.items()}
        return value

    filtered = {k: (None if k in sensitive_keys else _scrub(v)) for k, v in payload.items()}

    for membership in RoomMembership.query.filter_by(room_id=room_id).all():
        full = is_gm(room_id, membership.user_id)
        emit(event, payload if full else filtered, room=f'user_{room_id}_{membership.user_id}')


@socketio.on('token_update_props')
def handle_token_update_props(data):
    """Закреп (locked), слой (layer) и участие/видимость в инициативе —
    отдельно от token_transform_commit, т.к. право их менять не зависит от
    текущего locked (см. _can_manage_token)."""
    room_id = data.get('room_id')
    token_id = data.get('token_id')

    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    token = Token.query.get(token_id)
    if not token or token.battle_map.room_id != room_id:
        emit('error', {'message': 'Токен не найден в этой комнате'})
        return

    if not _can_manage_token(token, room_id, current_user.id):
        emit('error', {'message': 'Недостаточно прав изменить этот токен'})
        return

    patch = {}
    if 'locked' in data:
        locked = data.get('locked')
        if not isinstance(locked, bool):
            emit('error', {'message': 'Некорректное значение закрепа'})
            return
        token.locked = locked
        patch['locked'] = locked
    if 'layer' in data:
        layer = data.get('layer')
        if not isinstance(layer, int) or isinstance(layer, bool):
            emit('error', {'message': 'Некорректный слой'})
            return
        token.layer = layer
        patch['layer'] = layer
    if 'in_initiative' in data:
        in_initiative = data.get('in_initiative')
        if not isinstance(in_initiative, bool):
            emit('error', {'message': 'Некорректное значение участия в инициативе'})
            return
        token.in_initiative = in_initiative
        if in_initiative:
            # новый участник — в конец списка: max initiative_order среди
            # уже стоящих в инициативе токенов этой же карты, +1
            max_order = db.session.query(db.func.max(Token.initiative_order)).filter(
                Token.battle_map_id == token.battle_map_id, Token.in_initiative.is_(True), Token.id != token.id,
            ).scalar()
            token.initiative_order = (max_order or 0) + 1
        patch['in_initiative'] = in_initiative
    if 'initiative_stats_visible_to_players' in data:
        visible = data.get('initiative_stats_visible_to_players')
        if not isinstance(visible, bool):
            emit('error', {'message': 'Некорректное значение видимости ХП/КД'})
            return
        token.initiative_stats_visible_to_players = visible
        patch['initiative_stats_visible_to_players'] = visible

    if not patch:
        return

    db.session.commit()

    # смена состава/видимости инициативы должна тут же скорректировать то,
    # что игроки видят про ХП/КД — не ждать следующего token_state_changed
    if 'in_initiative' in patch or 'initiative_stats_visible_to_players' in patch:
        live_sheet = token.instance_data if token.instance_data is not None else (
            token.character.sheet_data if token.character else None
        )
        vitality = (live_sheet or {}).get('vitality', {})
        patch['hp_current'] = vitality.get('hp_current')
        patch['hp_max'] = effective_hp_max(live_sheet)
        patch['ac'] = effective_ac(live_sheet)

    _emit_token_patch_filtered(
        room_id, 'token_props_updated', token, {'token_id': token.id, **patch},
        sensitive_keys={'hp_current', 'hp_max', 'ac'},
    )


@socketio.on('initiative_move')
def handle_initiative_move(data):
    """Точечная перестановка одного токена в списке инициативы: клиент
    шлёт только (token_id, new_index), сервер сам пересобирает порядок
    остальных — так не нужно доверять клиенту чужие initiative_order и
    не нужно валидировать целый присланный список id."""
    room_id = data.get('room_id')
    token_id = data.get('token_id')
    new_index = data.get('new_index')

    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    token = Token.query.get(token_id)
    if not token or token.battle_map.room_id != room_id:
        emit('error', {'message': 'Токен не найден в этой комнате'})
        return

    if not _can_manage_token(token, room_id, current_user.id):
        emit('error', {'message': 'Недостаточно прав переставить этот токен'})
        return

    if not isinstance(new_index, int) or isinstance(new_index, bool):
        emit('error', {'message': 'Некорректный индекс'})
        return

    if not token.in_initiative:
        emit('error', {'message': 'Токен не в инициативе'})
        return

    ordered = [
        t for t in Token.query.filter_by(
            battle_map_id=token.battle_map_id, in_initiative=True,
        ).order_by(Token.initiative_order).all()
        if t.id != token.id
    ]
    new_index = max(0, min(new_index, len(ordered)))
    ordered.insert(new_index, token)

    for index, t in enumerate(ordered):
        t.initiative_order = index

    db.session.commit()

    emit('initiative_reordered', {
        'battle_map_id': token.battle_map_id,
        'order': [t.id for t in ordered],
    }, room=str(room_id))


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
    # точку) и не больше 5000px (не растянуть на всю карту случайным
    # драгом угла на порядок больше, чем размер самой карты)
    for field_name, value in (('width', width), ('height', height)):
        if value is None:
            continue
        if not isinstance(value, (int, float)) or not (10 <= value <= 5000):
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


@socketio.on('token_duplicate')
def handle_token_duplicate(data):
    """Копирование уже размещённого токена (Ctrl+C/Ctrl+V на карте) — в
    отличие от token_add, здесь клиент не присылает никаких игровых данных,
    только id токена-источника и точку вставки: сервер сам читает
    авторитетное текущее состояние источника и решает, что скопировать.

    Логика листа персонажа зависит от того, ЧТО именно копируется:
    - у источника уже есть instance_data (это саммон/NPC-инстанс, возможно
      побитый в бою) — копия получает ТОЧНО ТУ ЖЕ instance_data, включая
      текущие HP/состояния, а не свежий лист с полным здоровьем;
    - источник — обычный токен 1:1 с персонажем (living-связь, sheet_data
      не снят) — копия становится независимым саммоном со снимком листа
      персонажа на момент копирования, тем же принципом, что as_instance=True
      в token_add и place_template для kind='npc';
    - у источника нет character_id (пропс/картинка) — копия тоже без листа.
    """
    room_id = data.get('room_id')
    source_token_id = data.get('source_token_id')
    client_nonce = data.get('client_nonce')

    if not room_id or not _is_member(room_id, current_user.id):
        emit('error', {'message': 'Вы не участник этой комнаты'})
        return

    source = Token.query.get(source_token_id)
    if not source or source.template or source.battle_map.room_id != room_id:
        emit('error', {'message': 'Токен не найден в этой комнате'})
        return

    if not _can_move_token(source, room_id, current_user.id):
        emit('error', {'message': 'Недостаточно прав скопировать этот токен'})
        return

    if source.instance_data is not None:
        instance_data = dict(source.instance_data)
    elif source.character_id is not None:
        instance_data = dict(source.character.sheet_data)
    else:
        instance_data = None

    battle_map = source.battle_map
    pos_x = data.get('pos_x', source.pos_x)
    pos_y = data.get('pos_y', source.pos_y)
    if not isinstance(pos_x, (int, float)) or not isinstance(pos_y, (int, float)):
        pos_x, pos_y = source.pos_x, source.pos_y

    token = Token(
        battle_map_id=source.battle_map_id,
        character_id=source.character_id,
        instance_data=instance_data,
        created_by_user_id=current_user.id,
        label=source.label,
        image_url=source.image_url,
        pos_x=max(0, min(float(pos_x), battle_map.width)),
        pos_y=max(0, min(float(pos_y), battle_map.height)),
        width=source.width,
        height=source.height,
        rotation=source.rotation,
        layer=source.layer,
        locked=False,  # копия никогда не наследует закреп оригинала
        visible_to_players=source.visible_to_players,
    )
    db.session.add(token)
    db.session.commit()

    payload = _serialize_placed_token(token)
    if client_nonce is not None:
        payload['client_nonce'] = client_nonce
    emit('token_added', payload, room=str(room_id))


def _serialize_fog_shape(shape):
    return {
        'id': shape.id,
        'battle_map_id': shape.battle_map_id,
        'shape_type': shape.shape_type,
        'pos_x': shape.pos_x,
        'pos_y': shape.pos_y,
        'width': shape.width,
        'height': shape.height,
        'rotation': shape.rotation,
    }


@socketio.on('fog_shape_add')
def handle_fog_shape_add(data):
    """Создание новой фигуры тумана войны — только GM. Геометрия фигуры не
    секрет (скрыто то, что под ней, а не сама форма), поэтому рассылается
    всей комнате как есть, без разной сериализации для GM/игрока — в
    отличие от Token.visible_to_players разное отображение (полупрозрачно
    у GM / сплошной чёрный у игрока) чисто клиентское."""
    room_id = data.get('room_id')
    battle_map_id = data.get('battle_map_id')
    shape_type = data.get('shape_type')

    if not room_id or not is_gm(room_id, current_user.id):
        emit('error', {'message': 'Только GM может рисовать туман войны'})
        return
    if shape_type not in ('rect', 'circle', 'triangle'):
        emit('error', {'message': "shape_type должен быть 'rect', 'circle' или 'triangle'"})
        return

    battle_map = BattleMap.query.get(battle_map_id)
    if not battle_map or battle_map.room_id != room_id:
        emit('error', {'message': 'Карта не найдена или не принадлежит этой комнате'})
        return

    pos_x, pos_y = data.get('pos_x'), data.get('pos_y')
    width, height = data.get('width'), data.get('height')
    if not all(isinstance(v, (int, float)) for v in (pos_x, pos_y, width, height)):
        emit('error', {'message': 'Некорректная геометрия фигуры тумана'})
        return
    if width < 10 or height < 10:
        emit('error', {'message': 'Фигура тумана слишком мала'})
        return

    shape = FogShape(
        battle_map_id=battle_map_id,
        shape_type=shape_type,
        pos_x=float(pos_x),
        pos_y=float(pos_y),
        width=float(width),
        height=float(height),
        rotation=data.get('rotation', 0) or 0,
    )
    db.session.add(shape)
    db.session.commit()

    emit('fog_shape_added', _serialize_fog_shape(shape), room=str(room_id))


@socketio.on('fog_shape_transform_live')
def handle_fog_shape_transform_live(data):
    """Высокочастотное событие во время драга/ресайза фигуры тумана — не
    пишет в БД, только ретранслирует остальным участникам комнаты. Тот же
    принцип, что и token_transform_live."""
    room_id = data.get('room_id')
    shape_id = data.get('shape_id')

    if not room_id or not is_gm(room_id, current_user.id):
        return

    shape = FogShape.query.get(shape_id)
    if not shape or shape.battle_map.room_id != room_id:
        return

    # шлём только реально переданные поля — сейчас live-событие всегда
    # только про перетаскивание (pos_x/pos_y), без ресайза, но включать
    # width/height/rotation как None "на всякий случай" затирало бы их на
    # клиенте null'ом при мёрдже в стор и схлопывало фигуру в нулевой размер
    payload = {'shape_id': shape_id}
    for field_name in ('pos_x', 'pos_y', 'width', 'height', 'rotation'):
        if field_name in data:
            payload[field_name] = data[field_name]

    emit('fog_shape_moved_live', payload, room=str(room_id), include_self=False)


@socketio.on('fog_shape_transform_commit')
def handle_fog_shape_transform_commit(data):
    """Одна запись в БД на весь драг/ресайз фигуры тумана — вызывается на
    отпускание, зеркалит token_transform_commit."""
    room_id = data.get('room_id')
    shape_id = data.get('shape_id')

    if not room_id or not is_gm(room_id, current_user.id):
        emit('error', {'message': 'Только GM может редактировать туман войны'})
        return

    shape = FogShape.query.get(shape_id)
    if not shape or shape.battle_map.room_id != room_id:
        emit('error', {'message': 'Фигура тумана не найдена в этой комнате'})
        return

    pos_x, pos_y = data.get('pos_x'), data.get('pos_y')
    width, height = data.get('width'), data.get('height')
    rotation = data.get('rotation')
    if not all(isinstance(v, (int, float)) for v in (pos_x, pos_y, width, height)):
        emit('error', {'message': 'Некорректная геометрия фигуры тумана'})
        return
    if width < 10 or height < 10:
        emit('error', {'message': 'Фигура тумана слишком мала'})
        return

    shape.pos_x, shape.pos_y = float(pos_x), float(pos_y)
    shape.width, shape.height = float(width), float(height)
    if rotation is not None:
        if not isinstance(rotation, (int, float)):
            emit('error', {'message': 'Некорректный угол поворота'})
            return
        shape.rotation = float(rotation) % 360

    db.session.commit()

    emit('fog_shape_moved_committed', _serialize_fog_shape(shape), room=str(room_id))


@socketio.on('fog_shape_remove')
def handle_fog_shape_remove(data):
    """Удаление одной фигуры тумана — только GM."""
    room_id = data.get('room_id')
    shape_id = data.get('shape_id')

    if not room_id or not is_gm(room_id, current_user.id):
        emit('error', {'message': 'Только GM может удалять туман войны'})
        return

    shape = FogShape.query.get(shape_id)
    if not shape or shape.battle_map.room_id != room_id:
        emit('error', {'message': 'Фигура тумана не найдена в этой комнате'})
        return

    db.session.delete(shape)
    db.session.commit()

    emit('fog_shape_removed', {'shape_id': shape_id}, room=str(room_id))


@socketio.on('fog_clear_all')
def handle_fog_clear_all(data):
    """Полная очистка тумана войны для карты одной кнопкой — только GM."""
    room_id = data.get('room_id')
    battle_map_id = data.get('battle_map_id')

    if not room_id or not is_gm(room_id, current_user.id):
        emit('error', {'message': 'Только GM может очищать туман войны'})
        return

    battle_map = BattleMap.query.get(battle_map_id)
    if not battle_map or battle_map.room_id != room_id:
        emit('error', {'message': 'Карта не найдена или не принадлежит этой комнате'})
        return

    FogShape.query.filter_by(battle_map_id=battle_map_id).delete()
    db.session.commit()

    emit('fog_cleared', {'battle_map_id': battle_map_id}, room=str(room_id))


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
                'character_name': character.name,
                'formula': result.formula, 'result': result.total, 'breakdown': result.breakdown,
                'label': action.get('name'),
                'created_at': dice_roll.created_at.isoformat(),
            }, room=str(room_id))

            dispatch_roll_webhooks(character_id, action.get('name'), result.formula, result.breakdown, result.total)

    emit('spell_cast_effect', payload, room=str(room_id))


@socketio.on('spell_target_preview')
def handle_spell_target_preview(data):
    """Живое превью прицеливания — тот же принцип, что и token_transform_live:
    никогда не пишет в БД, просто ретранслирует остальным участникам, чтобы
    все видели, куда наводится заклинание, ДО подтверждения каста.
    Намеренно тихо игнорирует некорректные вызовы без emit('error', ...) —
    это высокочастотное событие на каждое движение мыши."""
    room_id = data.get('room_id')
    if not room_id or not _is_member(room_id, current_user.id):
        return

    emit('spell_target_preview', {
        'user': current_user.username,
        'character_id': data.get('character_id'),
        'action_name': data.get('action_name'),
        'target_x': data.get('target_x'),
        'target_y': data.get('target_y'),
        'aoe': data.get('aoe'),
    }, room=str(room_id), include_self=False)


@socketio.on('spell_target_clear')
def handle_spell_target_clear(data):
    """Отмена прицеливания (Escape) — убрать превью у остальных, чтобы не
    висело на экране бесконечно после того, как каст отменили."""
    room_id = data.get('room_id')
    if not room_id or not _is_member(room_id, current_user.id):
        return

    emit('spell_target_clear', {
        'character_id': data.get('character_id'),
    }, room=str(room_id), include_self=False)


@socketio.on('pointer_move')
def handle_pointer_move(data):
    """Живой курсор-указатель — тот же принцип, что и spell_target_preview:
    никогда не пишет в БД, просто ретранслирует остальным участникам, пока
    зажата кнопка мыши в режиме "указатель". Доступно любому участнику
    комнаты, без проверки владения токеном/персонажем. Намеренно тихо
    игнорирует некорректные вызовы без emit('error', ...) — высокочастотное
    событие на каждое движение мыши."""
    room_id = data.get('room_id')
    if not room_id or not _is_member(room_id, current_user.id):
        return

    emit('pointer_moved', {
        'user_id': current_user.id,
        'username': current_user.username,
        'x': data.get('x'),
        'y': data.get('y'),
    }, room=str(room_id), include_self=False)


@socketio.on('pointer_clear')
def handle_pointer_clear(data):
    """Отпустили кнопку мыши в режиме "указатель" — убрать точку у остальных."""
    room_id = data.get('room_id')
    if not room_id or not _is_member(room_id, current_user.id):
        return

    emit('pointer_cleared', {'user_id': current_user.id}, room=str(room_id), include_self=False)


@socketio.on('character_update_state')
def handle_character_update_state(data):
    """Правка боевого состояния персонажа НАПРЯМУЮ, без токена на карте —
    для roleplay-режима, где боя (и токенов) может вообще не быть.
    Аналог token_update_state, только бьёт в Character.sheet_data."""
    ALLOWED_VITALITY_KEYS = {'hp_current', 'hp_temp'}

    room_id = data.get('room_id')
    character_id = data.get('character_id')
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

    character = Character.query.get(character_id)
    if not character:
        emit('error', {'message': 'Персонаж не найден'})
        return

    if not (is_character_owner(character_id, current_user.id) or is_gm(room_id, current_user.id)):
        emit('error', {'message': 'Недостаточно прав менять состояние этого персонажа'})
        return

    new_data = dict(character.sheet_data)
    new_data['vitality'] = {**new_data.get('vitality', {}), **patch}
    character.sheet_data = new_data
    db.session.commit()

    emit('character_state_changed', {
        'character_id': character.id,
        'vitality_patch': patch,
    }, room=str(room_id))