# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller build specification for DevDocs.
Builds a single-folder distribution containing the .exe and all dependencies.
Used by both build_installer.py (wraps in NSIS/Inno installer) and
build_portable.py (zips the folder directly).
"""
import sys
import os

block_cipher = None

# Collect all data files that must ship alongside the executable
datas = [
    ('public', 'public'),                      # HTML/CSS/JS frontend
    ('static/site_template', 'static/site_template'),  # static site export templates
]

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'bottle',
        'webview',
        'webview.platforms.winforms',  # Windows
        'webview.platforms.cocoa',     # macOS
        'webview.platforms.gtk',       # Linux
        'sqlite3',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['matplotlib', 'numpy', 'pandas', 'PIL', 'tkinter'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

def _icon_path():
    """Returns the icon path for this platform if it exists, else None."""
    if sys.platform == 'win32':
        p = 'icons/icon.ico'
    elif sys.platform == 'darwin':
        p = 'icons/icon.icns'
    else:
        return None
    return p if os.path.isfile(p) else None


exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='DevDocs',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,            # no console window — GUI app
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=_icon_path(),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='DevDocs',
)
