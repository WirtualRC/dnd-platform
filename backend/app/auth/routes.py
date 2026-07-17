from flask import Blueprint, request, jsonify, current_app
from flask_login import login_user, logout_user, login_required, current_user

from ..extensions import db
from ..models import User

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    username = (data.get('username') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''

    if not username or not email or not password:
        return jsonify({"error": "username, email и password обязательны"}), 400
    if len(password) < 6:
        return jsonify({"error": "Пароль должен быть не короче 6 символов"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Это имя пользователя уже занято"}), 409
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Этот email уже зарегистрирован"}), 409

    user = User(username=username, email=email)
    user.set_password(password)
    db.session.add(user)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating user: {e}")
        return jsonify({"error": "Failed to create user"}), 500

    login_user(user)
    return jsonify({"id": user.id, "username": user.username, "email": user.email}), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({"error": "username и password обязательны"}), 400

    user = User.query.filter_by(username=data['username'].strip()).first()
    if not user or not user.check_password(data['password']):
        return jsonify({"error": "Неверный логин или пароль"}), 401

    login_user(user)
    return jsonify({"id": user.id, "username": user.username, "email": user.email}), 200


@auth_bp.route('/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({"message": "Вы вышли из системы"}), 200


@auth_bp.route('/me', methods=['GET'])
@login_required
def me():
    return jsonify({"id": current_user.id, "username": current_user.username, "email": current_user.email}), 200