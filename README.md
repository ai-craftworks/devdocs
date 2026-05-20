# DevDocs — Developer Documentation Builder

A clean, self-hosted documentation builder for developers. Organize code docs, examples, changelogs, algorithms, and how-to guides across projects and repositories.

---

## Quick Start

```bash
npm install
npm run start
```

### Link globally

```bash
npm link

devdocs start
```

Then open **http://localhost:3000** in your browser.

---

## Project Structure

```
devdocs/
├── src/
│   ├── server.js           # Express server entry point
│   ├── models/db.js        # NeDB database layer
│   └── routes/
│       ├── projects.js     # Project CRUD API
│       ├── repositories.js # Repository CRUD API
│       └── documents.js    # Document CRUD API
├── public/
│   ├── index.html          # SPA shell
│   ├── css/
│   │   ├── app.css         # Main styles
│   │   └── hljs-theme.css  # Code highlight theme
│   └── js/
│       └── app.js          # Full frontend application
├── data/                   # Auto-created — NeDB flat-file databases
└── package.json
```

---

## Features

### 📁 Projects
- Create projects with a name, description, icon (emoji), and color
- Each project holds multiple repositories

### 🗂️ Repositories
- Create repositories inside a project
- Tag with primary language and custom tags
- All document types live inside a repository

### 📄 Document Types

| Type | Purpose |
|------|---------|
| **Overview** | General description of a module or feature |
| **Code Snippet** | Syntax-highlighted code with "why" and "how to use" context |
| **Example** | Before/after code comparison with expected output |
| **Changelog** | Versioned change history with Added/Fixed/Removed entries |
| **Algorithm** | Step-by-step breakdown with per-step code, time & space complexity |
| **How-To Guide** | Sequential instructions with prerequisites and optional code |

### 🔍 Search
- Global search bar in the sidebar footer
- Searches across document titles and content

---

## Data Storage

Uses [NeDB](https://github.com/louischatriot/nedb) — a pure JavaScript embedded database stored as flat `.db` files in the `data/` directory. No external database required.

---

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: NeDB (file-based, no setup required)
- **Frontend**: Vanilla JS SPA (no framework)
- **Syntax Highlighting**: highlight.js
- **Fonts**: Syne + DM Serif Display + JetBrains Mono
