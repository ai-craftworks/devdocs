# DevDocs — Development Guide

This document explains how the codebase works, written for someone who is **new to Python**. If you already know Python well, skim the headers and skip the explanations.

---

## 1. The Big Picture

DevDocs is a desktop app, but it's built like a tiny website running on your own computer:

```
┌─────────────────────────────────────────────────┐
│  Desktop Window (pywebview)                      │
│  ┌─────────────────────────────────────────────┐ │
│  │  Browser-like view showing:                  │ │
│  │  HTML + CSS + JavaScript  (public/ folder)   │ │
│  └─────────────────────────────────────────────┘ │
│                     ↕  (fetch requests)           │
│  ┌─────────────────────────────────────────────┐ │
│  │  Python web server (Bottle)                  │ │
│  │  Listens on http://127.0.0.1:<random port>   │ │
│  └─────────────────────────────────────────────┘ │
│                     ↕  (SQL queries)              │
│  ┌─────────────────────────────────────────────┐ │
│  │  SQLite database file (data/devdocs.db)      │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Three layers, like a sandwich:**

1. **Frontend** (`public/` folder) — what you see and click. Plain HTML, CSS, and JavaScript. No frameworks like React — just one big JavaScript file (`app.js`) that builds the page by writing HTML strings.
2. **Backend** (`src/` folder) — Python code that talks to the database and answers requests from the frontend. This is the "API."
3. **Database** (`data/devdocs.db`) — a single file on disk where everything is permanently stored. SQLite is a database that lives in one file — no separate database server needed.

The **pywebview** library is what makes this a "desktop app" instead of "a website you open in Chrome." It opens a native window and points it at the Python server running on your own machine.

---

## 2. How a Request Flows Through the App

Let's trace what happens when you click "New Project" and save it.

### Step 1 — You click the button (frontend)

In `public/index.html`, the button is:
```html
<button class="btn-new-project" id="btnNewProject">+ New</button>
```

In `public/js/app.js`, this line wires the click:
```js
document.getElementById('btnNewProject').addEventListener('click', openNewProject);
```

`openNewProject()` opens the "New Project" modal (a popup form).

### Step 2 — You fill the form and click "Create Project"

This calls `saveProject()` in `app.js`:
```js
async function saveProject() {
  const name = document.getElementById('projectName').value.trim();
  // ...
  const res = await api.post('/api/projects', payload);
  // ...
}
```

`api.post(...)` is a small helper that does a `fetch()` call — this is JavaScript reaching out over the network (even though "the network" here is just `localhost`) to ask the Python server to do something.

### Step 3 — The Python server receives it (backend)

In `src/routes/projects.py`:
```python
@app.post('/api/projects')
def create_project():
    body = request.json or {}
    name = (body.get('name') or '').strip()
    # ... validation ...
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO projects (id, name, description, icon, color, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (project_id, name, ...)
        )
    return {'success': True, 'data': dict(row)}
```

The `@app.post('/api/projects')` line is a **decorator** — it tells Bottle "whenever someone sends a POST request to `/api/projects`, run this function." This pattern (decorator + function) repeats for every single endpoint in the app.

### Step 4 — SQLite saves it (database)

The `INSERT INTO projects ...` line is raw SQL — a query language for talking to databases. `conn.execute(...)` sends that query to the SQLite file on disk, which writes the new row permanently.

### Step 5 — Response flows back

Python returns a Python dictionary: `{'success': True, 'data': {...}}`. Bottle automatically converts this to JSON (a text format JavaScript understands) and sends it back over HTTP.

### Step 6 — JavaScript updates the screen

Back in `app.js`, the `await api.post(...)` call receives that JSON, and the code re-renders the sidebar and shows the new project.

**That's the entire pattern, repeated for every feature in the app**: button click → JS function → `fetch()` → Python route function → SQL query → JSON response → JS updates the page.

---

## 3. File-by-File Walkthrough

### `main.py` — The Entry Point

This is the file that runs when you type `python main.py`. Its job:

1. Figure out where to store the database (`get_data_dir()`)
2. Start the Python web server in a **background thread** (`start_server`)
3. Wait until the server responds to a test request
4. Open the desktop window pointing at that server (`webview.create_window`)

```python
def main():
    data_dir = get_data_dir()
    app, port = create_app(data_dir)

    t = threading.Thread(target=start_server, args=(app, port), daemon=True)
    t.start()
    # ... wait for server ...
    webview.create_window(title='DevDocs', url=f'http://127.0.0.1:{port}', ...)
    webview.start()
```

**Why a thread?** The web server (`bottle.run(...)`) runs forever, listening for requests. If we called it directly, the program would get stuck there and never reach the `webview.create_window(...)` line. Running it in a separate **thread** lets both things happen "at the same time" (the server listens in the background while the window opens in the foreground).

**Why `daemon=True`?** This tells Python "when the main program exits, kill this thread too." Without it, closing the window wouldn't actually quit the app — the server thread would keep running invisibly.

### `src/server.py` — Wiring Everything Together

This file builds the Bottle "app" object and registers all the routes.

```python
def create_app(data_dir: str):
    init_db(data_dir)          # set up the database
    app = Bottle()             # create the web server object

    projects.register(app)      # attach all /api/projects/* routes
    repositories.register(app)  # attach all /api/repositories/* routes
    documents.register(app)     # attach all /api/documents/* routes
    export.register(app)        # attach all /api/export/* routes

    @app.get('/')
    def index():
        return static_file('index.html', root=public_dir)
    # ... more static file routes ...

    port = find_free_port()
    return app, port
```

Each `routes/*.py` file has a `register(app)` function that adds its own URLs to the shared `app` object. This keeps each file focused on one topic (projects, repos, documents, export) instead of one giant 1000-line file.

**`find_free_port()`** tries port 19284 first (an arbitrary unused-looking number), and if something else is already using it, asks the operating system for any free port instead. This means DevDocs never fails to start just because another program happens to be using its preferred port.

### `src/models/database.py` — Talking to SQLite

```python
@contextmanager
def get_conn():
    conn = sqlite3.connect(_db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    # ...
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

This is a **context manager** — the `@contextmanager` decorator and the `yield` keyword let you write:
```python
with get_conn() as conn:
    conn.execute("INSERT INTO ...")
```

Everything between `with get_conn() as conn:` and the end of that indented block happens with one open database connection. If nothing goes wrong, the data is **committed** (saved permanently) when the block ends. If an error happens, it **rolls back** (undoes any half-finished changes) instead — so you never end up with corrupted half-saved data.

`conn.row_factory = sqlite3.Row` makes query results behave like dictionaries (`row['name']`) instead of plain tuples (`row[1]`) — much easier to read.

**`_migrate()`** runs `CREATE TABLE IF NOT EXISTS ...` for all three tables. The `IF NOT EXISTS` means this is safe to run every single time the app starts — it only creates tables the first time, and does nothing on every subsequent launch.

### `src/routes/projects.py`, `repositories.py`, `documents.py` — CRUD Endpoints

"CRUD" stands for **Create, Read, Update, Delete** — the four basic operations any data-driven app needs. Each of these three files follows the identical pattern:

```python
@app.get('/api/projects')           # READ (list all)
@app.get('/api/projects/<id>')      # READ (one)
@app.post('/api/projects')          # CREATE
@app.put('/api/projects/<id>')      # UPDATE
@app.delete('/api/projects/<id>')   # DELETE
```

The `<id>` part in the URL is a **placeholder** — Bottle automatically extracts whatever the actual ID is and passes it into your function as a parameter:

```python
@app.get('/api/projects/<project_id>')
def get_project(project_id):
    # project_id is now a Python variable containing whatever was in the URL
```

If someone requests `/api/projects/abc-123`, then `project_id` equals `"abc-123"` inside the function.

### `src/routes/export.py` — Generating Files

This file is bigger because it builds two different kinds of output:

1. **Markdown export** (`doc_to_markdown()`) — walks through a document's data and builds a big text string with `#` headers, code fences (` ```python `), and bullet points. This is just **string concatenation** — building up a list of text lines and joining them at the end with `'\n'.join(lines)`.

2. **Static site export** (`build_index_html()`, `build_repo_html()`) — same idea but builds HTML instead of Markdown, then packages everything into a ZIP file in memory using Python's built-in `zipfile` module:

```python
buf = io.BytesIO()  # an in-memory "file" — never touches the disk
with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.writestr('index.html', html_content)
    zf.writestr('assets/site.css', css_content)
buf.seek(0)
return buf.read()  # send the finished ZIP bytes back to the browser
```

`io.BytesIO()` is a fake file that exists only in memory (RAM), not on disk. This is faster and avoids leaving temporary files lying around.

---

## 4. Key Python Concepts Used Here

If any of these are unfamiliar, here's a quick primer:

### Decorators (`@something`)

```python
@app.get('/api/ping')
def ping():
    return {'success': True}
```

A decorator is a function that wraps another function. `@app.get('/api/ping')` doesn't run `ping()` immediately — it tells Bottle "remember this function, and call it later whenever a GET request comes in for `/api/ping`." You'll see this pattern everywhere in the routes files.

### Dictionaries as JSON

Python dictionaries (`{'key': 'value'}`) and JSON objects look almost identical. Bottle automatically converts any dictionary your route function returns into a JSON HTTP response. This is why every route function in this app just `return {...}` — Bottle does the conversion for you.

### `with` statements (context managers)

```python
with get_conn() as conn:
    conn.execute(...)
```

Anything that needs cleanup afterward (closing a file, closing a database connection) usually uses `with`. It guarantees the cleanup happens even if an error occurs inside the block.

### f-strings

```python
f"Hello {name}, you have {count} items"
```

The `f` before the quote means you can embed Python expressions directly inside `{curly braces}` within the string. Used constantly in this codebase for building dynamic strings (HTML, SQL, file paths).

### Threading

```python
t = threading.Thread(target=some_function, daemon=True)
t.start()
```

Lets one function run "in the background" while the rest of your program continues. Used in `main.py` to run the web server without blocking the rest of the startup sequence.

---

## 5. How the Frontend Renders Pages (No Framework)

Unlike React or Vue, `app.js` builds pages by writing raw HTML as JavaScript template strings and inserting them into the page:

```js
function repoCard(r) {
  return `
    <div class="repo-card" onclick="app.openRepo('${r.id}')">
      <div class="repo-card-name">${esc(r.name)}</div>
      ...
    </div>`;
}
```

This is called a **template literal** (backtick strings with `${}` placeholders). The function returns a string of HTML, and somewhere else that string gets inserted into the page with `element.innerHTML = htmlString`.

**Why `esc(r.name)`?** If a project name contained `<script>alert('hi')</script>`, inserting it raw into HTML would actually run that script — a security hole called XSS (Cross-Site Scripting). The `esc()` function converts `<`, `>`, `&`, and `"` into their safe HTML equivalents (`&lt;`, `&gt;`, etc.) so user text is always displayed as text, never executed as code.

### The `window.app` Object

At the very bottom of `app.js`:
```js
window.app = {
  goHome, toggleSidebar, openNewProject, ...
};
```

Since the HTML uses inline `onclick="app.openNewProject()"` attributes, every function that an HTML button needs to call must be exposed on this global `app` object. If you add a new button that calls a new function, you must add that function's name to this list too, or you'll get a `app.yourFunction is not a function` error in the browser console.

### CodeMirror and Quill — Why They're Loaded Specially

- **Quill** (rich text editor) is loaded from a CDN `<script>` tag in `index.html`. It attaches itself to `window.Quill`.
- **CodeMirror 6** is trickier — it's normally distributed as many small npm packages (`@codemirror/state`, `@codemirror/view`, etc.). Loading them individually from different URLs can accidentally load **two different copies** of the same internal code, which breaks CodeMirror in confusing ways (`instanceof` checks fail).

The fix used here: all the CodeMirror pieces are pre-bundled into one file, `public/js/cm-bundle.js`, using a tool called `esbuild`. This guarantees there's only ever one copy of everything. The bundle sets a single global variable `window.CM` containing everything CodeMirror needs, and `app.js` just does:

```js
const { EditorView, EditorState, javascript, python, ... } = CM;
```

You don't need to touch `cm-bundle.js` unless you want to add support for a new programming language's syntax highlighting (see section 7 below).

---

## 6. The Database Schema

Three tables, in a simple parent-child-grandchild relationship:

```
projects
  └── repositories  (each has a project_id pointing to its parent project)
        └── documents  (each has a repository_id pointing to its parent repo)
```

```sql
CREATE TABLE projects (
    id          TEXT PRIMARY KEY,      -- a random UUID like "a1b2c3d4-..."
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon        TEXT NOT NULL DEFAULT '📁',
    color       TEXT NOT NULL DEFAULT '#61afef',
    created_at  TEXT NOT NULL,         -- ISO timestamp string
    updated_at  TEXT NOT NULL
);

CREATE TABLE repositories (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '[]',  -- JSON array stored as text
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE documents (
    id            TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    doc_type      TEXT NOT NULL DEFAULT 'overview',  -- 'code', 'algorithm', 'page', etc.
    title         TEXT NOT NULL,
    content       TEXT NOT NULL DEFAULT '',
    metadata      TEXT NOT NULL DEFAULT '{}',  -- JSON object stored as text, shape depends on doc_type
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
```

**`ON DELETE CASCADE`** is important: if you delete a project, SQLite automatically deletes all its repositories too, and deleting a repository automatically deletes all its documents. You never have to manually clean up "orphaned" child records.

**Why store `tags` and `metadata` as JSON text instead of proper columns?** Different document types need wildly different extra fields — a "code" doc needs `why`/`how`/`language`, but an "algorithm" doc needs `steps`/`timeComplexity`. Rather than creating dozens of mostly-empty columns, we store this flexible data as a JSON string in one `metadata` column, and parse/stringify it in Python (`json.dumps()` / `json.loads()`) whenever we read or write.

---

## 7. Common Tasks

### Adding a new document type

1. **Backend**: No changes needed — `documents.py` already accepts any `doc_type` string and stores arbitrary `metadata` JSON.
2. **Frontend** (`app.js`):
   - Add to the `DOC_TYPES` array (controls the sidebar list in the editor)
   - Add a case in `renderEditorFields()` to build the editing form for your new type
   - Add a case in `collectFormData()` to gather form values into `{title, doc_type, content, metadata}`
   - Add a case in `renderDocContent()` to build the read-only display
3. **Export** (`export.py`): Add a matching branch in `doc_to_markdown()` and `doc_to_html()` so your new type exports correctly too.

### Adding support for a new programming language's syntax highlighting

1. Find the CodeMirror language package on npm, e.g. `@codemirror/lang-go`
2. Install it: `npm install @codemirror/lang-go`
3. Add it to the bundle entry point and rebuild:
   ```js
   // in cm-entry.js (recreate this temp file, see below)
   export { go } from '@codemirror/lang-go';
   ```
4. Rebuild the bundle:
   ```bash
   npx esbuild cm-entry.js --bundle --format=iife --global-name=CM --outfile=public/js/cm-bundle.js --minify
   ```
5. In `app.js`, add `go: () => go(),` to the `langExt` lookup object inside `makeCmExtensions()`

### Changing the color theme

All colors are defined as CSS variables at the top of `public/css/app.css`:
```css
:root {
  --bg: #1e2227;
  --accent: #61afef;
  /* ... */
}
```
Change these values and the entire app re-themes — nothing else needs editing.

### Adding a new API endpoint

Pick the relevant file in `src/routes/`, add a new function with a `@app.get/post/put/delete(...)` decorator inside its `register(app)` function. Follow the existing pattern (validate input, use `get_conn()`, return a dict with `success`).

---

## 8. Debugging Tips

**See what's happening in the browser:** Run `python main.py --debug` — this opens developer tools in the desktop window so you can inspect the page, see console errors, and check network requests, just like in Chrome.

**See Python errors:** They print directly to your terminal where you ran `python main.py`. If the window closes immediately when something goes wrong, run from a terminal (not by double-clicking) so you can read the error.

**Check what's actually in the database:** SQLite databases can be opened with any SQLite browser tool, e.g. [DB Browser for SQLite](https://sqlitebrowser.org/) (free, cross-platform). Open `data/devdocs.db` to see your tables and rows directly.

**Test an API endpoint manually:** With the app running, open another terminal and use `curl`:
```bash
curl http://127.0.0.1:19284/api/projects
```
(Replace the port if yours differs — check the terminal output when the app starts, or `data/devdocs.db`'s neighboring log if you added one.)

---

## 9. Why These Specific Libraries?

- **Bottle** instead of Flask/Django — it's a single file (~3500 lines), zero dependencies, and perfect for an app this size where you don't need Django's full feature set or Flask's larger ecosystem.
- **pywebview** instead of Electron — Electron bundles an entire Chromium browser (100+ MB) inside every app. pywebview uses the operating system's built-in web view component (Edge WebView2 on Windows, WebKit on Mac, GTK WebKit on Linux) — the resulting app is a fraction of the size and starts faster.
- **SQLite** instead of PostgreSQL/MySQL — it's a single file, requires no separate database server to install or run, and is plenty fast for a single-user desktop app.
- **CodeMirror 6** instead of Monaco (VS Code's editor) — Monaco is powerful but very heavy (several MB). CodeMirror 6 is modular, lightweight, and supports all the languages DevDocs needs.
- **Vanilla JS** instead of React/Vue — for an app of this size, a framework adds build complexity (webpack, babel, JSX compilation) without much benefit. Plain JavaScript with template strings keeps the whole frontend understandable in a handful of files with zero build step for the UI itself.
