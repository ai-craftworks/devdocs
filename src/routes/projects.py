"""
src/routes/projects.py
CRUD endpoints for Projects.
"""
import json
import uuid
from datetime import datetime, timezone
from bottle import request, response
from src.models.database import get_conn


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def register(app):
    """Attach all project routes to the Bottle app."""

    @app.get('/api/projects')
    def list_projects():
        with get_conn() as conn:
            rows = conn.execute("""
                SELECT p.id, p.name, p.description, p.icon, p.color,
                       p.created_at, p.updated_at,
                       COUNT(r.id) AS repo_count
                FROM projects p
                LEFT JOIN repositories r ON r.project_id = p.id
                GROUP BY p.id
                ORDER BY p.created_at DESC
            """).fetchall()
        return {'success': True, 'data': [dict(r) for r in rows]}

    @app.get('/api/projects/<project_id>')
    def get_project(project_id):
        with get_conn() as conn:
            row = conn.execute(
                'SELECT * FROM projects WHERE id = ?', (project_id,)
            ).fetchone()
        if not row:
            response.status = 404
            return {'success': False, 'error': 'Project not found'}
        return {'success': True, 'data': dict(row)}

    @app.post('/api/projects')
    def create_project():
        body = request.json or {}
        name = (body.get('name') or '').strip()
        if not name:
            response.status = 400
            return {'success': False, 'error': 'name is required'}
        project_id = str(uuid.uuid4())
        ts = now_iso()
        with get_conn() as conn:
            conn.execute(
                """INSERT INTO projects (id, name, description, icon, color, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (project_id, name,
                 body.get('description', ''),
                 body.get('icon', '📁'),
                 body.get('color', '#61afef'),
                 ts, ts)
            )
            row = conn.execute('SELECT * FROM projects WHERE id = ?', (project_id,)).fetchone()
        return {'success': True, 'data': dict(row)}

    @app.put('/api/projects/<project_id>')
    def update_project(project_id):
        body = request.json or {}
        name = (body.get('name') or '').strip()
        if not name:
            response.status = 400
            return {'success': False, 'error': 'name is required'}
        ts = now_iso()
        with get_conn() as conn:
            conn.execute(
                """UPDATE projects
                   SET name=?, description=?, icon=?, color=?, updated_at=?
                   WHERE id=?""",
                (name, body.get('description', ''),
                 body.get('icon', '📁'), body.get('color', '#61afef'),
                 ts, project_id)
            )
            row = conn.execute('SELECT * FROM projects WHERE id = ?', (project_id,)).fetchone()
        if not row:
            response.status = 404
            return {'success': False, 'error': 'Project not found'}
        return {'success': True, 'data': dict(row)}

    @app.delete('/api/projects/<project_id>')
    def delete_project(project_id):
        with get_conn() as conn:
            conn.execute('DELETE FROM projects WHERE id = ?', (project_id,))
        return {'success': True}
