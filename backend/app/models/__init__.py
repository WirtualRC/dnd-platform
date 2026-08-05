"""
Модели SQLAlchemy.

Все модели лежат в одном файле — для проекта такого размера отдельные
модули (user.py, room.py, character.py...) только усложнили бы навигацию.
Если проект вырастет, можно будет разнести по файлам, оставив здесь
только re-export.
"""
import enum
import secrets
from datetime import datetime, timezone

from flask_login import UserMixin
from sqlalchemy.ext.associationproxy import association_proxy
from werkzeug.security import generate_password_hash, check_password_hash

from ..extensions import db


def _utcnow():
    return datetime.now(timezone.utc)


def generate_invite_code(length: int = 6) -> str:
    """Короткий человекочитаемый код для входа в комнату, например 'A3F9K1'."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # без похожих символов (0/O, 1/I)
    return "".join(secrets.choice(alphabet) for _ in range(length))


class RoomRole(str, enum.Enum):
    GM = "gm"
    PLAYER = "player"


class RoomMode(str, enum.Enum):
    ROLEPLAY = "roleplay"
    COMBAT = "combat"


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(32), unique=True, nullable=False, index=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False)

    # комнаты, где пользователь — мастер
    rooms_as_gm = db.relationship("Room", back_populates="gm", lazy="dynamic")
    memberships = db.relationship(
        "RoomMembership", back_populates="user", cascade="all, delete-orphan"
    )
    characters = db.relationship(
        "Character", back_populates="owner", cascade="all, delete-orphan"
    )

    def set_password(self, raw_password: str) -> None:
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password_hash(self.password_hash, raw_password)

    def __repr__(self):
        return f"<User {self.username}>"


class Room(db.Model):
    __tablename__ = "rooms"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    invite_code = db.Column(
        db.String(8), unique=True, nullable=False, default=generate_invite_code, index=True
    )
    gm_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    mode = db.Column(
        db.Enum(RoomMode, name="room_mode"), default=RoomMode.ROLEPLAY, nullable=False
    )
    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False)

    gm = db.relationship("User", back_populates="rooms_as_gm")
    memberships = db.relationship(
        "RoomMembership", back_populates="room", cascade="all, delete-orphan"
    )
    characters = db.relationship(
        "CharacterRoomLink", back_populates="room", cascade="all, delete-orphan"
    )
    # удобный доступ room.character_list -> список Character
    character_list = association_proxy("characters", "character")
    dice_rolls = db.relationship(
        "DiceRoll",
        back_populates="room",
        cascade="all, delete-orphan",
        order_by="DiceRoll.created_at",
    )
    battle_maps = db.relationship(
        "BattleMap",
        back_populates="room",
        foreign_keys="BattleMap.room_id",
        cascade="all, delete-orphan",
        order_by="BattleMap.id",
    )
    # какая из battle_maps сейчас активна и показывается всей комнате при
    # входе в бой — GM переключает через сокет-событие battle_map_switch.
    # use_alter/post_update: между Room и BattleMap циклическая FK-связь
    # (BattleMap.room_id -> rooms.id, это поле -> battle_maps.id), без них
    # create_all() падает на Postgres с CircularDependencyError при попытке
    # топологически упорядочить создание таблиц
    active_battle_map_id = db.Column(
        db.Integer,
        db.ForeignKey(
            "battle_maps.id", ondelete="SET NULL", use_alter=True,
            name="fk_room_active_battle_map",
        ),
        nullable=True,
    )
    active_battle_map = db.relationship(
        "BattleMap", foreign_keys=[active_battle_map_id], post_update=True
    )

    def __repr__(self):
        return f"<Room {self.name} ({self.invite_code})>"


class RoomMembership(db.Model):
    """Связь пользователь-комната с ролью. Отдельная модель, а не simple
    many-to-many, потому что роль (gm/player) — это дополнительный атрибут
    связи, а не сущности."""

    __tablename__ = "room_memberships"
    __table_args__ = (db.UniqueConstraint("room_id", "user_id", name="uq_room_user"),)

    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey("rooms.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    role = db.Column(db.Enum(RoomRole, name="room_role"), nullable=False)

    # какого персонажа этот участник сейчас использует в этой конкретной
    # комнате — актуально, раз персонаж может состоять в нескольких
    # комнатах и/или у игрока их несколько в одной комнате (см. CharacterRoomLink).
    # ondelete="SET NULL": если персонажа удалят, membership не должен
    # ломаться внешним ключом в никуда — просто обнулится указатель.
    active_character_id = db.Column(
        db.Integer, db.ForeignKey("characters.id", ondelete="SET NULL"), nullable=True
    )
    joined_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False)

    room = db.relationship("Room", back_populates="memberships")
    user = db.relationship("User", back_populates="memberships")
    active_character = db.relationship("Character")

    def to_dict(self):
        """Единая сериализация участника — используется и в GET /rooms/<id>,
        и в сокет-рассылках (room_joined, active_character_changed), чтобы
        везде был один и тот же набор полей, а не версия попроще."""
        active_char = None
        if self.active_character_id and self.active_character:
            char = self.active_character
            vitality = char.sheet_data.get("vitality", {})
            active_char = {
                "id": char.id,
                "name": char.name,
                "avatar_url": char.avatar_url,
                "hp_current": vitality.get("hp_current"),
                "hp_max": vitality.get("hp_max"),
                "ac": vitality.get("ac"),
            }
        return {
            "user_id": self.user_id,
            "username": self.user.username,
            "role": self.role.value,
            "active_character": active_char,
        }

    def __repr__(self):
        return f"<Membership user={self.user_id} room={self.room_id} role={self.role.value}>"


class Character(db.Model):
    """Лист персонажа. Все игромеханические поля (характеристики, навыки,
    HP, слоты заклинаний и т.д.) хранятся в sheet_data — это развязывает
    бэкенд от конкретной структуры листа 5e и позволяет добавлять
    хоумрульные поля без миграций. Форма и валидация — на фронтенде."""

    __tablename__ = "characters"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    avatar_url = db.Column(db.String(500), nullable=True)
    sheet_data = db.Column(db.JSON, nullable=False, default=dict)
    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = db.Column(
        db.DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    owner = db.relationship("User", back_populates="characters")
    tokens = db.relationship("Token", back_populates="character")
    room_links = db.relationship(
        "CharacterRoomLink", back_populates="character", cascade="all, delete-orphan"
    )
    # удобный доступ character.rooms -> список Room без похода через room_links
    rooms = association_proxy("room_links", "room")

    def __repr__(self):
        return f"<Character {self.name}>"


class CharacterRoomLink(db.Model):
    """Многие-ко-многим между Character и Room: один персонаж может быть
    одновременно активен в нескольких играх (ваншоты, west-marches и т.п.),
    а не только в одной, как было бы при скалярном room_id на Character."""

    __tablename__ = "character_room_links"
    __table_args__ = (
        db.UniqueConstraint("character_id", "room_id", name="uq_character_room"),
    )

    id = db.Column(db.Integer, primary_key=True)
    character_id = db.Column(db.Integer, db.ForeignKey("characters.id"), nullable=False)
    room_id = db.Column(db.Integer, db.ForeignKey("rooms.id"), nullable=False)
    joined_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False)

    character = db.relationship("Character", back_populates="room_links")
    room = db.relationship("Room", back_populates="characters")

    def __repr__(self):
        return f"<CharacterRoomLink char={self.character_id} room={self.room_id}>"


class DiceRoll(db.Model):
    """Лог бросков в комнате — то, что все видят в реальном времени через
    сокет-событие dice_roll, и что остаётся в истории после обновления
    страницы."""

    __tablename__ = "dice_rolls"

    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey("rooms.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    # nullable: бросок может быть не привязан к конкретному персонажу
    # (например GM кидает за NPC, или у игрока ещё нет персонажа в комнате)
    # ondelete="SET NULL": удаление персонажа не должно стирать историю
    # бросков в комнате — лог остаётся, просто теряет привязку к персонажу.
    character_id = db.Column(
        db.Integer, db.ForeignKey("characters.id", ondelete="SET NULL"), nullable=True
    )
    formula = db.Column(db.String(50), nullable=False)  # например "2d6+3"
    result = db.Column(db.Integer, nullable=False)
    breakdown = db.Column(db.String(200), nullable=True)  # например "[4, 2] + 3"
    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False, index=True)

    room = db.relationship("Room", back_populates="dice_rolls")
    user = db.relationship("User")
    character = db.relationship("Character")

    def __repr__(self):
        return f"<DiceRoll {self.formula} = {self.result}>"


class BattleMap(db.Model):
    """Боевая карта. Комната может иметь несколько карт (GM готовит разные
    энкаунтеры заранее) — какая из них сейчас активна, хранится в
    Room.active_battle_map_id, а не здесь."""

    __tablename__ = "battle_maps"

    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer, db.ForeignKey("rooms.id"), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    grid_size = db.Column(db.Integer, default=50, nullable=False)  # px на клетку
    # виртуальный размер карты в px — заметно больше видимого вьюпорта
    # (900x600), чтобы было куда панорамировать; не буквально бесконечно,
    # но достаточно просторно для стола на несколько десятков токенов
    width = db.Column(db.Integer, default=4000, nullable=False)
    height = db.Column(db.Integer, default=4000, nullable=False)
    updated_at = db.Column(
        db.DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    room = db.relationship("Room", back_populates="battle_maps", foreign_keys=[room_id])
    tokens = db.relationship(
        "Token", back_populates="battle_map", cascade="all, delete-orphan"
    )
    fog_shapes = db.relationship(
        "FogShape", back_populates="battle_map", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<BattleMap room={self.room_id}>"


class Token(db.Model):
    """Любое изображение на боевой карте: токен персонажа, монстр без
    листа, фон карты или произвольный декоративный пропс (как в Owlbear).

    Отдельной сущности для фона нет специально — фон это тот же Token с
    layer=0, locked=True и character_id=None. Разница между "фоном" и
    "токеном" — это вопрос значения полей, а не структуры данных.

    Координаты и размер — во float-пикселях канвы, а не в клетках сетки.
    Это позволяет одинаково хранить и токены персонажей (обычно кратные
    grid_size), и фон/пропсы произвольного размера, не выровненные по
    сетке. Привязка к сетке (snapping) — чисто клиентская UX-фича при
    перетаскивании, на модели она никак не завязана.

    hp_current/hp_max — HP КОНКРЕТНОГО ЭКЗЕМПЛЯРА в этом бою, отдельно от
    character.sheet_data.vitality.hp_current. Это принципиально: один
    Character (лист "Гоблин") может стоять на карте несколькими Token
    одновременно — каждый со своим здоровьем. Если бы урон писался прямо
    в character.sheet_data, ранение одного гоблина мгновенно лечило/ранило
    бы всех остальных токенов с тем же character_id, потому что это одна
    и та же строка в БД. При создании токена hp_current/hp_max копируются
    из sheet_data персонажа как стартовое значение и дальше живут
    независимо. Для игровых персонажей sheet_data остаётся источником
    истины между сессиями — синхронизация обратно делается отдельным
    осознанным действием (например по кнопке "конец боя"), а не
    автоматически на каждый урон."""

    __tablename__ = "tokens"

    id = db.Column(db.Integer, primary_key=True)
    battle_map_id = db.Column(db.Integer, db.ForeignKey("battle_maps.id"), nullable=False)
    character_id = db.Column(
        db.Integer, db.ForeignKey("characters.id"), nullable=True
    )  # null для NPC/монстров/фона/пропсов
    # кто разместил токен — нужно именно для пропсов без character_id
    # (например, картинка, вставленная по Ctrl+V): владения персонажем тут
    # нет, но право двигать своё же должно остаться у того, кто его добавил
    created_by_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    label = db.Column(db.String(100), nullable=True)  # имя для NPC или подпись пропса
    image_url = db.Column(db.String(500), nullable=True)

    hp_current = db.Column(db.Integer, nullable=True)  # null для токенов без HP (пропсы, фон)
    hp_max = db.Column(db.Integer, nullable=True)

    pos_x = db.Column(db.Float, default=0, nullable=False)  # px на канве
    pos_y = db.Column(db.Float, default=0, nullable=False)
    width = db.Column(db.Float, default=50, nullable=False)  # px
    height = db.Column(db.Float, default=50, nullable=False)
    rotation = db.Column(db.Float, default=0, nullable=False)  # градусы, 0-360

    layer = db.Column(db.Integer, default=10, nullable=False)  # 0 = фон, 10 = обычный токен
    locked = db.Column(db.Boolean, default=False, nullable=False)  # запрет двигать игрокам
    visible_to_players = db.Column(db.Boolean, default=True, nullable=False)

    # Представление ("шаблон токена") — ещё не размещённая на карте
    # заготовка со своей иконкой, которая живёт в плавающей панели и не
    # исчезает при перетаскивании (перетаскивание клонирует строку в новый
    # Token с template=False, оригинал остаётся). pos_x/pos_y/rotation у
    # представления бессмысленны и никогда не читаются — та же логика, что
    # уже применяется к character_id/instance_data: не каждое поле имеет
    # смысл для каждой строки, это нормально для этой модели.
    #
    # template_kind различает две вкладки панели, и это НЕ то же самое,
    # что character_id is not None — обе вкладки допускают привязку листа
    # (через чекбокс у создателя), но ведут себя по-разному при размещении:
    # 'pc'  — вкладка "Персонажи": character_id обязателен, при размещении
    #         ВСЕГДА живая связь 1:1 (instance_data не создаётся) — на этом
    #         будет держаться будущий "Отряд на карте".
    # 'npc' — вкладка "NPC/саммоны": character_id необязателен; если задан,
    #         при размещении ВСЕГДА создаётся снимок (instance_data) — то
    #         же правило, что и у обычного as_instance=True для саммонов.
    template = db.Column(db.Boolean, default=False, nullable=False)
    template_kind = db.Column(db.String(10), nullable=True)  # 'pc' | 'npc', только если template=True

    # Снимок sheet_data на момент спавна — только для клонированных
    # экземпляров (саммоны, повторно используемые монстры). None означает
    # "это обычный токен 1:1, живые данные читаются из character.sheet_data
    # напрямую". Если задано — это независимая копия, HP/состояния этого
    # конкретного токена правятся только здесь, шаблон-Character не трогается.
    instance_data = db.Column(db.JSON, nullable=True)

    battle_map = db.relationship("BattleMap", back_populates="tokens")
    character = db.relationship("Character", back_populates="tokens")

    def __repr__(self):
        return f"<Token {self.label or self.character_id} layer={self.layer} @ ({self.pos_x},{self.pos_y})>"


class FogShape(db.Model):
    """Фигура тумана войны на боевой карте — GM закрашивает области,
    скрытые от игроков ('paint-to-hide': карта по умолчанию открыта,
    фигуры добавляют СКРЫТЫЕ зоны, в отличие от Owlbear, где по умолчанию
    скрыто всё, а фигуры открывают).

    circle и triangle хранятся как bounding box (pos_x/pos_y/width/height),
    без отдельного радиуса или вершин — вписываются в рамку на клиенте,
    тем же принципом, что превью AoE считает форму из bounding box на лету.

    Геометрия фигуры не секрет (скрыто то, что ПОД ней, а не сама форма),
    поэтому в отличие от Token.visible_to_players здесь нет флага
    видимости и разной сериализации для GM/игрока — весь список
    рассылается всем поровну, а разное отображение (полупрозрачно у GM /
    сплошной чёрный у игрока) чисто клиентское."""

    __tablename__ = "fog_shapes"

    id = db.Column(db.Integer, primary_key=True)
    battle_map_id = db.Column(db.Integer, db.ForeignKey("battle_maps.id"), nullable=False)
    shape_type = db.Column(db.String(10), nullable=False)  # 'rect' | 'circle' | 'triangle'

    pos_x = db.Column(db.Float, nullable=False)  # верхний левый угол bounding box, px
    pos_y = db.Column(db.Float, nullable=False)
    width = db.Column(db.Float, nullable=False)
    height = db.Column(db.Float, nullable=False)
    rotation = db.Column(db.Float, default=0, nullable=False)

    created_at = db.Column(db.DateTime(timezone=True), default=_utcnow, nullable=False)

    battle_map = db.relationship("BattleMap", back_populates="fog_shapes")

    def __repr__(self):
        return f"<FogShape {self.shape_type} @ ({self.pos_x},{self.pos_y})>"