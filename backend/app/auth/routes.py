from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user

from ..extensions import db
from ..models import User

# Создаем блюпринт. В app/__init__.py мы зарегистрируем его с префиксом /api/auth
auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['POST'])
def register():
    """Регистрация нового пользователя."""
    data: dict = request.get_json()
    if not data:
        return jsonify({"error": "No input data provided"}), 400

    username = data.get('username', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    # Базовая валидация
    if not username or not email or not password:
        return jsonify({"error": "Username, email and password are required"}), 400
    
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters long"}), 400

    # Проверяем уникальность
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists"}), 409
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 409

    # Создаем пользователя
    new_user = User(username=username, email=email)
    new_user.set_password(password)

    try:
        db.session.add(new_user)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        # В проде тут нужно логировать ошибку (logging.error), а юзеру отдавать 500
        return jsonify({"error": "An error occurred during registration"}), 500

    return jsonify({
        "message": "User registered successfully",
        "user": {"id": new_user.id, "username": new_user.username}
    }), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    """Авторизация пользователя. Принимает либо username, либо email."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No input data provided"}), 400

    login_input = data.get('login', '').strip()
    password = data.get('password', '')

    if not login_input or not password:
        return jsonify({"error": "Login and password are required"}), 400

    # Ищем юзера по username ИЛИ по email
    user = User.query.filter(
        (User.username == login_input) | (User.email == login_input.lower())
    ).first()

    # Важно: не говорим юзеру, что именно неверно (юзер не найден или пароль неверный),
    # чтобы не помогать брутфорсерам собирать базы email'ов.
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid login or password"}), 401

    # Логиним юзера (Flask-Login создаст сессионную куку)
    login_user(user)

    return jsonify({
        "message": "Logged in successfully",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email
        }
    }), 200


@auth_bp.route('/logout', methods=['POST'])
@login_required
def logout():
    """Выход из системы."""
    logout_user()
    return jsonify({"message": "Logged out successfully"}), 200


@auth_bp.route('/me', methods=['GET'])
@login_required
def me():
    """Получение данных текущего залогиненного пользователя.
    Нужен фронту, чтобы при перезагрузке страницы понять, кто мы."""
    return jsonify({
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email
    }), 200