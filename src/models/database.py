"""
src/models/database.py
SQLite database setup and schema migrations.
"""
import sqlite3
import os
from contextlib import contextmanager

_db_path = None


def init_db(data_dir: str):
    """Initialise the database path and run migrations."""
    global _db_path
    _db_path = os.path.join(data_dir, 'devdocs.db')
    _migrate()


def get_db_path() -> str:
    return _db_path


@contextmanager
def get_conn():
    """Context manager that yields a configured SQLite connection."""
    conn = sqlite3.connect(_db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row          # rows behave like dicts
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA synchronous=NORMAL')
    conn.execute('PRAGMA foreign_keys=ON')
    conn.execute('PRAGMA temp_store=MEMORY')
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _migrate():
    """Create tables if they don't exist (non-destructive)."""
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS projects (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                icon        TEXT NOT NULL DEFAULT '📁',
                color       TEXT NOT NULL DEFAULT '#61afef',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS repositories (
                id          TEXT PRIMARY KEY,
                project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                name        TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                tags        TEXT NOT NULL DEFAULT '[]',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS documents (
                id            TEXT PRIMARY KEY,
                repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
                doc_type      TEXT NOT NULL DEFAULT 'overview',
                title         TEXT NOT NULL,
                content       TEXT NOT NULL DEFAULT '',
                metadata      TEXT NOT NULL DEFAULT '{}',
                created_at    TEXT NOT NULL,
                updated_at    TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_repos_project ON repositories(project_id);
            CREATE INDEX IF NOT EXISTS idx_docs_repo     ON documents(repository_id);
            CREATE INDEX IF NOT EXISTS idx_docs_type     ON documents(doc_type);
        """)
