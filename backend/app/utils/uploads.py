"""
Общая логика загрузки картинок — используется и для комнаты (токены,
фоны боевой карты), и для листа персонажа (аватар, иконки действий).
Разница между вызывающими только в том, в какую подпапку uploads/
класть файл, поэтому вынесено сюда, а не продублировано в каждом routes.py.
"""
import uuid
from pathlib import Path

from flask import current_app
from werkzeug.utils import secure_filename
from PIL import Image, UnidentifiedImageError

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ALLOWED_MIMETYPES = {'image/png', 'image/jpeg', 'image/gif', 'image/webp'}


class InvalidImageUpload(ValueError):
    """Файл не прошёл проверку расширения/mime-типа/содержимого."""


def _allowed_extension(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def save_uploaded_image(file, subdir: str) -> str:
    """Валидирует загруженный файл и сохраняет его в UPLOAD_DIR/<subdir>/,
    возвращает публичный URL под /uploads/. Бросает InvalidImageUpload,
    если файл не выбран, не той MIME-категории или расширения, либо
    (content-type и расширение можно подделать) реально не открывается
    как изображение."""
    if file.filename == '':
        raise InvalidImageUpload("No file selected")

    if file.mimetype not in ALLOWED_MIMETYPES or not _allowed_extension(file.filename):
        raise InvalidImageUpload("File type not allowed")

    try:
        img = Image.open(file)
        img.verify()
        file.seek(0)  # verify() выжигает файловый объект, сбрасываем указатель
    except (UnidentifiedImageError, OSError):
        raise InvalidImageUpload("Invalid image file")

    # secure_filename режет путь/расширение до безопасного, но само по себе
    # не даёт непредсказуемости — оригинальное имя всё ещё узнаваемо и
    # потенциально угадываемо, поэтому префиксуем uuid4
    safe_original = secure_filename(file.filename)
    unique_filename = f"{uuid.uuid4().hex}_{safe_original}"

    upload_dir = Path(current_app.config['UPLOAD_DIR']) / subdir
    upload_dir.mkdir(parents=True, exist_ok=True)
    file.save(upload_dir / unique_filename)

    return f"/uploads/{subdir}/{unique_filename}"
