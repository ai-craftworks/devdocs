# DevDocs — Developer Documentation Builder

A clean, self-hosted documentation builder for developers. Organize code docs, examples, changelogs, algorithms, how-to guides, and notebook-style pages across projects and repositories — all running as a native desktop app, no server required.

**Tech stack:** Python + Bottle (backend) · SQLite (database) · pywebview (desktop window) · HTML/CSS/JS with CodeMirror 6 and Quill (frontend)

---

## Quick Start (run from source)

### 1. Install Python

You need **Python 3.9 or newer**. Check your version:

```bash
python3 --version
```

If you don't have Python, download it from [python.org](https://www.python.org/downloads/). On Windows, make sure to check **"Add Python to PATH"** during installation.

### 2. Install dependencies

From the project folder:

```bash
pip install -r requirements.txt
```

> On some Linux systems you may need: `pip install -r requirements.txt --break-system-packages`

### 3. Run the app

```bash
python main.py
```

A native desktop window opens automatically. Your data is saved in a `data/` folder created next to `main.py`.

---

## Building a Standalone Executable

Once you're happy with the app, you can package it into a `.exe` (Windows), `.app` (macOS), or binary (Linux) that runs without Python installed.

### Step 1 — Install PyInstaller

Already included in `requirements.txt`. If needed manually:

```bash
pip install pyinstaller
```

### Step 2 — Build

```bash
pyinstaller devdocs.spec
```

This creates a `dist/DevDocs/` folder containing:
- `DevDocs.exe` (or `DevDocs` on Mac/Linux) — the app
- All bundled Python libraries
- The `public/` and `static/` frontend files

**Run it directly:**

```bash
# Windows
dist\DevDocs\DevDocs.exe

# macOS / Linux
./dist/DevDocs/DevDocs
```

---

## Building a Portable ZIP (no installer)

A portable build is a folder you can zip, copy to a USB drive, or send to a colleague — no installation, no admin rights needed.

```bash
# 1. Build with PyInstaller first
pyinstaller devdocs.spec

# 2. Package into a portable zip
python build_portable.py
```

This produces `dist/DevDocs-portable.zip`. Anyone can:
1. Extract the zip anywhere (Desktop, USB drive, network share)
2. Run the `DevDocs` executable inside
3. Their data is saved in the `data/` folder right next to the executable

**To move your data to another machine:** just copy the entire extracted folder (including the `data/` subfolder) — everything travels together.

---

## Building a Windows Installer

For a proper Windows installer with Start Menu shortcuts and uninstaller:

### Prerequisites

Install [Inno Setup 6](https://jrsoftware.org/isdl.php) (free).

### Build steps

```bash
# 1. Build the app folder
pyinstaller devdocs.spec

# 2. Compile the installer (run from Inno Setup, or via command line:)
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer.iss
```

This produces `dist_installer/DevDocs-Setup.exe` — a single installer file. Running it:
- Installs DevDocs without requiring admin rights (installs to user folder by default)
- Creates Start Menu and optional Desktop shortcuts
- Includes a clean uninstaller

> **Note:** The installer's uninstaller removes the `data/` folder along with the app. If you want to keep your data when uninstalling, back up the `data/` folder first (it's inside the install directory, typically `%LOCALAPPDATA%\DevDocs\data\`).

### macOS / Linux installers

PyInstaller's `--onedir` output works on macOS and Linux too. For a polished macOS `.dmg`, use a tool like [create-dmg](https://github.com/create-dmg/create-dmg) on the `dist/DevDocs/` folder. For Linux, the `dist/DevDocs/` folder can be distributed as-is, or wrapped in a `.deb`/`.AppImage` using tools like `fpm` or `appimagetool`.

---

## Where Your Data Lives

| How you run DevDocs | Data location |
|---|---|
| `python main.py` (development) | `./data/devdocs.db` next to `main.py` |
| `dist/DevDocs/DevDocs.exe` (built) | `data/devdocs.db` next to the executable |
| Portable ZIP (extracted) | `data/devdocs.db` next to the executable inside the extracted folder |
| Installed via Inno Setup | `data/devdocs.db` inside the install directory |

**Everything is portable.** The database is a single SQLite file (`devdocs.db`). To back up: copy that file. To move to another machine: copy the whole folder (executable + `data/` folder together).

---

## Migrating Data from the Old Node.js Version

If you previously used the Node.js/NeDB version of DevDocs and want to bring your projects, repositories, and documents into this Python version:

```bash
python migrate_from_nedb.py /path/to/old/devdocs/data
```

Point it at the old app's `data/` folder (containing `projects.db`, `repositories.db`, `documents.db` in NeDB's line-delimited JSON format). The script reads those files and writes everything into this app's SQLite database. Existing records are never overwritten — safe to run multiple times.

---

## Features

### 📁 Projects
Create projects with a name, description, emoji icon, and color. Each project holds multiple repositories.

### 🗂️ Repositories
Create repositories inside a project. Tag with custom labels. All document types live inside a repository.

### 📄 Document Types

| Type | Purpose |
|---|---|
| **Overview** | Rich-text description of a module or feature |
| **Code Snippet** | Syntax-highlighted code with "why" / "how to use" context and notes |
| **Example** | Before/after code comparison with expected output |
| **Changelog** | Versioned entries with Added / Fixed / Removed / Changed tags |
| **Algorithm** | Step-by-step breakdown (rich-text descriptions, optional code per step), time/space complexity |
| **How-To Guide** | Intro, prerequisites, and sequential steps with code |
| **Page** | Jupyter-notebook style — mix rich-text and code cells freely, reorder with ↑/↓ |

### ✏️ Editors
- **CodeMirror 6** for all code — syntax highlighting, line numbers, bracket matching, autocomplete, for 19+ languages
- **Quill** rich text editor for all prose fields — headings, lists, bold/italic, blockquotes, inline code, links

### 📤 Export
- **Markdown** — download any repository as a single structured `.md` file with table of contents
- **Static Site** — export an entire project as a browsable, self-contained HTML website (zip download) — works offline, no server needed

### 🔍 Search
Global search bar in the sidebar searches across all document titles and content.

---

## Project Structure

```
devdocs-py/
├── main.py                    # Entry point — starts server + opens desktop window
├── devdocs.spec               # PyInstaller build configuration
├── installer.iss              # Inno Setup installer script (Windows)
├── build_portable.py          # Packages a portable ZIP after PyInstaller build
├── migrate_from_nedb.py       # One-time migration from old Node.js version
├── requirements.txt           # Python dependencies
├── src/
│   ├── server.py              # Bottle app setup, static file serving, SPA routing
│   ├── models/
│   │   └── database.py        # SQLite connection, schema, migrations
│   └── routes/
│       ├── projects.py        # Project CRUD endpoints
│       ├── repositories.py    # Repository CRUD endpoints
│       ├── documents.py       # Document CRUD + search endpoints
│       └── export.py          # Markdown and static site export
├── public/                    # Frontend (served by Bottle)
│   ├── index.html
│   ├── css/
│   │   ├── app.css            # Main One Dark Pro theme styles
│   │   └── hljs-theme.css     # Code syntax highlight colors
│   └── js/
│       ├── app.js             # Full frontend application logic
│       └── cm-bundle.js       # Pre-bundled CodeMirror 6 (all languages)
├── static/
│   └── site_template/         # Templates used when exporting a static site
│       ├── site.css
│       └── site.js
└── data/                      # Created automatically — your SQLite database lives here
```

For a deep dive into how the codebase works (especially if you're new to Python), see **[DEVELOPMENT.md](DEVELOPMENT.md)**.

---

## Troubleshooting

**"Module not found" errors when running `python main.py`**
Make sure you ran `pip install -r requirements.txt` first, and that you're using the same Python you installed packages with (`python3 -m pip install -r requirements.txt` if `pip` points elsewhere).

**Built `.exe` opens then closes immediately**
Run it from a terminal/Command Prompt instead of double-clicking, so you can see the error message: open `cmd.exe`, `cd` to the `dist\DevDocs` folder, then run `DevDocs.exe`.

**Port already in use**
DevDocs automatically picks a free port if its default (19284) is taken — no action needed.

**Window doesn't open on Linux**
pywebview needs a GTK or QT backend. Install one:
```bash
sudo apt install python3-gi gir1.2-webkit2-4.0
```

**I want to reset all my data**
Close the app, then delete the `data/devdocs.db` file (and the `-wal`/`-shm` files next to it if present). Restart the app — it creates a fresh empty database.
