"""
src/routes/repositories.py
CRUD endpoints for Repositories.
"""
import uuid
from datetime import datetime, timezone
from bottle import request, response
from src.models.database import get_conn


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def register(app):

    @app.get('/api/repositories/project/<project_id>')
    def list_repos(project_id):
        with get_conn() as conn:
            rows = conn.execute("""
                SELECT r.id, r.project_id, r.name, r.description, r.tags,
                       r.created_at, r.updated_at,
                       COUNT(d.id) AS doc_count
                FROM repositories r
                LEFT JOIN documents d ON d.repository_id = r.id
                WHERE r.project_id = ?
                GROUP BY r.id
                ORDER BY r.created_at DESC
            """, (project_id,)).fetchall()
        return {'success': True, 'data': [dict(r) for r in rows]}

    @app.get('/api/repositories/<repo_id>')
    def get_repo(repo_id):
        with get_conn() as conn:
            row = conn.execute(
                'SELECT * FROM repositories WHERE id = ?', (repo_id,)
            ).fetchone()
        if not row:
            response.status = 404
            return {'success': False, 'error': 'Repository not found'}
        return {'success': True, 'data': dict(row)}

    @app.post('/api/repositories')
    def create_repo():
        body = request.json or {}
        name = (body.get('name') or '').strip()
        project_id = body.get('project_id', '').strip()
        if not name or not project_id:
            response.status = 400
            return {'success': False, 'error': 'name and project_id are required'}
        repo_id = str(uuid.uuid4())
        ts = now_iso()
        tags = body.get('tags', '[]')
        if isinstance(tags, list):
            import json
            tags = json.dumps(tags)
        with get_conn() as conn:
            conn.execute(
                """INSERT INTO repositories (id, project_id, name, description, tags, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (repo_id, project_id, name,
                 body.get('description', ''), tags, ts, ts)
            )
            row = conn.execute('SELECT * FROM repositories WHERE id = ?', (repo_id,)).fetchone()
        return {'success': True, 'data': dict(row)}

    @app.put('/api/repositories/<repo_id>')
    def update_repo(repo_id):
        body = request.json or {}
        name = (body.get('name') or '').strip()
        if not name:
            response.status = 400
            return {'success': False, 'error': 'name is required'}
        ts = now_iso()
        tags = body.get('tags', '[]')
        if isinstance(tags, list):
            import json
            tags = json.dumps(tags)
        with get_conn() as conn:
            conn.execute(
                """UPDATE repositories
                   SET name=?, description=?, tags=?, updated_at=?
                   WHERE id=?""",
                (name, body.get('description', ''), tags, ts, repo_id)
            )
            row = conn.execute('SELECT * FROM repositories WHERE id = ?', (repo_id,)).fetchone()
        if not row:
            response.status = 404
            return {'success': False, 'error': 'Repository not found'}
        return {'success': True, 'data': dict(row)}

    @app.delete('/api/repositories/<repo_id>')
    def delete_repo(repo_id):
        with get_conn() as conn:
            conn.execute('DELETE FROM repositories WHERE id = ?', (repo_id,))
        return {'success': True}
