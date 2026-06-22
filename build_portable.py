#!/usr/bin/env python3
"""
build_portable.py
Builds a portable, no-installer version of DevDocs.
Run after PyInstaller has produced dist/DevDocs/ (via `pyinstaller devdocs.spec`).

Usage:
    python build_portable.py

Output:
    dist/DevDocs-portable.zip — extract anywhere and run DevDocs.exe (or DevDocs on
    macOS/Linux). The 'data' folder created next to the executable holds the
    SQLite database, so the whole folder is fully self-contained and movable.
"""
import os
import shutil
import sys
import zipfile

DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist', 'DevDocs')
OUTPUT_ZIP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist', 'DevDocs-portable.zip')


def main():
    if not os.path.isdir(DIST_DIR):
        print(f"ERROR: {DIST_DIR} not found.")
        print("Run `pyinstaller devdocs.spec` first to build the app.")
        sys.exit(1)

    # Create an empty 'data' folder so the app has somewhere to put its database
    # on first launch, and so users see immediately where their data lives.
    data_dir = os.path.join(DIST_DIR, 'data')
    os.makedirs(data_dir, exist_ok=True)
    # Drop a small marker file explaining the folder (optional, harmless)
    with open(os.path.join(data_dir, 'README.txt'), 'w') as f:
        f.write(
            "This folder holds DevDocs' SQLite database (devdocs.db).\n"
            "To back up your data, copy this folder.\n"
            "To move DevDocs to another machine, copy the entire DevDocs folder\n"
            "(including this data folder) to the new machine.\n"
        )

    print(f"Zipping {DIST_DIR} -> {OUTPUT_ZIP}")
    if os.path.exists(OUTPUT_ZIP):
        os.remove(OUTPUT_ZIP)

    with zipfile.ZipFile(OUTPUT_ZIP, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(DIST_DIR):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.join('DevDocs', os.path.relpath(file_path, DIST_DIR))
                zf.write(file_path, arcname)

    size_mb = os.path.getsize(OUTPUT_ZIP) / (1024 * 1024)
    print(f"Done! Portable build: {OUTPUT_ZIP} ({size_mb:.1f} MB)")
    print("Extract the zip anywhere and run the DevDocs executable inside.")


if __name__ == '__main__':
    main()
