import os
from app import create_app
from app.extensions import socketio

app = create_app()

if __name__ == '__main__':
    host = os.environ.get('FLASK_HOST', '127.0.0.1')
    port = int(os.environ.get('FLASK_PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    socketio.run(app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)