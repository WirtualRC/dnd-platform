import os
from app import create_app
from app.extensions import socketio

# Создаем экземпляр приложения
app = create_app()

if __name__ == '__main__':
    # Читаем настройки из переменных окружения (или используем дефолты)
    host = os.environ.get('FLASK_HOST')
    port = int(os.environ.get('FLASK_PORT', 5000))
    
    # В режиме debug Flask автоматически перезагружает сервер при изменении кода
    debug = os.environ.get('FLASK_DEBUG', 'True').lower() in ('true', '1', 't')
    
    # Запускаем сервер через socketio, а не через app.run()!
    socketio.run(
        app, 
        host=host, 
        port=port, 
        debug=debug,
        # allow_unsafe_werkzeug=True необходим для новых версий Werkzeug (Flask >= 2.2),
        # если мы запускаем SocketIO в режиме debug. Без этого флага сервер упадет с ошибкой.
        allow_unsafe_werkzeug=True 
    )