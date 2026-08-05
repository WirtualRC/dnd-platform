import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# backend/ должен быть в sys.path, чтобы работал `from app...` ниже —
# alembic.ini лежит в backend/, но prepend_sys_path=. добавляет cwd на
# момент запуска команды, а не гарантированно backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import config_by_name  # noqa: E402
from app.extensions import db  # noqa: E402
from app import models  # noqa: E402,F401  — импорт нужен, чтобы модели зарегистрировались в db.metadata

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# URL берём из того же DATABASE_URL, что использует сам Flask-апп (см.
# app/config.py), а не из alembic.ini — так один .env остаётся единственным
# источником правды и не расходится с реальным подключением приложения.
db_url = config_by_name['default'].SQLALCHEMY_DATABASE_URI
if db_url:
    config.set_main_option('sqlalchemy.url', db_url)

# Все модели живут в одном файле app/models/__init__.py (см. CLAUDE.md) —
# их metadata и есть то, с чем autogenerate сравнивает базу
target_metadata = db.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
