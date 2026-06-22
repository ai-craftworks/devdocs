"""
src/routes/export.py
Export endpoints: Markdown download and static site ZIP.
"""
import json
import io
import re
import zipfile
import os
from datetime import datetime
from bottle import response, request
from src.models.database import get_conn


# ── helpers ────────────────────────────────────────────────────────────────────

def esc(s):
    if not s:
        return ''
    return (str(s)
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;'))


def slug(s):
    s = str(s).lower()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-') or 'untitled'


def strip_html(html):
    if not html:
        return ''
    text = re.sub(r'<[^>]+>', '', str(html))
    text = (text.replace('&amp;', '&')
                .replace('&lt;', '<')
                .replace('&gt;', '>')
                .replace('&quot;', '"')
                .replace('&#39;', "'"))
    return text.strip()


def doc_type_label(t):
    return {'overview': 'Overview', 'code': 'Code', 'example': 'Example',
            'changelog': 'Changelog', 'algorithm': 'Algorithm',
            'guide': 'Guide', 'page': 'Page'}.get(t, 'Document')


def doc_type_icon(t):
    return {'overview': '📋', 'code': '💻', 'example': '🔬',
            'changelog': '🔄', 'algorithm': '⚡',
            'guide': '📖', 'page': '📄'}.get(t, '📄')


# ── Markdown builder ───────────────────────────────────────────────────────────

def doc_to_markdown(doc):
    lines = []
    meta = {}
    try:
        meta = json.loads(doc['metadata'] or '{}')
    except Exception:
        pass

    lines.append(f"## {doc['title']}")
    lines.append(f"> **Type:** {doc_type_label(doc['doc_type'])}")
    lines.append('')

    t = doc['doc_type']
    content = doc['content'] or ''

    if t == 'overview':
        if content:
            lines.append(strip_html(content))
            lines.append('')

    elif t == 'code':
        lang = meta.get('language', '')
        if meta.get('why'):
            lines.append(f"**Why:** {strip_html(meta['why'])}")
            lines.append('')
        if meta.get('how'):
            lines.append(f"**How to use:** {strip_html(meta['how'])}")
            lines.append('')
        if content:
            lines.append(f'```{lang}')
            lines.append(content)
            lines.append('```')
            lines.append('')
        if meta.get('notes'):
            lines.append(f"> 📝 {strip_html(meta['notes'])}")
            lines.append('')

    elif t == 'example':
        lang = meta.get('language', '')
        if content:
            lines.append(strip_html(content))
            lines.append('')
        if meta.get('inputCode'):
            lines.append('**Input / Before:**')
            lines.append(f'```{lang}')
            lines.append(meta['inputCode'])
            lines.append('```')
            lines.append('')
        if meta.get('outputCode'):
            lines.append('**Output / After:**')
            lines.append(f'```{lang}')
            lines.append(meta['outputCode'])
            lines.append('```')
            lines.append('')
        if meta.get('expectedOutput'):
            lines.append(f"**Expected Result:** `{meta['expectedOutput']}`")
            lines.append('')

    elif t == 'changelog':
        if content:
            lines.append(strip_html(content))
            lines.append('')
        for entry in meta.get('entries', []):
            ver = entry.get('version', 'v?')
            date = entry.get('date', '')
            lines.append(f"### {ver} — {date}")
            for c in entry.get('changes', []):
                sym = {'+': '+', 'added': '+', 'fixed': '~',
                       'removed': '-', 'changed': '→'}.get(c.get('type', ''), '→')
                lines.append(f"- `{sym}` {c.get('text', '')}")
            lines.append('')

    elif t in ('algorithm', 'guide'):
        if content:
            lines.append(strip_html(content))
            lines.append('')
        prereqs = meta.get('prerequisites', '')
        if prereqs:
            lines.append(f"**Prerequisites:** {strip_html(prereqs)}")
            lines.append('')
        lang = meta.get('language', '')
        for i, step in enumerate(meta.get('steps', []), 1):
            lines.append(f"### Step {i}: {step.get('title', '')}")
            if step.get('description'):
                lines.append(strip_html(step['description']))
                lines.append('')
            if step.get('code'):
                lines.append(f'```{lang}')
                lines.append(step['code'])
                lines.append('```')
                lines.append('')
        if meta.get('timeComplexity'):
            lines.append(f"**Time Complexity:** `{meta['timeComplexity']}`")
        if meta.get('spaceComplexity'):
            lines.append(f"**Space Complexity:** `{meta['spaceComplexity']}`")
        lines.append('')

    elif t == 'page':
        for cell in meta.get('cells', []):
            if cell.get('type') == 'text':
                lines.append(strip_html(cell.get('content', '')))
                lines.append('')
            else:
                lang = cell.get('language', '')
                lines.append(f'```{lang}')
                lines.append(cell.get('content', ''))
                lines.append('```')
                lines.append('')

    lines.append('---')
    lines.append('')
    return '\n'.join(lines)


# ── HTML doc renderer (for static site) ───────────────────────────────────────

def doc_to_html(doc):
    meta = {}
    try:
        meta = json.loads(doc['metadata'] or '{}')
    except Exception:
        pass
    t       = doc.get('doc_type', 'overview')
    content = doc.get('content', '') or ''

    def code_block(code, lang):
        return (f'<div class="code-block">'
                f'<div class="code-block-header"><span class="lang-label">{esc(lang)}</span></div>'
                f'<pre><code class="language-{esc(lang)}">{esc(code)}</code></pre>'
                f'</div>')

    if t == 'overview':
        return f'<div class="prose">{content}</div>'

    elif t == 'code':
        lang  = meta.get('language', '')
        why   = meta.get('why', '')
        how   = meta.get('how', '')
        notes = meta.get('notes', '')
        parts = []
        if why or how:
            why_h  = f'<div class="why-box"><strong>Why</strong>{why}</div>' if why else ''
            how_h  = f'<div class="how-box"><strong>How to use</strong>{how}</div>' if how else ''
            parts.append(f'<div class="why-how">{why_h}{how_h}</div>')
        if content:
            parts.append(code_block(content, lang))
        if notes:
            parts.append(f'<div class="notes-box"><strong>Notes</strong>{notes}</div>')
        return ''.join(parts)

    elif t == 'example':
        lang   = meta.get('language', '')
        parts  = []
        if content:
            parts.append(f'<div class="prose">{content}</div>')
        if meta.get('inputCode'):
            parts.append('<div class="section-label">Input / Before</div>')
            parts.append(code_block(meta['inputCode'], lang))
        if meta.get('outputCode'):
            parts.append('<div class="section-label">Output / After</div>')
            parts.append(code_block(meta['outputCode'], lang))
        if meta.get('expectedOutput'):
            parts.append(f'<div class="expected"><strong>Expected:</strong> <code>{esc(meta["expectedOutput"])}</code></div>')
        return ''.join(parts)

    elif t == 'changelog':
        parts = []
        if content:
            parts.append(f'<div class="prose">{content}</div>')
        for entry in meta.get('entries', []):
            ver  = esc(entry.get('version', ''))
            date = esc(entry.get('date', ''))
            changes_html = ''.join(
                f'<li class="change-{esc(c.get("type","added"))}">{esc(c.get("text",""))}</li>'
                for c in entry.get('changes', [])
            )
            parts.append(
                f'<div class="cl-entry">'
                f'<span class="cl-version">{ver}</span>'
                f'<span class="cl-date">{date}</span>'
                f'<ul>{changes_html}</ul>'
                f'</div>'
            )
        return ''.join(parts)

    elif t in ('algorithm', 'guide'):
        lang  = meta.get('language', '')
        parts = []
        if content:
            parts.append(f'<div class="prose">{content}</div>')
        prereqs = meta.get('prerequisites', '')
        if prereqs:
            parts.append(f'<div class="prereq-box"><strong>Prerequisites</strong>{prereqs}</div>')
        num_class = 'step-num' if t == 'algorithm' else 'step-num guide-num'
        for i, step in enumerate(meta.get('steps', []), 1):
            num = str(i).zfill(2)
            body_parts = []
            if step.get('title'):
                body_parts.append(f'<div class="step-title">{esc(step["title"])}</div>')
            if step.get('description'):
                body_parts.append(f'<div class="step-desc">{step["description"]}</div>')
            if step.get('code'):
                body_parts.append(code_block(step['code'], lang))
            parts.append(
                f'<div class="step">'
                f'<div class="{num_class}">{num}</div>'
                f'<div class="step-body">{"".join(body_parts)}</div>'
                f'</div>'
            )
        if meta.get('timeComplexity') or meta.get('spaceComplexity'):
            badges = ''
            if meta.get('timeComplexity'):
                badges += f'<div class="badge"><span class="badge-label">Time</span><code>{esc(meta["timeComplexity"])}</code></div>'
            if meta.get('spaceComplexity'):
                badges += f'<div class="badge"><span class="badge-label">Space</span><code>{esc(meta["spaceComplexity"])}</code></div>'
            parts.append(f'<div class="complexity">{badges}</div>')
        return ''.join(parts)

    elif t == 'page':
        parts = []
        for cell in meta.get('cells', []):
            if cell.get('type') == 'text':
                parts.append(f'<div class="page-text-cell">{cell.get("content","")}</div>')
            else:
                parts.append(code_block(cell.get('content', ''), cell.get('language', '')))
        return ''.join(parts)

    return f'<div class="prose">{content}</div>'


# ── Static site HTML builders ─────────────────────────────────────────────────

def build_index_html(project, repos):
    repo_cards = ''.join(
        f'<a href="{slug(r["name"])}.html" class="repo-card">'
        f'<div class="rc-icon">🗂️</div>'
        f'<div class="rc-name">{esc(r["name"])}</div>'
        f'<div class="rc-desc">{esc(r["description"] or "No description")}</div>'
        f'<div class="rc-meta">{r.get("doc_count",0)} docs</div>'
        f'</a>'
        for r in repos
    )
    sidebar = ''.join(
        f'<div class="repo-group">'
        f'<div class="repo-group-header"><span>🗂️</span><span>{esc(r["name"])}</span><span class="chevron">▶</span></div>'
        f'<div class="doc-links"><a class="doc-link" href="{slug(r["name"])}.html">View docs</a></div>'
        f'</div>'
        for r in repos
    )
    desc_html = f'<div class="hero-desc">{esc(project["description"])}</div>' if project.get('description') else ''
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{esc(project["name"])} — DevDocs</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="assets/site.css"/></head>
<body>
<aside class="sidebar">
  <div class="sidebar-brand"><div class="brand-icon">D</div>
    <div><div class="brand-name">DevDocs</div><div class="brand-sub">{esc(project["name"])}</div></div>
  </div>
  <div class="sidebar-section">
    <div class="sidebar-section-label">Repositories</div>{sidebar}
  </div>
</aside>
<main class="main">
  <div class="home-hero">
    <div class="hero-icon">{esc(project["icon"])}</div>
    <div class="hero-title">{esc(project["name"])}</div>{desc_html}
  </div>
  <div class="home-body">
    <div class="section-heading">Repositories</div>
    <div class="repo-grid">{repo_cards}</div>
  </div>
</main>
<script src="assets/site.js"></script>
</body></html>"""


def build_repo_html(project, all_repos, repo, docs):
    sidebar = ''
    for r in all_repos:
        active = 'open active' if r['id'] == repo['id'] else ''
        visible = 'visible' if r['id'] == repo['id'] else ''
        links = ''.join(
            f'<a class="doc-link" href="#{slug(d["title"])}">'
            f'{doc_type_icon(d["doc_type"])} {esc(d["title"])}</a>'
            for d in docs if r['id'] == repo['id']
        )
        sidebar += (
            f'<div class="repo-group">'
            f'<div class="repo-group-header {active}"><span>🗂️</span>'
            f'<span>{esc(r["name"])}</span><span class="chevron">▶</span></div>'
            f'<div class="doc-links {visible}">{links}</div>'
            f'</div>'
        )

    doc_sections = ''.join(
        f'<div class="doc-section" id="{slug(d["title"])}">'
        f'<div class="doc-section-header">'
        f'<span class="type-badge type-{esc(d["doc_type"])}">'
        f'{doc_type_icon(d["doc_type"])} {doc_type_label(d["doc_type"])}</span>'
        f'<span class="doc-title-text">{esc(d["title"])}</span>'
        f'</div>'
        f'<div class="doc-section-body">{doc_to_html(d)}</div>'
        f'</div>'
        for d in docs
    )

    tags_html = ''
    try:
        tags = json.loads(repo.get('tags') or '[]')
        tags_html = ''.join(f'<span class="repo-tag">{esc(t)}</span>' for t in tags)
    except Exception:
        pass

    desc_html = f'<div class="repo-desc">{esc(repo["description"])}</div>' if repo.get('description') else ''

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{esc(repo["name"])} — {esc(project["name"])}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="assets/site.css"/></head>
<body>
<aside class="sidebar">
  <a href="index.html" class="sidebar-brand">
    <div class="brand-icon">D</div>
    <div><div class="brand-name">DevDocs</div><div class="brand-sub">{esc(project["name"])}</div></div>
  </a>
  <div class="sidebar-section">
    <div class="sidebar-section-label">Repositories</div>{sidebar}
  </div>
</aside>
<main class="main">
  <div class="repo-header">
    <a class="repo-back" href="index.html">← {esc(project["name"])}</a>
    <div class="repo-title">{esc(repo["name"])}</div>
    {desc_html}
    <div class="repo-tags">{tags_html}</div>
  </div>
  <div class="doc-sections">{doc_sections or "<p style='color:var(--text4);padding:0 44px'>No documents.</p>"}</div>
</main>
<script src="assets/site.js"></script>
</body></html>"""


# ── Routes ─────────────────────────────────────────────────────────────────────

def register(app):

    @app.get('/api/export/repository/<repo_id>/markdown')
    def export_markdown(repo_id):
        with get_conn() as conn:
            repo = conn.execute(
                'SELECT * FROM repositories WHERE id=?', (repo_id,)
            ).fetchone()
            if not repo:
                response.status = 404
                return {'success': False, 'error': 'Repository not found'}
            docs = conn.execute(
                'SELECT * FROM documents WHERE repository_id=? ORDER BY created_at ASC',
                (repo_id,)
            ).fetchall()
            docs = [dict(d) for d in docs]
            repo = dict(repo)

        lines = [
            f"# {repo['name']}",
            '',
            repo.get('description', ''),
            '',
            f"*Generated by DevDocs on {datetime.now().strftime('%Y-%m-%d')}*",
            '',
            '---',
            '',
            '## Table of Contents',
            '',
        ]
        for i, d in enumerate(docs, 1):
            lines.append(f"{i}. [{d['title']}](#{slug(d['title'])})")
        lines += ['', '---', '']
        for d in docs:
            lines.append(doc_to_markdown(d))

        md = '\n'.join(lines)
        response.content_type = 'text/markdown; charset=utf-8'
        response.headers['Content-Disposition'] = (
            f'attachment; filename="{slug(repo["name"])}.md"'
        )
        return md

    @app.get('/api/export/project/<project_id>/site')
    def export_site(project_id):
        with get_conn() as conn:
            project = conn.execute(
                'SELECT * FROM projects WHERE id=?', (project_id,)
            ).fetchone()
            if not project:
                response.status = 404
                return {'success': False, 'error': 'Project not found'}
            project = dict(project)

            repos = conn.execute(
                'SELECT r.*, COUNT(d.id) as doc_count FROM repositories r '
                'LEFT JOIN documents d ON d.repository_id=r.id '
                'WHERE r.project_id=? GROUP BY r.id ORDER BY r.name',
                (project_id,)
            ).fetchall()
            repos = [dict(r) for r in repos]

            # Fetch docs per repo
            for r in repos:
                docs = conn.execute(
                    'SELECT * FROM documents WHERE repository_id=? ORDER BY created_at',
                    (r['id'],)
                ).fetchall()
                r['docs'] = [dict(d) for d in docs]

        # Load site CSS and JS from static/site_template/ folder
        base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        css_path = os.path.join(base, 'static', 'site_template', 'site.css')
        js_path  = os.path.join(base, 'static', 'site_template', 'site.js')

        with open(css_path, 'r', encoding='utf-8') as f:
            site_css = f.read()
        with open(js_path, 'r', encoding='utf-8') as f:
            site_js = f.read()

        # Build ZIP in memory
        buf = io.BytesIO()
        proj_slug = slug(project['name'])
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(f'{proj_slug}/assets/site.css', site_css)
            zf.writestr(f'{proj_slug}/assets/site.js', site_js)
            zf.writestr(f'{proj_slug}/index.html', build_index_html(project, repos))
            for r in repos:
                html = build_repo_html(project, repos, r, r['docs'])
                zf.writestr(f'{proj_slug}/{slug(r["name"])}.html', html)

        buf.seek(0)
        response.content_type = 'application/zip'
        response.headers['Content-Disposition'] = (
            f'attachment; filename="{proj_slug}-docs.zip"'
        )
        return buf.read()
