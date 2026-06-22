"""
src/routes/documents.py
CRUD endpoints for Documents.
"""
import uuid
import json
from datetime import datetime, timezone
from bottle import request, response
from src.models.database import get_conn


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def register(app):

    @app.get('/api/documents/repository/<repo_id>')
    def list_docs(repo_id):
        with get_conn() as conn:
            rows = conn.execute(
                """SELECT * FROM documents WHERE repository_id = ?
                   ORDER BY created_at ASC""",
                (repo_id,)
            ).fetchall()
        return {'success': True, 'data': [dict(r) for r in rows]}

    @app.get('/api/documents/<doc_id>')
    def get_doc(doc_id):
        with get_conn() as conn:
            row = conn.execute(
                'SELECT * FROM documents WHERE id = ?', (doc_id,)
            ).fetchone()
        if not row:
            response.status = 404
            return {'success': False, 'error': 'Document not found'}
        return {'success': True, 'data': dict(row)}

    @app.post('/api/documents')
    def create_doc():
        body = request.json or {}
        title = (body.get('title') or '').strip()
        repo_id = (body.get('repository_id') or '').strip()
        if not title or not repo_id:
            response.status = 400
            return {'success': False, 'error': 'title and repository_id are required'}
        doc_id = str(uuid.uuid4())
        ts = now_iso()
        metadata = body.get('metadata', {})
        if isinstance(metadata, dict):
            metadata = json.dumps(metadata)
        with get_conn() as conn:
            conn.execute(
                """INSERT INTO documents
                   (id, repository_id, doc_type, title, content, metadata, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (doc_id, repo_id,
                 body.get('doc_type', 'overview'),
                 title,
                 body.get('content', ''),
                 metadata, ts, ts)
            )
            row = conn.execute('SELECT * FROM documents WHERE id = ?', (doc_id,)).fetchone()
        return {'success': True, 'data': dict(row)}

    @app.put('/api/documents/<doc_id>')
    def update_doc(doc_id):
        body = request.json or {}
        title = (body.get('title') or '').strip()
        if not title:
            response.status = 400
            return {'success': False, 'error': 'title is required'}
        ts = now_iso()
        metadata = body.get('metadata', {})
        if isinstance(metadata, dict):
            metadata = json.dumps(metadata)
        with get_conn() as conn:
            conn.execute(
                """UPDATE documents
                   SET doc_type=?, title=?, content=?, metadata=?, updated_at=?
                   WHERE id=?""",
                (body.get('doc_type', 'overview'),
                 title,
                 body.get('content', ''),
                 metadata, ts, doc_id)
            )
            row = conn.execute('SELECT * FROM documents WHERE id = ?', (doc_id,)).fetchone()
        if not row:
            response.status = 404
            return {'success': False, 'error': 'Document not found'}
        return {'success': True, 'data': dict(row)}

    @app.delete('/api/documents/<doc_id>')
    def delete_doc(doc_id):
        with get_conn() as conn:
            conn.execute('DELETE FROM documents WHERE id = ?', (doc_id,))
        return {'success': True}

    @app.get('/api/documents/search')
    def search_docs():
        query = (request.query.get('q') or '').strip().lower()
        if not query:
            return {'success': True, 'data': []}
        pattern = f'%{query}%'
        with get_conn() as conn:
            rows = conn.execute(
                """SELECT * FROM documents
                   WHERE lower(title) LIKE ? OR lower(content) LIKE ?
                   ORDER BY updated_at DESC LIMIT 20""",
                (pattern, pattern)
            ).fetchall()
        return {'success': True, 'data': [dict(r) for r in rows]}
