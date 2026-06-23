"""
DevDocs — Developer Documentation Builder
Main entry point. Starts the Bottle server and opens a pywebview window.
"""
import sys
import os
import threading
import webview
from src.server import create_app

def get_data_dir():
    """
    Returns the path where DevDocs stores its SQLite database.
    - Packaged (PyInstaller): next to the .exe (portable) or in user AppData
    - Development: ./data/ folder next to this file
    """
    if getattr(sys, 'frozen', False):
        # Running as PyInstaller bundle
        exe_dir = os.path.dirname(sys.executable)
        data_dir = os.path.join(exe_dir, 'data')
    else:
        # Running in development
        data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
    os.makedirs(data_dir, exist_ok=True)
    return data_dir


def start_server(app, port):
    """Runs the Bottle server in a background thread."""
    import bottle
    bottle.run(app, host='127.0.0.1', port=port, quiet=True)


def main():
    data_dir = get_data_dir()
    app, port = create_app(data_dir)

    # Start server in background thread (daemon=True so it dies with main thread)
    t = threading.Thread(target=start_server, args=(app, port), daemon=True)
    t.start()

    # Wait briefly for server to be ready
    import time, urllib.request, urllib.error
    for _ in range(40):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{port}/api/ping', timeout=1)
            break
        except (urllib.error.URLError, OSError):
            time.sleep(0.25)

    # Open the desktop window
    webview.create_window(
        title='DevDocs',
        url=f'http://127.0.0.1:{port}',
        width=1280,
        height=820,
        min_size=(900, 600),
        background_color='#1e2227',
    )
    webview.start(debug=('--debug' in sys.argv), gui='edgechromium')


if __name__ == '__main__':
    main()
