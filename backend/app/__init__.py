import os
from flask import Flask
from .config import config_by_name
from .extensions import db, socketio, login_manager

def create_app(config_name: str = None) -> Flask:
    """
    Фабрика Flask-приложения.
    Создает экземпляр приложения, загружает конфиг, инициализирует 
    расширения и регистрирует маршруты/сокеты.
    """
    app = Flask(__name__)

    # 1. Загрузка конфигурации
    # Если имя не передано явно, берем из переменной окружения FLASK_ENV
    if config_name is None:
        config_name = os.getenv('FLASK_ENV', 'development')
    
    app.config.from_object(config_by_name[config_name])

    # 2. Инициализация расширений
    db.init_app(app)
    login_manager.init_app(app)
    
    # Для SocketIO важно пробросить CORS, иначе фронтенд не сможет подключиться
    socketio.init_app(
        app, 
        cors_allowed_origins=app.config['CORS_ORIGINS'],
        # async_mode='threading' отлично для разработки. 
        # В проде лучше перейти на 'gevent' или 'eventlet'
        async_mode='threading' 
    )

    # 3. Настройка Flask-Login
    login_manager.login_view = 'auth.login'  # Куда редиректить, если юзер не залогинен
    login_manager.login_message = 'Пожалуйста, войдите в систему.'
    login_manager.login_message_category = 'info'

    @login_manager.user_loader
    def load_user(user_id: str):
        # Импортируем модель внутри функции, чтобы избежать циклического импорта
        from .models import User
        return User.query.get(int(user_id))

    # 4. Регистрация REST Blueprints
    from .auth.routes import auth_bp
    from .rooms.routes import rooms_bp
    from .characters.routes import characters_bp
    
    # Префиксы /api/... чтобы отделить API от будущих статических файлов
    app.register_blueprint(auth_bp, url_prefix='/api/v1/auth')
    app.register_blueprint(rooms_bp, url_prefix='/api/v1/rooms')
    app.register_blueprint(characters_bp, url_prefix='/api/v1/characters')

    # 5. Регистрация SocketIO событий
    # Сам факт импорта этого модуля выполнит декораторы @socketio.on(...)
    from .sockets import events 

    # 6. Инициализация БД (для удобства локальной разработки)
    # Создаст таблицы, если их нет. В проде мы будем использовать Flask-Migrate.
    with app.app_context():
        # Импортируем модели, чтобы SQLAlchemy "увидел" их перед create_all()
        from . import models 
        db.create_all()

    return app