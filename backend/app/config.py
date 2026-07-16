import os
from pathlib import Path

# Базовая директория бэкенда (backend/)
BASE_DIR = Path(__file__).resolve().parent.parent

class Config:
    """Базовая конфигурация (общая для всех окружений)."""
    
    # Секретный ключ для подписи сессий и CSRF. 
    # В проде ОБЯЗАТЕЛЬНО переопределять через переменные окружения!
    SECRET_KEY = os.environ.get('SECRET_KEY', 'super-secret-dev-key-change-me')
    
    # SQLAlchemy
    SQLALCHEMY_TRACK_MODIFICATIONS = False  # Отключаем, чтобы не жрать память
    
    # Загрузка файлов (карты, аватарки, токены)
    UPLOAD_DIR = BASE_DIR / 'uploads'
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # Макс размер файла 16 MB
    
    # CORS (откуда фронтенд может стучаться на бэкенд)
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://localhost:5173').split(',')
    
    # Настройки сессионных куки
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_HTTPONLY = True  # Защита от XSS (куки недоступны из JS)


class DevConfig(Config):
    """Конфигурация для локальной разработки."""
    DEBUG = True
    
    # Для локалки используем SQLite. 
    # Если ты сразу планируешь Postgres в Docker, можно заменить на:
    # 'postgresql://postgres:postgres@db:5432/dnd_dev'
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'DATABASE_URL', 
        f'sqlite:///{BASE_DIR / "dnd_dev.db"}'
    )
    
    # В дев-режиме разрешаем подключения с локальных адресов Vite
    CORS_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']


class ProdConfig(Config):
    """Конфигурация для продакшена."""
    DEBUG = False
    
    # В проде эти переменные должны быть строго заданы в .env или docker-compose
    SECRET_KEY = os.environ.get('SECRET_KEY')
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    
    # Строгие настройки для куки (работает только по HTTPS)
    SESSION_COOKIE_SECURE = True 
    
    # В проде CORS берем только из переменной окружения
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '').split(',')


# Словарь для удобного маппинга в app factory
config_by_name = {
    'development': DevConfig,
    'production': ProdConfig,
    'default': DevConfig
}