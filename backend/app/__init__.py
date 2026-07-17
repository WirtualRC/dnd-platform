import os
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from .config import config_by_name
from .extensions import db, login_manager, socketio


def create_app(config_name: str = None) -> Flask:
    app = Flask(__name__, static_folder='static')

    if config_name is None:
        config_name = os.getenv('FLASK_ENV', 'development')
    app.config.from_object(config_by_name[config_name])

    db.init_app(app)
    login_manager.init_app(app)
    CORS(app, supports_credentials=True, origins=app.config['CORS_ORIGINS'])
    socketio.init_app(app, cors_allowed_origins=app.config['CORS_ORIGINS'], async_mode='threading')

    # API-бэкенд без серверных html-страниц: неавторизованный запрос должен
    # получать чистый JSON 401, а не редирект на несуществующий /login
    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({"error": "Authentication required"}), 401

    @login_manager.user_loader
    def load_user(user_id: str):
        from .models import User
        return User.query.get(int(user_id))

    from .auth.routes import auth_bp
    from .characters.routes import characters_bp
    from .rooms.routes import rooms_bp
    app.register_blueprint(auth_bp, url_prefix='/api/v1/auth')
    app.register_blueprint(characters_bp, url_prefix='/api/v1/characters')
    app.register_blueprint(rooms_bp, url_prefix='/api/v1/rooms')

    # сам факт импорта регистрирует @socketio.on(...) хендлеры
    from .sockets import events

    @app.route('/')
    def index():
        return send_from_directory(app.static_folder, 'index.html')

    with app.app_context():
        from . import models
        db.create_all()

    return app