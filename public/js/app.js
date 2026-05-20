// DevDocs — Main Application
// CodeMirror 6: loaded from self-hosted /js/cm-bundle.js (single IIFE, one @codemirror/state)
// Quill for rich text editors

// Destructure everything we need from the pre-built bundle (window.CM)
const {
  EditorView, EditorState,
  keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars,
  drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine,
  defaultKeymap, history, historyKeymap, indentWithTab,
  indentOnInput, syntaxHighlighting, defaultHighlightStyle,
  bracketMatching, foldGutter, foldKeymap,
  autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap,
  lintKeymap,
  javascript, python, html: htmlLang, css: cssLang,
  sql, json, xml, cpp, java, rust, php, markdown,
} = CM;

// ── CodeMirror setup ──────────────────────────────────────────────────────────
function makeCmExtensions(lang, height = '280px') {
  const langExt = {
    javascript: () => javascript({ jsx: true }),
    typescript: () => javascript({ typescript: true }),
    jsx:        () => javascript({ jsx: true }),
    tsx:        () => javascript({ typescript: true, jsx: true }),
    python:     () => python(),
    html:       () => htmlLang(),
    css:        () => cssLang(),
    sql:        () => sql(),
    json:       () => json(),
    xml:        () => xml(),
    cpp:        () => cpp(),
    java:       () => java(),
    rust:       () => rust(),
    php:        () => php(),
    markdown:   () => markdown(),
  }[lang];

  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
      indentWithTab,
    ]),
    langExt ? langExt() : javascript({ jsx: true }),
    EditorView.theme({
      '&': { height, fontSize: '13px', fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
      '.cm-scroller': { overflow: 'auto', lineHeight: '1.65' },
      '.cm-content': { padding: '10px 0' },
      '.cm-gutters': { background: '#f8f9fb', borderRight: '1px solid #e2e6ed', color: '#9ca3af' },
      '.cm-activeLineGutter': { background: '#eef2ff' },
      '.cm-activeLine': { background: 'rgba(79,70,229,0.04)' },
    }),
    EditorView.lineWrapping,
  ];
}

const ALL_LANGS = ['javascript','typescript','jsx','tsx','python','html','css','sql',
  'json','xml','cpp','java','rust','php','bash','markdown','go','ruby','yaml','other'];

function createEditor(parentEl, value = '', lang = 'javascript', height = '280px') {
  if (!parentEl) return null;
  const view = new EditorView({
    state: EditorState.create({ doc: value, extensions: makeCmExtensions(lang, height) }),
    parent: parentEl,
  });
  return view;
}

function setEditorLang(view, lang) {
  if (!view) return;
  const height = view.dom.style.height || '280px';
  view.setState(EditorState.create({
    doc: view.state.doc.toString(),
    extensions: makeCmExtensions(lang, height),
  }));
}

function getEditorValue(view) {
  return view?.state.doc.toString() || '';
}

// ── Quill rich text ───────────────────────────────────────────────────────────
const QUILL_TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ indent: '-1' }, { indent: '+1' }],
  ['blockquote', 'code-block'],
  ['link'],
  ['clean'],
];

function createQuill(containerId, initialHtml = '', height = '220px') {
  const el = document.getElementById(containerId);
  if (!el) return null;
  el.style.height = height;
  const q = new Quill(`#${containerId}`, {
    theme: 'snow',
    modules: { toolbar: QUILL_TOOLBAR },
    placeholder: 'Write here…',
  });
  if (initialHtml) q.root.innerHTML = initialHtml;
  return q;
}

function getQuillHtml(q) {
  if (!q) return '';
  const html = q.root.innerHTML;
  return html === '<p><br></p>' ? '' : html;
}

// ── App state ─────────────────────────────────────────────────────────────────
const state = {
  projects: [],
  currentProject: null,
  currentRepo: null,
  currentDocs: [],
  activeDocTab: 'all',
  editingProject: null,
  editingRepo: null,
  editingDoc: null,
  selectedEmoji: '📁',
  selectedColor: '#4f46e5',
  // CodeMirror instances
  cmInstances: {},
  // Quill instances
  quillInstances: {},
  // Page cells (for page doc type)
  pageCells: [],
};

// ── API ───────────────────────────────────────────────────────────────────────
const api = {
  async get(u) { return (await fetch(u)).json(); },
  async post(u, b) { return (await fetch(u, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b) })).json(); },
  async put(u, b) { return (await fetch(u, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b) })).json(); },
  async del(u) { return (await fetch(u, { method:'DELETE' })).json(); },
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  let box = document.getElementById('toastContainer');
  if (!box) { box = document.createElement('div'); box.id = 'toastContainer'; box.className = 'toast-container'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut 0.2s ease forwards'; setTimeout(() => t.remove(), 200); }, 2600);
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(id) {
  document.getElementById('modalOverlay').classList.add('active');
  const m = document.getElementById(id);
  m.style.display = 'flex';
  requestAnimationFrame(() => m.classList.add('active'));
}
function closeModal(id) {
  const m = document.getElementById(id);
  m.classList.remove('active');
  setTimeout(() => { if (!m.classList.contains('active')) m.style.display = 'none'; }, 180);
  if (!document.querySelectorAll('.modal.active').length) document.getElementById('modalOverlay').classList.remove('active');
}

// ── Destroy editors ───────────────────────────────────────────────────────────
function destroyEditors() {
  Object.values(state.cmInstances).forEach(v => { try { v.destroy(); } catch(e){} });
  state.cmInstances = {};
  Object.values(state.quillInstances).forEach(q => { try { q.disable(); } catch(e){} });
  state.quillInstances = {};
  state.pageCells = [];
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('collapsed'); }

async function loadProjects() {
  const res = await api.get('/api/projects');
  if (!res.success) return;
  state.projects = res.data;
  renderSidebarNav();
}

function renderSidebarNav() {
  const nav = document.getElementById('projectNav');
  if (!state.projects.length) {
    nav.innerHTML = `<div class="nav-empty">No projects yet.<br/>Create one to start.</div>`;
    return;
  }
  nav.innerHTML = state.projects.map(p => `
    <div class="project-item" id="pitem-${p._id}">
      <div class="project-header ${state.currentProject?._id === p._id ? 'active' : ''}"
           id="phdr-${p._id}" onclick="app.toggleProjectNav('${p._id}')">
        <span class="project-color-dot" style="background:${p.color}"></span>
        <span class="project-icon">${p.icon}</span>
        <span class="project-name" title="${esc(p.name)}">${esc(p.name)}</span>
        <svg class="project-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="project-repos ${state.currentProject?._id === p._id ? 'visible' : ''}" id="prepos-${p._id}">
        <div id="prepo-list-${p._id}"></div>
        <button class="repo-add-btn" onclick="app.openNewRepo('${p._id}',event)">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Repository
        </button>
      </div>
    </div>
  `).join('');
  if (state.currentProject) {
    document.getElementById(`phdr-${state.currentProject._id}`)?.classList.add('open');
    renderReposInNav(state.currentProject._id);
  }
}

async function renderReposInNav(projectId) {
  const listEl = document.getElementById(`prepo-list-${projectId}`);
  if (!listEl) return;
  const res = await api.get(`/api/repositories/project/${projectId}`);
  if (!res.success) return;
  if (!res.data.length) { listEl.innerHTML = `<div style="font-size:0.71rem;color:var(--text4);padding:4px 8px;">No repositories</div>`; return; }
  listEl.innerHTML = res.data.map(r => `
    <div class="repo-item-nav ${state.currentRepo?._id === r._id ? 'active' : ''}"
         onclick="app.navToRepo('${r._id}','${projectId}')">
      <span class="repo-dot"></span>${esc(r.name)}
    </div>`).join('');
}

async function toggleProjectNav(projectId) {
  const reposEl = document.getElementById(`prepos-${projectId}`);
  const hdr = document.getElementById(`phdr-${projectId}`);
  if (!reposEl) return;
  const isOpen = reposEl.classList.contains('visible');
  if (isOpen) { reposEl.classList.remove('visible'); hdr?.classList.remove('open'); return; }
  reposEl.classList.add('visible');
  hdr?.classList.add('open');
  await renderReposInNav(projectId);
  const project = state.projects.find(p => p._id === projectId);
  if (project) viewProject(project);
}

async function navToRepo(repoId, projectId) {
  const [repoRes, projRes] = await Promise.all([api.get(`/api/repositories/${repoId}`), api.get(`/api/projects/${projectId}`)]);
  if (repoRes.success && projRes.success) {
    state.currentProject = projRes.data;
    await viewRepository(repoRes.data);
    renderSidebarNav();
    renderReposInNav(projectId);
  }
}

// ── Project CRUD ──────────────────────────────────────────────────────────────
function openNewProject() {
  state.editingProject = null;
  state.selectedEmoji = '📁'; state.selectedColor = '#4f46e5';
  document.getElementById('projectModalTitle').textContent = 'New Project';
  document.getElementById('projectName').value = '';
  document.getElementById('projectDesc').value = '';
  document.getElementById('saveProjectBtn').textContent = 'Create Project';
  syncPickers('📁', '#4f46e5');
  openModal('projectModal');
  setTimeout(() => document.getElementById('projectName').focus(), 120);
}
function openEditProject(project, e) {
  e?.stopPropagation();
  state.editingProject = project;
  state.selectedEmoji = project.icon; state.selectedColor = project.color;
  document.getElementById('projectModalTitle').textContent = 'Edit Project';
  document.getElementById('projectName').value = project.name;
  document.getElementById('projectDesc').value = project.description;
  document.getElementById('saveProjectBtn').textContent = 'Save Changes';
  syncPickers(project.icon, project.color);
  openModal('projectModal');
}
function syncPickers(emoji, color) {
  document.querySelectorAll('.emoji-option').forEach(el => el.classList.toggle('selected', el.dataset.emoji === emoji));
  document.querySelectorAll('.color-option').forEach(el => el.classList.toggle('selected', el.dataset.color === color));
}
async function saveProject() {
  const name = document.getElementById('projectName').value.trim();
  const description = document.getElementById('projectDesc').value.trim();
  if (!name) { toast('Project name is required', 'error'); return; }
  const payload = { name, description, icon: state.selectedEmoji, color: state.selectedColor };
  const res = state.editingProject ? await api.put(`/api/projects/${state.editingProject._id}`, payload) : await api.post('/api/projects', payload);
  if (!res.success) { toast(res.error || 'Failed', 'error'); return; }
  toast(state.editingProject ? 'Project updated' : 'Project created!', 'success');
  closeModal('projectModal');
  await loadProjects();
  if (!state.editingProject) viewProject(res.data);
  else if (state.currentProject?._id === res.data._id) { state.currentProject = res.data; viewProject(res.data); }
}
function confirmDeleteProject(project, e) {
  e?.stopPropagation();
  document.getElementById('confirmMessage').textContent = `Delete "${project.name}" and all its content? This cannot be undone.`;
  document.getElementById('confirmDeleteBtn').onclick = async () => {
    const res = await api.del(`/api/projects/${project._id}`);
    if (!res.success) { toast('Failed', 'error'); return; }
    toast('Project deleted', 'success'); closeModal('confirmModal');
    if (state.currentProject?._id === project._id) { state.currentProject = null; state.currentRepo = null; goHome(); }
    await loadProjects();
  };
  openModal('confirmModal');
}

// ── Project view ──────────────────────────────────────────────────────────────
async function viewProject(project) {
  destroyEditors();
  state.currentProject = project; state.currentRepo = null;
  const reposRes = await api.get(`/api/repositories/project/${project._id}`);
  const repos = reposRes.success ? reposRes.data : [];
  const totalDocs = repos.reduce((s, r) => s + (r.docCount || 0), 0);
  setContent(`
    <div class="topbar">
      ${openSidebarBtn()}
      <div class="topbar-left">
        <div class="breadcrumb">
          <span class="breadcrumb-link" onclick="app.goHome()">Home</span>
          <span class="breadcrumb-sep">›</span>
          <span class="breadcrumb-current">${esc(project.name)}</span>
        </div>
      </div>
      <div class="topbar-right">
        <button class="btn-secondary" onclick="app.openEditProject(app.getProject())">${iconEdit()} Edit</button>
        <button class="btn-ghost" style="color:var(--red)" onclick="app.confirmDeleteProject(app.getProject())">${iconDelete()} Delete</button>
      </div>
    </div>
    <div class="page">
      <div class="page-header">
        <div class="page-title-block">
          <div class="page-title"><span class="page-title-icon">${project.icon}</span>${esc(project.name)}</div>
          ${project.description ? `<div class="page-desc">${esc(project.description)}</div>` : ''}
        </div>
        <div class="page-actions">
          <button class="btn-primary" onclick="app.openNewRepo('${project._id}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Repository
          </button>
        </div>
      </div>
      <div class="stats-bar">
        <div class="stat-item"><div class="stat-value">${repos.length}</div><div class="stat-label">Repositories</div></div>
        <div class="stat-item"><div class="stat-value">${totalDocs}</div><div class="stat-label">Documents</div></div>
      </div>
      <div class="repo-grid">
        ${repos.map(r => repoCard(r)).join('')}
        <div class="add-card" onclick="app.openNewRepo('${project._id}')">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Repository
        </div>
      </div>
    </div>`);
}

function repoCard(r) {
  const tags = (r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
  return `
    <div class="repo-card" onclick="app.openRepo('${r._id}')">
      <div class="repo-card-top">
        <div class="repo-card-icon">🗂️</div>
        <div class="repo-card-actions-top">
          <button class="btn-icon" onclick="app.openEditRepo('${r._id}',event)" title="Edit">${iconEdit()}</button>
          <button class="btn-icon danger" onclick="app.confirmDeleteRepo('${r._id}','${esc(r.name)}',event)" title="Delete">${iconDelete()}</button>
        </div>
      </div>
      <div class="repo-card-name">${esc(r.name)}</div>
      <div class="repo-card-desc">${esc(r.description || 'No description')}</div>
      <div class="repo-card-footer"><div class="doc-count">${r.docCount || 0} document${r.docCount !== 1 ? 's' : ''}</div></div>
      ${tags ? `<div class="tag-list">${tags}</div>` : ''}
    </div>`;
}

// ── Repo CRUD ─────────────────────────────────────────────────────────────────
function openNewRepo(projectId, e) {
  e?.stopPropagation();
  state.editingRepo = null;
  document.getElementById('repoModalTitle').textContent = 'New Repository';
  document.getElementById('repoName').value = '';
  document.getElementById('repoDesc').value = '';
  document.getElementById('repoTags').value = '';
  document.getElementById('repoModal').dataset.projectId = projectId || state.currentProject?._id;
  openModal('repoModal');
  setTimeout(() => document.getElementById('repoName').focus(), 120);
}
async function openEditRepo(repoId, e) {
  e?.stopPropagation();
  const res = await api.get(`/api/repositories/${repoId}`);
  if (!res.success) return;
  const r = res.data; state.editingRepo = r;
  document.getElementById('repoModalTitle').textContent = 'Edit Repository';
  document.getElementById('repoName').value = r.name;
  document.getElementById('repoDesc').value = r.description;
  document.getElementById('repoTags').value = (r.tags || []).join(', ');
  openModal('repoModal');
}
async function saveRepository() {
  const name = document.getElementById('repoName').value.trim();
  const description = document.getElementById('repoDesc').value.trim();
  const tags = document.getElementById('repoTags').value.split(',').map(t => t.trim()).filter(Boolean);
  if (!name) { toast('Repository name is required', 'error'); return; }
  let res;
  if (state.editingRepo) {
    res = await api.put(`/api/repositories/${state.editingRepo._id}`, { name, description, tags });
  } else {
    const projectId = document.getElementById('repoModal').dataset.projectId;
    res = await api.post('/api/repositories', { projectId, name, description, tags });
  }
  if (!res.success) { toast(res.error || 'Failed', 'error'); return; }
  toast(state.editingRepo ? 'Repository updated' : 'Repository created!', 'success');
  closeModal('repoModal');
  if (state.currentProject) { await viewProject(state.currentProject); renderReposInNav(state.currentProject._id); }
  if (!state.editingRepo) viewRepository(res.data);
}
async function openRepo(repoId) {
  const res = await api.get(`/api/repositories/${repoId}`);
  if (!res.success) return;
  await viewRepository(res.data);
  renderSidebarNav();
  if (state.currentProject) renderReposInNav(state.currentProject._id);
}
async function confirmDeleteRepo(repoId, repoName, e) {
  e?.stopPropagation();
  document.getElementById('confirmMessage').textContent = `Delete repository "${repoName}" and all its documents?`;
  document.getElementById('confirmDeleteBtn').onclick = async () => {
    const res = await api.del(`/api/repositories/${repoId}`);
    if (!res.success) { toast('Failed', 'error'); return; }
    toast('Repository deleted', 'success'); closeModal('confirmModal');
    if (state.currentRepo?._id === repoId) { state.currentRepo = null; if (state.currentProject) viewProject(state.currentProject); }
    else if (state.currentProject) viewProject(state.currentProject);
    if (state.currentProject) renderReposInNav(state.currentProject._id);
  };
  openModal('confirmModal');
}

// ── Repository view ───────────────────────────────────────────────────────────
async function viewRepository(repo) {
  destroyEditors();
  state.currentRepo = repo; state.activeDocTab = 'all';
  const docsRes = await api.get(`/api/documents/repository/${repo._id}`);
  state.currentDocs = docsRes.success ? docsRes.data : [];
  renderRepoPage();
}

function renderRepoPage() {
  const repo = state.currentRepo, project = state.currentProject;
  const tags = (repo.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');
  setContent(`
    <div class="topbar">
      ${openSidebarBtn()}
      <div class="topbar-left">
        <div class="breadcrumb">
          <span class="breadcrumb-link" onclick="app.goHome()">Home</span>
          <span class="breadcrumb-sep">›</span>
          ${project ? `<span class="breadcrumb-link" onclick="app.viewProject(app.getProject())">${esc(project.name)}</span><span class="breadcrumb-sep">›</span>` : ''}
          <span class="breadcrumb-current">${esc(repo.name)}</span>
        </div>
      </div>
      <div class="topbar-right">
        <button class="btn-primary" onclick="app.goToNewDoc()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Document
        </button>
        <button class="btn-secondary" onclick="app.openEditRepo('${repo._id}')">${iconEdit()} Edit</button>
        <button class="btn-icon danger" onclick="app.confirmDeleteRepo('${repo._id}','${esc(repo.name)}')" title="Delete">${iconDelete()}</button>
      </div>
    </div>
    <div class="page">
      <div class="page-header">
        <div class="page-title-block">
          <div class="page-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--accent)"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 9h8M8 13h6"/></svg>
            ${esc(repo.name)}
          </div>
          ${repo.description ? `<div class="page-desc">${esc(repo.description)}</div>` : ''}
          ${tags ? `<div class="tag-list" style="margin-top:8px">${tags}</div>` : ''}
        </div>
      </div>
      <div class="tab-bar" id="docTabs">${renderDocTabs()}</div>
      <div id="docListContainer">${renderDocList()}</div>
    </div>`);
  highlightAll();
}

function renderDocTabs() {
  const types = [
    {key:'all',label:'All',icon:'◈'},{key:'overview',label:'Overview',icon:'📋'},
    {key:'code',label:'Code',icon:'💻'},{key:'example',label:'Example',icon:'🔬'},
    {key:'changelog',label:'Changelog',icon:'🔄'},{key:'algorithm',label:'Algorithm',icon:'⚡'},
    {key:'guide',label:'Guide',icon:'📖'},{key:'page',label:'Page',icon:'📄'},
  ];
  return types.map(t => {
    const count = t.key === 'all' ? state.currentDocs.length : state.currentDocs.filter(d => d.type === t.key).length;
    return `<button class="tab-btn ${state.activeDocTab === t.key ? 'active' : ''}" onclick="app.switchDocTab('${t.key}')">
      ${t.icon} ${t.label} <span class="tab-count">${count}</span>
    </button>`;
  }).join('');
}

function switchDocTab(tab) {
  state.activeDocTab = tab;
  document.getElementById('docTabs').innerHTML = renderDocTabs();
  document.getElementById('docListContainer').innerHTML = renderDocList();
  highlightAll();
}

function renderDocList() {
  const filtered = state.activeDocTab === 'all' ? state.currentDocs : state.currentDocs.filter(d => d.type === state.activeDocTab);
  if (!filtered.length) return `<div class="empty-state">
    <div class="empty-state-icon">📭</div>
    <div class="empty-state-title">No documents here</div>
    <div class="empty-state-desc">Add your first document to get started</div>
    <button class="btn-primary" onclick="app.goToNewDoc()">Add Document</button>
  </div>`;
  return `<div class="doc-list">${filtered.map(renderDocCard).join('')}</div>`;
}

function renderDocCard(doc) {
  const info = docTypeInfo(doc.type);
  const date = new Date(doc.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `
    <div class="doc-card" id="doc-${doc._id}">
      <div class="doc-card-header" onclick="app.toggleDoc('${doc._id}')">
        <div class="doc-card-left">
          <span class="doc-type-badge type-${doc.type}">${info.icon} ${info.label}</span>
          <span class="doc-card-title">${esc(doc.title)}</span>
        </div>
        <div class="doc-card-right">
          <span class="doc-card-date">${date}</span>
          <div class="doc-card-actions">
            <button class="btn-icon" onclick="app.goToEditDoc('${doc._id}',event)" title="Edit">${iconEdit()}</button>
            <button class="btn-icon danger" onclick="app.confirmDeleteDoc('${doc._id}','${esc(doc.title)}',event)" title="Delete">${iconDelete()}</button>
          </div>
          <svg class="doc-chevron" id="chevron-${doc._id}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>
      <div class="doc-card-body" id="body-${doc._id}">${renderDocContent(doc)}</div>
    </div>`;
}

function toggleDoc(docId) {
  const body = document.getElementById(`body-${docId}`);
  const chevron = document.getElementById(`chevron-${docId}`);
  const expanded = body.classList.toggle('expanded');
  if (chevron) chevron.style.transform = expanded ? 'rotate(180deg)' : '';
  if (expanded) highlightAll();
}

// ── Doc content renderers (read view) ─────────────────────────────────────────
function renderDocContent(doc) {
  switch (doc.type) {
    case 'code':      return renderCodeDoc(doc);
    case 'example':   return renderExampleDoc(doc);
    case 'changelog': return renderChangelogDoc(doc);
    case 'algorithm': return renderAlgorithmDoc(doc);
    case 'guide':     return renderGuideDoc(doc);
    case 'page':      return renderPageDoc(doc);
    default:          return renderOverviewDoc(doc);
  }
}

function renderOverviewDoc(doc) {
  return `<div class="doc-content">
    <div class="prose">${doc.content || '<em style="color:var(--text4)">No content</em>'}</div>
  </div>`;
}

function renderCodeDoc(doc) {
  const m = doc.metadata || {};
  const lang = m.language || 'javascript';
  return `<div class="doc-content">
    ${(m.why || m.how) ? `<div class="why-how-grid">
      ${m.why ? `<div class="why-block"><div class="why-how-label">Why this change</div><div class="why-how-content">${m.why}</div></div>` : ''}
      ${m.how ? `<div class="how-block"><div class="why-how-label">How to use</div><div class="why-how-content">${m.how}</div></div>` : ''}
    </div>` : ''}
    ${doc.content ? codeBlock(doc.content, lang) : ''}
    ${m.notes ? `<div class="notes-block"><strong>Notes</strong>${m.notes}</div>` : ''}
  </div>`;
}

function renderExampleDoc(doc) {
  const m = doc.metadata || {};
  const lang = m.language || 'javascript';
  return `<div class="example-block">
    ${doc.content ? `<div class="example-section"><div class="example-section-label">Description</div><div class="prose">${doc.content}</div></div>` : ''}
    ${m.inputCode ? `<div class="example-section"><div class="example-section-label">Input / Before</div>${codeBlock(m.inputCode, lang)}</div>` : ''}
    ${m.outputCode ? `<div class="example-section"><div class="example-section-label">Output / After</div>${codeBlock(m.outputCode, lang)}</div>` : ''}
    ${m.expectedOutput ? `<div class="example-section"><div class="example-section-label">Expected Result</div><div class="expected-output">${esc(m.expectedOutput)}</div></div>` : ''}
  </div>`;
}

function renderChangelogDoc(doc) {
  const m = doc.metadata || {};
  return `<div class="changelog-entries">
    ${doc.content ? `<div class="prose" style="margin-bottom:14px">${doc.content}</div>` : ''}
    ${(m.entries || []).map(e => `<div class="changelog-entry">
      <div><span class="changelog-version">${esc(e.version || '')}</span>${e.date ? `<span class="changelog-date">${esc(e.date)}</span>` : ''}</div>
      <ul class="changelog-changes">
        ${(e.changes || []).map(c => `<li class="change-${c.type || 'added'}">${esc(c.text)}</li>`).join('')}
      </ul>
    </div>`).join('')}
  </div>`;
}

function renderAlgorithmDoc(doc) {
  const m = doc.metadata || {};
  const lang = m.language || 'javascript';
  return `<div class="algo-steps">
    ${doc.content ? `<div class="prose" style="margin-bottom:18px">${doc.content}</div>` : ''}
    ${(m.steps || []).map((s, i) => `<div class="algo-step">
      <div class="algo-step-num">${String(i + 1).padStart(2, '0')}</div>
      <div class="algo-step-content">
        ${s.title ? `<div class="algo-step-title">${esc(s.title)}</div>` : ''}
        ${s.description ? `<div class="algo-step-desc">${esc(s.description)}</div>` : ''}
        ${s.code ? codeBlock(s.code, lang) : ''}
      </div>
    </div>`).join('')}
    ${(m.timeComplexity || m.spaceComplexity) ? `<div class="algo-complexity">
      ${m.timeComplexity ? `<div class="complexity-badge"><span class="complexity-label">Time</span><span class="complexity-value">${esc(m.timeComplexity)}</span></div>` : ''}
      ${m.spaceComplexity ? `<div class="complexity-badge"><span class="complexity-label">Space</span><span class="complexity-value">${esc(m.spaceComplexity)}</span></div>` : ''}
    </div>` : ''}
  </div>`;
}

function renderGuideDoc(doc) {
  const m = doc.metadata || {};
  const lang = m.language || 'bash';
  return `<div class="doc-content">
    ${doc.content ? `<div class="prose" style="margin-bottom:16px">${doc.content}</div>` : ''}
    ${m.prerequisites ? `<div class="notes-block" style="border-left:3px solid var(--yellow);background:var(--yellow-bg);margin-bottom:16px"><strong style="color:var(--yellow)">Prerequisites</strong>${m.prerequisites}</div>` : ''}
    ${(m.steps || []).map((s, i) => `<div class="algo-step" style="margin-bottom:16px">
      <div class="algo-step-num" style="background:#f0fdfa;border-color:#99f6e4;color:var(--teal)">${i + 1}</div>
      <div class="algo-step-content">
        ${s.title ? `<div class="algo-step-title">${esc(s.title)}</div>` : ''}
        ${s.description ? `<div class="algo-step-desc">${esc(s.description)}</div>` : ''}
        ${s.code ? codeBlock(s.code, lang) : ''}
      </div>
    </div>`).join('')}
  </div>`;
}

function renderPageDoc(doc) {
  const cells = doc.metadata?.cells || [];
  if (!cells.length) return `<div class="doc-content"><em style="color:var(--text4)">Empty page — no cells added yet.</em></div>`;
  const html = `<div class="page-doc-view">${cells.map((cell, i) => {
    if (cell.type === 'text') {
      return `<div class="page-cell-view page-cell-text">${cell.content || ''}</div>`;
    } else {
      const lang = cell.language || 'javascript';
      return `<div class="page-cell-view page-cell-code">${codeBlock(cell.content || '', lang)}</div>`;
    }
  }).join('')}</div>`;
  // Highlight after a tick so the DOM is ready
  setTimeout(() => highlightAll(), 80);
  return html;
}

function codeBlock(code, lang) {
  return `<div class="code-block">
    <div class="code-block-header">
      <span class="code-lang-label">${esc(lang)}</span>
      <button class="copy-btn" onclick="app.copyCode(this)">Copy</button>
    </div>
    <pre><code class="language-${esc(lang)}">${esc(code)}</code></pre>
  </div>`;
}

// ── Doc type definitions ──────────────────────────────────────────────────────
const DOC_TYPES = [
  { key: 'overview',  label: 'Overview',  icon: '📋' },
  { key: 'code',      label: 'Code',      icon: '💻' },
  { key: 'example',   label: 'Example',   icon: '🔬' },
  { key: 'changelog', label: 'Changelog', icon: '🔄' },
  { key: 'algorithm', label: 'Algorithm', icon: '⚡' },
  { key: 'guide',     label: 'Guide',     icon: '📖' },
  { key: 'page',      label: 'Page',      icon: '📄' },
];

// ── Editor navigation ─────────────────────────────────────────────────────────
async function goToNewDoc() {
  destroyEditors();
  state.editingDoc = null;
  renderEditorPage('overview', null);
}
async function goToEditDoc(docId, e) {
  e?.stopPropagation();
  const res = await api.get(`/api/documents/${docId}`);
  if (!res.success) return;
  state.editingDoc = res.data;
  destroyEditors();
  renderEditorPage(res.data.type, res.data);
}

function renderEditorPage(selectedType, doc) {
  const repo = state.currentRepo, project = state.currentProject;
  const isEdit = !!doc;
  setContent(`
    <div class="topbar">
      ${openSidebarBtn()}
      <div class="topbar-left">
        <div class="breadcrumb">
          <span class="breadcrumb-link" onclick="app.goHome()">Home</span>
          <span class="breadcrumb-sep">›</span>
          ${project ? `<span class="breadcrumb-link" onclick="app.viewProject(app.getProject())">${esc(project.name)}</span><span class="breadcrumb-sep">›</span>` : ''}
          ${repo ? `<span class="breadcrumb-link" onclick="app.openRepo('${repo._id}')">${esc(repo.name)}</span><span class="breadcrumb-sep">›</span>` : ''}
          <span class="breadcrumb-current">${isEdit ? 'Edit Document' : 'New Document'}</span>
        </div>
      </div>
      <div class="topbar-right">
        <button class="btn-ghost" onclick="app.openRepo('${repo?._id}')">Cancel</button>
        <button class="btn-primary" id="saveDocBtn" onclick="app.saveDocument()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Save Document
        </button>
      </div>
    </div>
    <div class="editor-page">
      <div class="editor-layout">
        <div class="editor-type-sidebar">
          <div class="type-sidebar-label">Document Type</div>
          ${DOC_TYPES.map(t => `
            <div class="type-option ${selectedType === t.key ? 'active' : ''}" id="type-opt-${t.key}" onclick="app.switchEditorType('${t.key}')">
              <span class="type-option-icon">${t.icon}</span>
              <span class="type-option-label">${t.label}</span>
            </div>`).join('')}
        </div>
        <div class="editor-form-area" id="editorFormArea">
          <input type="text" class="editor-title-input" id="docTitle"
                 placeholder="Document title…" value="${esc(doc?.title || '')}" />
          <div id="docTypeFields"></div>
        </div>
      </div>
    </div>`);
  renderEditorFields(selectedType, doc);
}

function switchEditorType(type) {
  document.querySelectorAll('.type-option').forEach(el => el.classList.remove('active'));
  document.getElementById(`type-opt-${type}`)?.classList.add('active');
  destroyEditors();
  renderEditorFields(type, state.editingDoc?.type === type ? state.editingDoc : null);
}

// ── Editor fields ─────────────────────────────────────────────────────────────
function renderEditorFields(type, doc) {
  const m = doc?.metadata || {};
  const container = document.getElementById('docTypeFields');
  container.dataset.currentType = type;

  if (type === 'overview') {
    container.innerHTML = `<div class="form-field">
      <label class="form-label">Content</label>
      <div id="quill-overview" class="quill-editor-wrap"></div>
    </div>`;
    requestAnimationFrame(() => {
      state.quillInstances.overview = createQuill('quill-overview', doc?.content || '', '360px');
    });

  } else if (type === 'code') {
    const lang = m.language || 'javascript';
    container.innerHTML = `
      <div class="form-row" style="margin-bottom:18px">
        <div class="form-field">
          <label class="form-label">Why this change? <span class="form-hint">(optional)</span></label>
          <div id="quill-why" class="quill-editor-wrap"></div>
        </div>
        <div class="form-field">
          <label class="form-label">How to use? <span class="form-hint">(optional)</span></label>
          <div id="quill-how" class="quill-editor-wrap"></div>
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Code</label>
        <div class="cm-wrapper">
          <div class="cm-lang-bar">
            <span class="cm-lang-bar-label">Language</span>
            <select id="codeLang" onchange="app.changeCodeLang('mainCode',this.value)">
              ${langOptions(lang)}
            </select>
          </div>
          <div id="cm-mainCode"></div>
        </div>
      </div>
      <div class="form-field" style="margin-top:16px">
        <label class="form-label">Notes <span class="form-hint">(optional)</span></label>
        <div id="quill-notes" class="quill-editor-wrap"></div>
      </div>`;
    requestAnimationFrame(() => {
      state.quillInstances.why   = createQuill('quill-why',   m.why   || '', '140px');
      state.quillInstances.how   = createQuill('quill-how',   m.how   || '', '140px');
      state.quillInstances.notes = createQuill('quill-notes', m.notes || '', '120px');
      state.cmInstances.mainCode = createEditor(document.getElementById('cm-mainCode'), doc?.content || '', lang, '320px');
    });

  } else if (type === 'example') {
    const lang = m.language || 'javascript';
    container.innerHTML = `
      <div class="form-field">
        <label class="form-label">Description</label>
        <div id="quill-desc" class="quill-editor-wrap"></div>
      </div>
      <div class="form-field" style="margin-top:14px">
        <label class="form-label">Language</label>
        <select class="form-input" id="exampleLang" style="width:auto" onchange="app.changeExampleLang(this.value)">
          ${langOptions(lang)}
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">Input / Before Code</label>
        <div class="cm-wrapper"><div id="cm-inputCode"></div></div>
      </div>
      <div class="form-field">
        <label class="form-label">Output / After Code</label>
        <div class="cm-wrapper"><div id="cm-outputCode"></div></div>
      </div>
      <div class="form-field">
        <label class="form-label">Expected Result <span class="form-hint">(optional)</span></label>
        <input type="text" class="form-input" id="docExpected" placeholder="e.g. { status: 200 }" value="${esc(m.expectedOutput || '')}" />
      </div>`;
    requestAnimationFrame(() => {
      state.quillInstances.desc = createQuill('quill-desc', doc?.content || '', '140px');
      state.cmInstances.inputCode  = createEditor(document.getElementById('cm-inputCode'),  m.inputCode  || '', lang, '220px');
      state.cmInstances.outputCode = createEditor(document.getElementById('cm-outputCode'), m.outputCode || '', lang, '220px');
    });

  } else if (type === 'changelog') {
    const entries = m.entries || [{ version: '', date: '', changes: [{ type: 'added', text: '' }] }];
    container.innerHTML = `
      <div class="form-field">
        <label class="form-label">Summary <span class="form-hint">(optional)</span></label>
        <div id="quill-summary" class="quill-editor-wrap"></div>
      </div>
      <div id="changelogEntries" style="margin-top:14px">
        ${entries.map((e, i) => renderChangelogEntryForm(e, i)).join('')}
      </div>
      <button class="add-step-btn" onclick="app.addChangelogEntry()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Version Entry
      </button>`;
    requestAnimationFrame(() => {
      state.quillInstances.summary = createQuill('quill-summary', doc?.content || '', '120px');
    });

  } else if (type === 'algorithm') {
    const steps = m.steps || [{ title: '', description: '', code: '' }];
    const lang = m.language || 'javascript';
    container.innerHTML = `
      <div class="form-field">
        <label class="form-label">Algorithm Overview</label>
        <div id="quill-overview" class="quill-editor-wrap"></div>
      </div>
      <div class="form-field" style="margin-top:14px">
        <label class="form-label">Language (for code steps)</label>
        <select class="form-input" id="algoLang" style="width:auto">${langOptions(lang)}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Steps</label>
        <div class="step-builder" id="stepBuilder">
          ${steps.map((s, i) => renderStepForm(s, i)).join('')}
        </div>
        <button class="add-step-btn" style="margin-top:8px" onclick="app.addStep()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Step
        </button>
      </div>
      <div class="form-row" style="margin-top:4px">
        <div class="form-field">
          <label class="form-label">Time Complexity</label>
          <input type="text" class="form-input" id="timeComplexity" placeholder="O(n log n)" value="${esc(m.timeComplexity || '')}" />
        </div>
        <div class="form-field">
          <label class="form-label">Space Complexity</label>
          <input type="text" class="form-input" id="spaceComplexity" placeholder="O(n)" value="${esc(m.spaceComplexity || '')}" />
        </div>
      </div>`;
    requestAnimationFrame(() => {
      state.quillInstances.overview = createQuill('quill-overview', doc?.content || '', '140px');
      steps.forEach((s, i) => {
        if (s.code) {
          const el = document.getElementById(`cm-step-${i}`);
          if (el) {
            el.closest('.step-code-area').classList.add('visible');
            document.getElementById(`step-code-toggle-${i}`).textContent = '▲ Hide code';
            state.cmInstances[`step-${i}`] = createEditor(el, s.code, lang, '160px');
          }
        }
      });
    });

  } else if (type === 'guide') {
    const steps = m.steps || [{ title: '', description: '', code: '' }];
    const lang = m.language || 'bash';
    container.innerHTML = `
      <div class="form-field">
        <label class="form-label">Introduction</label>
        <div id="quill-intro" class="quill-editor-wrap"></div>
      </div>
      <div class="form-field" style="margin-top:14px">
        <label class="form-label">Prerequisites <span class="form-hint">(optional)</span></label>
        <div id="quill-prereqs" class="quill-editor-wrap"></div>
      </div>
      <div class="form-field">
        <label class="form-label">Language (for code blocks)</label>
        <select class="form-input" id="guideLang" style="width:auto">${langOptions(lang)}</select>
      </div>
      <div class="form-field">
        <label class="form-label">Steps</label>
        <div class="step-builder" id="stepBuilder">
          ${steps.map((s, i) => renderStepForm(s, i)).join('')}
        </div>
        <button class="add-step-btn" style="margin-top:8px" onclick="app.addStep()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Step
        </button>
      </div>`;
    requestAnimationFrame(() => {
      state.quillInstances.intro   = createQuill('quill-intro',   doc?.content || '', '140px');
      state.quillInstances.prereqs = createQuill('quill-prereqs', m.prerequisites || '', '100px');
      steps.forEach((s, i) => {
        if (s.code) {
          const el = document.getElementById(`cm-step-${i}`);
          if (el) {
            el.closest('.step-code-area').classList.add('visible');
            document.getElementById(`step-code-toggle-${i}`).textContent = '▲ Hide code';
            state.cmInstances[`step-${i}`] = createEditor(el, s.code, lang, '160px');
          }
        }
      });
    });

  } else if (type === 'page') {
    const cells = m.cells || [];
    // Assign stable IDs — reset counter so edit mode starts from a known base
    pageCellCounter = 1000;
    state.pageCells = cells.map((c) => ({ ...c, id: pageCellCounter++ }));

    // Build wrapper divs for each existing cell inline so mountPageCell finds them
    const wrappersHtml = state.pageCells.map(cell =>
      `<div id="page-cell-${cell.id}" class="page-cell-wrapper"></div>`
    ).join('');

    container.innerHTML = `
      <div class="page-editor-toolbar">
        <button class="page-add-btn text-btn" onclick="app.addPageCell('text')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h7"/></svg>
          Add Text Block
        </button>
        <button class="page-add-btn code-btn" onclick="app.addPageCell('code')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          Add Code Block
        </button>
      </div>
      <div id="pageCellList" class="page-cell-list">
        ${state.pageCells.length === 0
          ? `<div class="page-empty-hint">Click "Add Text Block" or "Add Code Block" to start building your page.</div>`
          : wrappersHtml}
      </div>`;

    // Mount each cell — wrappers are now in the DOM
    requestAnimationFrame(() => {
      state.pageCells.forEach((cell) => mountPageCell(cell));
    });
  }
}

// ── Page cell system ──────────────────────────────────────────────────────────
let pageCellCounter = 0;

function addPageCell(type) {
  const id = pageCellCounter++;
  const cell = { id, type, content: '', language: 'javascript' };
  state.pageCells.push(cell);
  const list = document.getElementById('pageCellList');

  // Remove empty hint if present
  const hint = list.querySelector('.page-empty-hint');
  if (hint) hint.remove();

  // Create wrapper first, then mount
  const wrapper = document.createElement('div');
  wrapper.id = `page-cell-${id}`;
  wrapper.className = 'page-cell-wrapper';
  list.appendChild(wrapper);
  mountPageCell(cell);
}

function mountPageCell(cell) {
  const wrapper = document.getElementById(`page-cell-${cell.id}`);
  if (!wrapper) return;

  if (cell.type === 'text') {
    wrapper.innerHTML = `
      <div class="page-cell page-cell-text-editor">
        <div class="page-cell-controls">
          <span class="page-cell-type-badge">Text</span>
          <div class="page-cell-ctrl-btns">
            <button class="btn-icon" onclick="app.movePageCell(${cell.id},-1)" title="Move up">↑</button>
            <button class="btn-icon" onclick="app.movePageCell(${cell.id},1)"  title="Move down">↓</button>
            <button class="btn-icon danger" onclick="app.removePageCell(${cell.id})" title="Delete">${iconDelete()}</button>
          </div>
        </div>
        <div id="quill-cell-${cell.id}" class="quill-editor-wrap"></div>
      </div>`;
    requestAnimationFrame(() => {
      state.quillInstances[`cell-${cell.id}`] = createQuill(`quill-cell-${cell.id}`, cell.content || '', '180px');
    });

  } else {
    const lang = cell.language || 'javascript';
    wrapper.innerHTML = `
      <div class="page-cell page-cell-code-editor">
        <div class="page-cell-controls">
          <span class="page-cell-type-badge code">Code</span>
          <div style="display:flex;align-items:center;gap:8px">
            <select class="cm-lang-select" onchange="app.changePageCellLang(${cell.id},this.value)">
              ${langOptions(lang)}
            </select>
            <div class="page-cell-ctrl-btns">
              <button class="btn-icon" onclick="app.movePageCell(${cell.id},-1)" title="Move up">↑</button>
              <button class="btn-icon" onclick="app.movePageCell(${cell.id},1)"  title="Move down">↓</button>
              <button class="btn-icon danger" onclick="app.removePageCell(${cell.id})" title="Delete">${iconDelete()}</button>
            </div>
          </div>
        </div>
        <div class="cm-wrapper" style="border-radius:0 0 var(--radius) var(--radius)">
          <div id="cm-cell-${cell.id}"></div>
        </div>
      </div>`;
    requestAnimationFrame(() => {
      const el = document.getElementById(`cm-cell-${cell.id}`);
      if (el) state.cmInstances[`cell-${cell.id}`] = createEditor(el, cell.content || '', lang, '220px');
    });
  }
}

function movePageCell(cellId, direction) {
  const idx = state.pageCells.findIndex(c => c.id === cellId);
  if (idx < 0) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= state.pageCells.length) return;
  // Swap
  [state.pageCells[idx], state.pageCells[newIdx]] = [state.pageCells[newIdx], state.pageCells[idx]];
  // Re-render the list by reordering DOM elements
  const list = document.getElementById('pageCellList');
  const cells = [...list.querySelectorAll('.page-cell-wrapper')];
  const a = document.getElementById(`page-cell-${cellId}`);
  const b = document.getElementById(`page-cell-${state.pageCells[idx].id}`);
  if (direction === -1) list.insertBefore(a, b);
  else list.insertBefore(b, a);
}

function removePageCell(cellId) {
  // Destroy editors
  if (state.cmInstances[`cell-${cellId}`]) { state.cmInstances[`cell-${cellId}`].destroy(); delete state.cmInstances[`cell-${cellId}`]; }
  if (state.quillInstances[`cell-${cellId}`]) { delete state.quillInstances[`cell-${cellId}`]; }
  state.pageCells = state.pageCells.filter(c => c.id !== cellId);
  document.getElementById(`page-cell-${cellId}`)?.remove();
  if (!state.pageCells.length) {
    const list = document.getElementById('pageCellList');
    if (list) list.innerHTML = `<div class="page-empty-hint">Click "Add Text Block" or "Add Code Block" to start building your page.</div>`;
  }
}

function changePageCellLang(cellId, lang) {
  const cell = state.pageCells.find(c => c.id === cellId);
  if (cell) cell.language = lang;
  const view = state.cmInstances[`cell-${cellId}`];
  if (view) setEditorLang(view, lang);
}

function collectPageCells() {
  return state.pageCells.map(cell => {
    if (cell.type === 'text') {
      const q = state.quillInstances[`cell-${cell.id}`];
      return { type: 'text', content: getQuillHtml(q) };
    } else {
      const view = state.cmInstances[`cell-${cell.id}`];
      const sel  = document.querySelector(`#page-cell-${cell.id} .cm-lang-select`);
      return { type: 'code', content: getEditorValue(view), language: sel?.value || cell.language || 'javascript' };
    }
  });
}

// ── Step form helpers ─────────────────────────────────────────────────────────
function renderStepForm(step, index) {
  return `
    <div class="step-row" id="step-row-${index}">
      <div class="step-num">${String(index + 1).padStart(2, '0')}</div>
      <div class="step-inputs">
        <input type="text" class="step-input title" placeholder="Step title…" value="${esc(step.title || '')}" />
        <input type="text" class="step-input desc"  placeholder="Step description…" value="${esc(step.description || '')}" />
        <button class="step-code-toggle" id="step-code-toggle-${index}" onclick="app.toggleStepCode(${index})">▼ Add code</button>
        <div class="step-code-area" id="step-code-area-${index}">
          <div class="cm-wrapper" style="margin-top:4px"><div id="cm-step-${index}"></div></div>
        </div>
      </div>
      <button class="remove-step-btn" onclick="app.removeStep(${index})" title="Remove">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
}

function toggleStepCode(index) {
  const area = document.getElementById(`step-code-area-${index}`);
  const btn  = document.getElementById(`step-code-toggle-${index}`);
  if (!area) return;
  const isVisible = area.classList.toggle('visible');
  btn.textContent = isVisible ? '▲ Hide code' : '▼ Add code';
  if (isVisible && !state.cmInstances[`step-${index}`]) {
    const lang = (document.getElementById('algoLang') || document.getElementById('guideLang'))?.value || 'javascript';
    state.cmInstances[`step-${index}`] = createEditor(document.getElementById(`cm-step-${index}`), '', lang, '160px');
  }
}

function addStep() {
  const builder = document.getElementById('stepBuilder');
  if (!builder) return;
  const index = builder.querySelectorAll('.step-row').length;
  const div = document.createElement('div');
  div.innerHTML = renderStepForm({ title: '', description: '', code: '' }, index);
  builder.appendChild(div.firstElementChild);
  renumberSteps();
}

function removeStep(index) {
  document.getElementById(`step-row-${index}`)?.remove();
  if (state.cmInstances[`step-${index}`]) { state.cmInstances[`step-${index}`].destroy(); delete state.cmInstances[`step-${index}`]; }
  renumberSteps();
}

function renumberSteps() {
  document.querySelectorAll('#stepBuilder .step-row').forEach((row, i) => {
    row.id = `step-row-${i}`;
    const num = row.querySelector('.step-num'); if (num) num.textContent = String(i + 1).padStart(2, '00');
    row.querySelector('.remove-step-btn')?.setAttribute('onclick', `app.removeStep(${i})`);
    const tog = row.querySelector('.step-code-toggle');
    if (tog) { tog.id = `step-code-toggle-${i}`; tog.setAttribute('onclick', `app.toggleStepCode(${i})`); }
    const area = row.querySelector('.step-code-area'); if (area) area.id = `step-code-area-${i}`;
    const cmEl = row.querySelector('[id^="cm-step-"]'); if (cmEl) cmEl.id = `cm-step-${i}`;
  });
}

function renderChangelogEntryForm(entry, ei) {
  return `
    <div class="changelog-entry-form" id="cl-entry-${ei}">
      <div class="form-row" style="margin-bottom:6px">
        <div class="form-field" style="margin-bottom:0"><input type="text" class="form-input" placeholder="v1.2.3" value="${esc(entry.version || '')}"/></div>
        <div class="form-field" style="margin-bottom:0"><input type="text" class="form-input" placeholder="Date (e.g. Jan 2025)" value="${esc(entry.date || '')}"/></div>
        <button class="remove-step-btn" style="margin-top:0;flex-shrink:0" onclick="app.removeChangelogEntry(${ei})">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="change-rows" id="cl-changes-${ei}">
        ${(entry.changes || []).map((c, ci) => renderChangeRow(c, ei, ci)).join('')}
      </div>
      <button class="add-step-btn" style="margin-top:6px" onclick="app.addChangeRow(${ei})">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Change
      </button>
    </div>`;
}
function renderChangeRow(c, ei, ci) {
  return `<div class="change-row" id="cr-${ei}-${ci}">
    <select>
      <option value="added"   ${c.type==='added'  ?'selected':''}>Added</option>
      <option value="fixed"   ${c.type==='fixed'  ?'selected':''}>Fixed</option>
      <option value="removed" ${c.type==='removed'?'selected':''}>Removed</option>
      <option value="changed" ${c.type==='changed'?'selected':''}>Changed</option>
    </select>
    <input type="text" placeholder="Describe the change…" value="${esc(c.text || '')}" />
    <button class="remove-step-btn" style="width:24px;height:24px" onclick="this.closest('.change-row').remove()">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>`;
}
function addChangelogEntry() {
  const container = document.getElementById('changelogEntries');
  const index = container.querySelectorAll('.changelog-entry-form').length;
  const div = document.createElement('div');
  div.innerHTML = renderChangelogEntryForm({ version: '', date: '', changes: [] }, index);
  container.appendChild(div.firstElementChild);
}
function removeChangelogEntry(ei) { document.getElementById(`cl-entry-${ei}`)?.remove(); }
function addChangeRow(ei) {
  const container = document.getElementById(`cl-changes-${ei}`);
  if (!container) return;
  const ci = container.querySelectorAll('.change-row').length;
  const div = document.createElement('div');
  div.innerHTML = renderChangeRow({ type: 'added', text: '' }, ei, ci);
  container.appendChild(div.firstElementChild);
}

function changeCodeLang(key, lang) { const v = state.cmInstances[key]; if (v) setEditorLang(v, lang); }
function changeExampleLang(lang) {
  ['inputCode', 'outputCode'].forEach(k => { if (state.cmInstances[k]) setEditorLang(state.cmInstances[k], lang); });
}

// ── Collect & save ────────────────────────────────────────────────────────────
function collectFormData() {
  const type  = document.getElementById('docTypeFields').dataset.currentType;
  const title = document.getElementById('docTitle')?.value?.trim() || '';
  let content = '', metadata = {};

  switch (type) {
    case 'overview':
      content = getQuillHtml(state.quillInstances.overview);
      break;

    case 'code':
      content = getEditorValue(state.cmInstances.mainCode);
      metadata = {
        why:      getQuillHtml(state.quillInstances.why),
        how:      getQuillHtml(state.quillInstances.how),
        notes:    getQuillHtml(state.quillInstances.notes),
        language: document.getElementById('codeLang')?.value || 'javascript',
      };
      break;

    case 'example': {
      const lang = document.getElementById('exampleLang')?.value || 'javascript';
      content = getQuillHtml(state.quillInstances.desc);
      metadata = {
        language:       lang,
        inputCode:      getEditorValue(state.cmInstances.inputCode),
        outputCode:     getEditorValue(state.cmInstances.outputCode),
        expectedOutput: document.getElementById('docExpected')?.value || '',
      };
      break;
    }

    case 'changelog': {
      content = getQuillHtml(state.quillInstances.summary);
      const entries = [];
      document.querySelectorAll('.changelog-entry-form').forEach(el => {
        const inputs = el.querySelectorAll('input');
        const version = inputs[0]?.value || '', date = inputs[1]?.value || '';
        const changes = [];
        el.querySelectorAll('.change-row').forEach(row => {
          const sel = row.querySelector('select'), inp = row.querySelector('input');
          if (inp?.value?.trim()) changes.push({ type: sel?.value || 'added', text: inp.value.trim() });
        });
        if (version || changes.length) entries.push({ version, date, changes });
      });
      metadata = { entries };
      break;
    }

    case 'algorithm': {
      const lang = document.getElementById('algoLang')?.value || 'javascript';
      content = getQuillHtml(state.quillInstances.overview);
      const steps = [];
      document.querySelectorAll('#stepBuilder .step-row').forEach((row, i) => {
        const inputs = row.querySelectorAll('.step-input');
        const codeArea = document.getElementById(`step-code-area-${i}`);
        const code = (codeArea?.classList.contains('visible') && state.cmInstances[`step-${i}`])
          ? getEditorValue(state.cmInstances[`step-${i}`]) : '';
        steps.push({ title: inputs[0]?.value || '', description: inputs[1]?.value || '', code });
      });
      metadata = { steps, language: lang, timeComplexity: document.getElementById('timeComplexity')?.value || '', spaceComplexity: document.getElementById('spaceComplexity')?.value || '' };
      break;
    }

    case 'guide': {
      const lang = document.getElementById('guideLang')?.value || 'bash';
      content = getQuillHtml(state.quillInstances.intro);
      const steps = [];
      document.querySelectorAll('#stepBuilder .step-row').forEach((row, i) => {
        const inputs = row.querySelectorAll('.step-input');
        const codeArea = document.getElementById(`step-code-area-${i}`);
        const code = (codeArea?.classList.contains('visible') && state.cmInstances[`step-${i}`])
          ? getEditorValue(state.cmInstances[`step-${i}`]) : '';
        steps.push({ title: inputs[0]?.value || '', description: inputs[1]?.value || '', code });
      });
      metadata = { steps, language: lang, prerequisites: getQuillHtml(state.quillInstances.prereqs) };
      break;
    }

    case 'page':
      metadata = { cells: collectPageCells() };
      break;
  }

  return { title, type, content, metadata };
}

async function saveDocument() {
  const { title, type, content, metadata } = collectFormData();
  if (!title) { toast('Document title is required', 'error'); return; }
  const btn = document.getElementById('saveDocBtn');
  if (btn) btn.disabled = true;
  let res;
  if (state.editingDoc) {
    res = await api.put(`/api/documents/${state.editingDoc._id}`, { title, type, content, metadata });
  } else {
    res = await api.post('/api/documents', { repositoryId: state.currentRepo._id, title, type, content, metadata });
  }
  if (btn) btn.disabled = false;
  if (!res.success) { toast(res.error || 'Failed to save', 'error'); return; }
  toast(state.editingDoc ? 'Document updated!' : 'Document saved!', 'success');
  state.editingDoc = null;
  await viewRepository(state.currentRepo);
}

async function confirmDeleteDoc(docId, docTitle, e) {
  e?.stopPropagation();
  document.getElementById('confirmMessage').textContent = `Delete document "${docTitle}"? This cannot be undone.`;
  document.getElementById('confirmDeleteBtn').onclick = async () => {
    const res = await api.del(`/api/documents/${docId}`);
    if (!res.success) { toast('Failed', 'error'); return; }
    toast('Document deleted', 'success'); closeModal('confirmModal');
    await viewRepository(state.currentRepo);
  };
  openModal('confirmModal');
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function copyCode(btn) {
  const code = btn.closest('.code-block').querySelector('code');
  navigator.clipboard.writeText(code.textContent).then(() => {
    btn.textContent = 'Copied!'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
}

function highlightAll() {
  setTimeout(() => {
    document.querySelectorAll('pre code:not([data-highlighted])').forEach(block => hljs.highlightElement(block));
  }, 60);
}

function langOptions(selected) {
  return ALL_LANGS.map(l => `<option value="${l}" ${selected === l ? 'selected' : ''}>${l}</option>`).join('');
}

function docTypeInfo(type) {
  const map = { overview:{icon:'📋',label:'Overview'}, code:{icon:'💻',label:'Code'}, example:{icon:'🔬',label:'Example'}, changelog:{icon:'🔄',label:'Changelog'}, algorithm:{icon:'⚡',label:'Algorithm'}, guide:{icon:'📖',label:'Guide'}, page:{icon:'📄',label:'Page'} };
  return map[type] || { icon: '📄', label: type };
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function setContent(html) { document.getElementById('appContent').innerHTML = html; }
function openSidebarBtn() {
  return `<button class="open-sidebar-btn" onclick="app.toggleSidebar()" title="Toggle sidebar">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/></svg>
  </button>`;
}
function iconEdit()   { return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`; }
function iconDelete() { return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`; }

// ── Home ──────────────────────────────────────────────────────────────────────
function goHome() {
  destroyEditors(); state.currentProject = null; state.currentRepo = null;
  renderSidebarNav();
  setContent(`
    <div class="topbar">
      ${openSidebarBtn()}
      <div class="topbar-left"><div class="breadcrumb"><span class="breadcrumb-current">Home</span></div></div>
      <div class="topbar-right">
        <button class="btn-primary" onclick="app.openNewProject()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Project
        </button>
      </div>
    </div>
    <div class="welcome-screen">
      <div class="welcome-content">
        <div class="welcome-logo">D</div>
        <h1 class="welcome-title">DevDocs</h1>
        <p class="welcome-subtitle">Your engineering knowledge base.<br/>Clean, structured, always accessible.</p>
        <div class="welcome-actions">
          <button class="btn-primary" onclick="app.openNewProject()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Create a Project
          </button>
        </div>
        <div class="welcome-features">
          <div class="feature-pill">📋 Overviews</div>
          <div class="feature-pill">💻 Code Snippets</div>
          <div class="feature-pill">🔬 Examples</div>
          <div class="feature-pill">🔄 Changelogs</div>
          <div class="feature-pill">⚡ Algorithms</div>
          <div class="feature-pill">📖 Guides</div>
          <div class="feature-pill">📄 Pages</div>
        </div>
      </div>
    </div>`);
}

// ── Search ────────────────────────────────────────────────────────────────────
let searchTimer;
async function handleSearch(query) {
  clearTimeout(searchTimer);
  const resultsEl = document.getElementById('searchResults');
  if (!resultsEl) return;
  if (!query.trim()) { resultsEl.classList.remove('visible'); return; }
  searchTimer = setTimeout(async () => {
    const results = [];
    for (const project of state.projects) {
      const reposRes = await api.get(`/api/repositories/project/${project._id}`);
      for (const repo of (reposRes.data || [])) {
        const docsRes = await api.get(`/api/documents/repository/${repo._id}`);
        for (const doc of (docsRes.data || [])) {
          if (doc.title.toLowerCase().includes(query.toLowerCase()) || doc.content?.toLowerCase().includes(query.toLowerCase())) {
            results.push({ doc, repo, project });
          }
        }
      }
    }
    if (!results.length) {
      resultsEl.innerHTML = `<div style="padding:14px;text-align:center;color:var(--text4);font-size:0.79rem">No results found</div>`;
    } else {
      resultsEl.innerHTML = results.slice(0, 8).map(r => `
        <div class="search-result-item" onclick="app.navToRepo('${r.repo._id}','${r.project._id}')">
          <span class="doc-type-badge type-${r.doc.type}" style="font-size:0.6rem">${docTypeInfo(r.doc.type).icon}</span>
          <div>
            <div class="search-result-title">${esc(r.doc.title)}</div>
            <div class="search-result-meta">${esc(r.project.name)} › ${esc(r.repo.name)}</div>
          </div>
        </div>`).join('');
    }
    resultsEl.classList.add('visible');
  }, 300);
}

// ── Public API ────────────────────────────────────────────────────────────────
window.app = {
  goHome, toggleSidebar,
  openNewProject, openEditProject, saveProject, confirmDeleteProject, viewProject,
  getProject: () => state.currentProject, getRepo: () => state.currentRepo,
  toggleProjectNav, navToRepo,
  openNewRepo, openEditRepo, saveRepository, openRepo, confirmDeleteRepo,
  goToNewDoc, goToEditDoc, saveDocument, confirmDeleteDoc,
  toggleDoc, switchDocTab,
  switchEditorType,
  addStep, removeStep, toggleStepCode, renumberSteps,
  addChangelogEntry, removeChangelogEntry, addChangeRow,
  changeCodeLang, changeExampleLang,
  addPageCell, removePageCell, movePageCell, changePageCellLang,
  copyCode, closeModal,
};

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  document.getElementById('sidebarToggle').addEventListener('click', toggleSidebar);
  document.getElementById('btnNewProject').addEventListener('click', openNewProject);
  document.getElementById('emojiPicker').addEventListener('click', e => {
    const opt = e.target.closest('.emoji-option'); if (!opt) return;
    document.querySelectorAll('.emoji-option').forEach(el => el.classList.remove('selected'));
    opt.classList.add('selected'); state.selectedEmoji = opt.dataset.emoji;
  });
  document.getElementById('colorPicker').addEventListener('click', e => {
    const opt = e.target.closest('.color-option'); if (!opt) return;
    document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
    opt.classList.add('selected'); state.selectedColor = opt.dataset.color;
  });
  document.getElementById('modalOverlay').addEventListener('click', () => {
    document.querySelectorAll('.modal.active').forEach(m => { m.classList.remove('active'); setTimeout(() => { if (!m.classList.contains('active')) m.style.display = 'none'; }, 180); });
    document.getElementById('modalOverlay').classList.remove('active');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal.active').forEach(m => { m.classList.remove('active'); setTimeout(() => { if (!m.classList.contains('active')) m.style.display = 'none'; }, 180); });
      document.getElementById('modalOverlay').classList.remove('active');
    }
  });
  document.getElementById('globalSearch').addEventListener('input', e => handleSearch(e.target.value));
  document.addEventListener('click', e => {
    if (!e.target.closest('.sidebar-footer')) document.getElementById('searchResults')?.classList.remove('visible');
  });
  await loadProjects();
  goHome();
}

init();
