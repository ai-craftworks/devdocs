"""
migrate_from_nedb.py

OPTIONAL one-time script to migrate data from the old Node.js/NeDB version
of DevDocs into this Python/SQLite version.

Only run this if you have an existing ./data/*.db folder from the old
Node.js DevDocs app (the files projects.db, repositories.db, documents.db
in NeDB's line-delimited JSON format).

Usage:
    python migrate_from_nedb.py /path/to/old/data/folder

This reads:
    old_data_folder/projects.db
    old_data_folder/repositories.db
    old_data_folder/documents.db

And writes into this app's SQLite database (./data/devdocs.db by default,
or wherever DEVDOCS_DATA_DIR points).
"""
import sys
import os
import json
import sqlite3


def read_nedb_file(path):
    """NeDB stores one JSON object per line. Skip delete markers."""
    records = []
    if not os.path.isfile(path):
        return records
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            # NeDB stores tombstones for deleted docs sometimes; skip if no _id
            if '_id' in obj:
                records.append(obj)
    # Deduplicate by _id, keeping the LAST occurrence (NeDB appends updates)
    deduped = {}
    for r in records:
        deduped[r['_id']] = r
    return list(deduped.values())


def main():
    if len(sys.argv) < 2:
        print("Usage: python migrate_from_nedb.py /path/to/old/data/folder")
        sys.exit(1)

    old_dir = sys.argv[1]
    if not os.path.isdir(old_dir):
        print(f"ERROR: {old_dir} is not a directory")
        sys.exit(1)

    new_data_dir = os.environ.get('DEVDOCS_DATA_DIR') or os.path.join(
        os.path.dirname(os.path.abspath(__file__)), 'data'
    )
    os.makedirs(new_data_dir, exist_ok=True)
    db_path = os.path.join(new_data_dir, 'devdocs.db')

    print(f"Reading old NeDB data from: {old_dir}")
    print(f"Writing to new SQLite database: {db_path}")

    projects     = read_nedb_file(os.path.join(old_dir, 'projects.db'))
    repositories = read_nedb_file(os.path.join(old_dir, 'repositories.db'))
    documents    = read_nedb_file(os.path.join(old_dir, 'documents.db'))

    print(f"Found {len(projects)} projects, {len(repositories)} repositories, {len(documents)} documents")

    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
            icon TEXT NOT NULL DEFAULT '📁', color TEXT NOT NULL DEFAULT '#61afef',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS repositories (
            id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
            name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
            tags TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY, repository_id TEXT NOT NULL,
            doc_type TEXT NOT NULL DEFAULT 'overview', title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '', metadata TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )
    """)

    p_count = 0
    for p in projects:
        conn.execute(
            "INSERT OR IGNORE INTO projects (id,name,description,icon,color,created_at,updated_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (p['_id'], p.get('name', ''), p.get('description', ''),
             p.get('icon', '📁'), p.get('color', '#61afef'),
             p.get('createdAt', ''), p.get('updatedAt', ''))
        )
        p_count += 1

    r_count = 0
    for r in repositories:
        tags = r.get('tags', [])
        if isinstance(tags, list):
            tags = json.dumps(tags)
        conn.execute(
            "INSERT OR IGNORE INTO repositories (id,project_id,name,description,tags,created_at,updated_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (r['_id'], r.get('projectId', ''), r.get('name', ''), r.get('description', ''),
             tags, r.get('createdAt', ''), r.get('updatedAt', ''))
        )
        r_count += 1

    d_count = 0
    for d in documents:
        meta = d.get('metadata', {})
        if isinstance(meta, dict):
            meta = json.dumps(meta)
        conn.execute(
            "INSERT OR IGNORE INTO documents (id,repository_id,doc_type,title,content,metadata,created_at,updated_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (d['_id'], d.get('repositoryId', ''), d.get('type', 'overview'),
             d.get('title', ''), d.get('content', ''), meta,
             d.get('createdAt', ''), d.get('updatedAt', ''))
        )
        d_count += 1

    conn.commit()
    conn.close()

    print(f"\nMigration complete!")
    print(f"  Projects:     {p_count}")
    print(f"  Repositories: {r_count}")
    print(f"  Documents:    {d_count}")
    print(f"\nSQLite database written to: {db_path}")


if __name__ == '__main__':
    main()
