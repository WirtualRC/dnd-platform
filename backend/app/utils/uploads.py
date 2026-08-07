"""
Общая логика загрузки картинок — используется и для комнаты (токены,
фоны боевой карты), и для листа персонажа (аватар, иконки действий).
Разница между вызывающими только в том, в какую подпапку uploads/
класть файл, поэтому вынесено сюда, а не продублировано в каждом routes.py.
"""
import uuid
from pathlib import Path

from flask import current_app
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

    # Оригинальное имя нигде дальше не используется (никогда не показывается
    # пользователю — только сегмент URL), поэтому от него берём только уже
    # провалидированное расширение, а не пропускаем всё имя через
    # werkzeug.secure_filename: у него filename.encode("ascii", "ignore")
    # молча вырезает любые не-ASCII символы (например кириллицу) целиком,
    # а последующий .strip("._") срезает то, что осталось от точки перед
    # расширением — из "Скриншот.webp" получался буквально "webp" без точки.
    # Без точки Flask не может определить Content-Type по расширению при
    # отдаче файла (см. uploaded_file в app/__init__.py), картинка отдаётся
    # как application/octet-stream, и, например, Discord отказывается
    # показывать такой URL как превью в эмбеде.
    ext = file.filename.rsplit('.', 1)[1].lower()
    unique_filename = f"{uuid.uuid4().hex}.{ext}"

    upload_dir = Path(current_app.config['UPLOAD_DIR']) / subdir
    upload_dir.mkdir(parents=True, exist_ok=True)
    file.save(upload_dir / unique_filename)

    return f"/uploads/{subdir}/{unique_filename}"
