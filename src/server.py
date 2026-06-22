"""
src/server.py
Creates and configures the Bottle WSGI application:
- Static file serving (public/)
- API routes (projects, repositories, documents, export)
- SPA fallback (all non-API routes return index.html)
"""
import os
import socket
import json
from bottle import Bottle, static_file, response

from src.models.database import init_db
from src.routes import projects, repositories, documents, export


def find_free_port(preferred=19284):
    """Tries the preferred port first, falls back to a random free port."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(('127.0.0.1', preferred))
        s.close()
        return preferred
    except OSError:
        s.close()
        s2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s2.bind(('127.0.0.1', 0))
        port = s2.getsockname()[1]
        s2.close()
        return port


def get_public_dir():
    """Locates the public/ folder whether running from source or PyInstaller bundle."""
    import sys
    if getattr(sys, 'frozen', False):
        # PyInstaller stores bundled data in sys._MEIPASS
        base = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    else:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, 'public')


def create_app(data_dir: str):
    """Builds the Bottle app, wires routes, returns (app, port)."""
    init_db(data_dir)

    app = Bottle()
    public_dir = get_public_dir()

    # ── JSON auto-serialization for dict/list responses ──────────────────────
    @app.hook('after_request')
    def enable_json():
        pass  # Bottle auto-serializes dict returns to JSON by default

    # ── Health check ───────────────────────────────────────────────────────────
    @app.get('/api/ping')
    def ping():
        return {'success': True, 'message': 'pong'}

    # ── Register feature routes ────────────────────────────────────────────────
    projects.register(app)
    repositories.register(app)
    documents.register(app)
    export.register(app)

    # ── Static assets ──────────────────────────────────────────────────────────
    @app.get('/css/<filename:path>')
    def css(filename):
        return static_file(filename, root=os.path.join(public_dir, 'css'))

    @app.get('/js/<filename:path>')
    def js(filename):
        return static_file(filename, root=os.path.join(public_dir, 'js'))

    # ── SPA fallback — serve index.html for everything else ───────────────────
    @app.get('/')
    def index():
        return static_file('index.html', root=public_dir)

    @app.get('/<path:path>')
    def catch_all(path):
        # If it looks like a real static file request, try serving it directly
        candidate = os.path.join(public_dir, path)
        if os.path.isfile(candidate):
            return static_file(path, root=public_dir)
        # Otherwise treat as SPA route — serve index.html
        return static_file('index.html', root=public_dir)

    port = find_free_port()
    return app, port
