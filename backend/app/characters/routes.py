from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user

from ..extensions import db
from ..models import Character

characters_bp = Blueprint('characters', __name__)


@characters_bp.route('', methods=['GET'])
@login_required
def get_my_characters():
    """Получение списка всех моих персонажей (включая тех, что в комнатах)."""
    characters = Character.query.filter_by(owner_id=current_user.id).all()
    
    result = []
    for char in characters:
        result.append({
            "id": char.id,
            "name": char.name,
            "avatar_url": char.avatar_url,
            "sheet_data": char.sheet_data,
            "updated_at": char.updated_at.isoformat()
        })
    
    return jsonify({"characters": result}), 200


@characters_bp.route('', methods=['POST'])
@login_required
def create_character():
    """Создание нового персонажа в мою библиотеку (без привязки к комнате)."""
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({"error": "Character name is required"}), 400

    char_name = data['name'].strip()
    if len(char_name) > 100:
        return jsonify({"error": "Character name too long"}), 400

    new_char = Character(
        name=char_name,
        owner_id=current_user.id,
        avatar_url=data.get('avatar_url'),
        sheet_data=data.get('sheet_data', {})
    )
    db.session.add(new_char)

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error creating character: {e}")
        return jsonify({"error": "Failed to create character"}), 500

    return jsonify({
        "message": "Character created successfully",
        "character": {
            "id": new_char.id,
            "name": new_char.name,
            "sheet_data": new_char.sheet_data
        }
    }), 201


@characters_bp.route('/<int:char_id>', methods=['PUT'])
@login_required
def update_character(char_id):
    """Обновление данных моего персонажа."""
    character = Character.query.get_or_404(char_id)

    # Проверка, что это мой персонаж
    if character.owner_id != current_user.id:
        return jsonify({"error": "Permission denied"}), 403

    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    if 'name' in data:
        character.name = data['name'].strip()
    if 'avatar_url' in data:
        character.avatar_url = data['avatar_url']
    if 'sheet_data' in data:
        character.sheet_data = data['sheet_data']

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error updating character: {e}")
        return jsonify({"error": "Failed to update character"}), 500

    return jsonify({
        "message": "Character updated successfully",
        "character": {
            "id": character.id,
            "name": character.name,
            "sheet_data": character.sheet_data,
            "updated_at": character.updated_at.isoformat()
        }
    }), 200


@characters_bp.route('/<int:char_id>', methods=['DELETE'])
@login_required
def delete_character(char_id):
    """Полное удаление персонажа из моей библиотеки (навсегда)."""
    character = Character.query.get_or_404(char_id)

    if character.owner_id != current_user.id:
        return jsonify({"error": "Permission denied"}), 403

    try:
        db.session.delete(character)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error deleting character: {e}")
        return jsonify({"error": "Failed to delete character"}), 500

    return jsonify({"message": "Character deleted successfully"}), 200