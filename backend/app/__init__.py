import os
from pathlib import Path
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from .config import config_by_name
from .extensions import db, login_manager, socketio

# Собранный React-фронтенд (frontend/dist после `npm run build`) — отдаём
# его тем же Flask-процессом, чтобы наружу (через туннель/nginx) торчал
# только один origin и не пришлось разбираться с CORS и cross-site cookie
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / 'frontend' / 'dist'


def create_app(config_name: str = None) -> Flask:
    # static_folder=None отключает автоматический роут Flask на /static/...,
    # раздачей фронтенда занимается кастомный catch-all роут ниже
    app = Flask(__name__, static_folder=None)

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

    # API-бэкенд: любая стандартная HTTP-ошибка (в первую очередь 404 от
    # get_or_404()) должна возвращать JSON, а не дефолтную HTML-страницу
    # Werkzeug — иначе фронтенд получит текст вместо ожидаемого {"error": ...}
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(413)
    def payload_too_large(e):
        return jsonify({"error": "File too large"}), 413

    @app.route('/uploads/<path:filepath>')
    def uploaded_file(filepath):
        # send_from_directory сам защищает от path traversal (".."),
        # отклоняя такие пути ещё до похода на диск
        return send_from_directory(app.config['UPLOAD_DIR'], filepath)

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

    # SPA-фронтенд на React Router (BrowserRouter): любой путь, который не
    # является реальным файлом в dist (например /room/5 при обновлении
    # страницы), должен отдавать index.html, а React Router уже сам
    # разберётся с маршрутом на клиенте. Литеральные префиксы /api/v1/... и
    # /uploads/... выше по приоритету у Werkzeug и никогда сюда не попадут.
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        target = FRONTEND_DIST / path
        if path and target.is_file():
            return send_from_directory(FRONTEND_DIST, path)
        if not (FRONTEND_DIST / 'index.html').is_file():
            return jsonify({
                "error": "Frontend build not found. Run `npm run build` in frontend/ first."
            }), 501
        return send_from_directory(FRONTEND_DIST, 'index.html')

    return app