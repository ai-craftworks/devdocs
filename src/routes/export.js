const express = require('express');
const router  = express.Router();
const db      = require('../models/db');
const path    = require('path');
const fs      = require('fs');
const { ZipArchive } = require('archiver');

// ─── helpers ──────────────────────────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function docTypeLabel(type) {
  const m = { overview:'Overview', code:'Code', example:'Example',
    changelog:'Changelog', algorithm:'Algorithm', guide:'Guide', page:'Page' };
  return m[type] || type;
}

function docTypeIcon(type) {
  const m = { overview:'📋', code:'💻', example:'🔬',
    changelog:'🔄', algorithm:'⚡', guide:'📖', page:'📄' };
  return m[type] || '📄';
}

// ─── Markdown renderer ─────────────────────────────────────────────────────────

function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim();
}

function docToMarkdown(doc) {
  const lines = [];
  const m = doc.metadata || {};

  lines.push(`## ${doc.title}`);
  lines.push(`> **Type:** ${docTypeLabel(doc.type)}  |  **Updated:** ${new Date(doc.updatedAt).toLocaleDateString()}`);
  lines.push('');

  switch (doc.type) {
    case 'overview':
    case 'guide':
    case 'algorithm': {
      if (doc.content) lines.push(stripHtml(doc.content), '');
      if (doc.type === 'algorithm' || doc.type === 'guide') {
        const steps = m.steps || [];
        if (m.prerequisites) { lines.push(`**Prerequisites:** ${stripHtml(m.prerequisites)}`, ''); }
        steps.forEach((s, i) => {
          lines.push(`### Step ${i+1}: ${s.title || ''}`);
          if (s.description) lines.push(s.description, '');
          if (s.code) { lines.push('```' + (m.language||''), s.code, '```', ''); }
        });
        if (m.timeComplexity)  lines.push(`**Time Complexity:** \`${m.timeComplexity}\``);
        if (m.spaceComplexity) lines.push(`**Space Complexity:** \`${m.spaceComplexity}\``, '');
      }
      break;
    }
    case 'code': {
      if (m.why) lines.push(`**Why:** ${stripHtml(m.why)}`, '');
      if (m.how) lines.push(`**How to use:** ${stripHtml(m.how)}`, '');
      if (doc.content) { lines.push('```' + (m.language||''), doc.content, '```', ''); }
      if (m.notes) lines.push(`> 📝 ${stripHtml(m.notes)}`, '');
      break;
    }
    case 'example': {
      if (doc.content) lines.push(stripHtml(doc.content), '');
      if (m.inputCode)  { lines.push('**Input / Before:**', '```' + (m.language||''), m.inputCode, '```', ''); }
      if (m.outputCode) { lines.push('**Output / After:**', '```' + (m.language||''), m.outputCode, '```', ''); }
      if (m.expectedOutput) lines.push(`**Expected Result:** \`${m.expectedOutput}\``, '');
      break;
    }
    case 'changelog': {
      if (doc.content) lines.push(stripHtml(doc.content), '');
      (m.entries || []).forEach(e => {
        lines.push(`### ${e.version || 'v?'} — ${e.date || ''}`);
        (e.changes || []).forEach(c => {
          const sym = c.type === 'added' ? '+' : c.type === 'removed' ? '-' : c.type === 'fixed' ? '~' : '→';
          lines.push(`- \`${sym}\` ${c.text}`);
        });
        lines.push('');
      });
      break;
    }
    case 'page': {
      (m.cells || []).forEach(cell => {
        if (cell.type === 'text') {
          lines.push(stripHtml(cell.content), '');
        } else {
          lines.push('```' + (cell.language || ''), cell.content || '', '```', '');
        }
      });
      break;
    }
  }

  lines.push('---', '');
  return lines.join('\n');
}

// ─── HTML doc renderer (for static site & PDF) ────────────────────────────────

function docToHtml(doc) {
  const m = doc.metadata || {};

  function codeBlock(code, lang) {
    return `<div class="code-block"><div class="code-block-header"><span class="lang-label">${esc(lang||'')}</span></div><pre><code class="language-${esc(lang||'text')}">${esc(code)}</code></pre></div>`;
  }

  switch (doc.type) {
    case 'overview':
      return doc.content || '';

    case 'code':
      return `
        ${(m.why||m.how) ? `<div class="why-how">
          ${m.why ? `<div class="why-box"><strong>Why</strong>${m.why}</div>` : ''}
          ${m.how ? `<div class="how-box"><strong>How to use</strong>${m.how}</div>` : ''}
        </div>` : ''}
        ${doc.content ? codeBlock(doc.content, m.language) : ''}
        ${m.notes ? `<div class="notes-box"><strong>Notes</strong>${m.notes}</div>` : ''}`;

    case 'example':
      return `
        ${doc.content ? `<div class="prose">${doc.content}</div>` : ''}
        ${m.inputCode  ? `<div class="section-label">Input / Before</div>${codeBlock(m.inputCode,  m.language)}` : ''}
        ${m.outputCode ? `<div class="section-label">Output / After</div>${codeBlock(m.outputCode, m.language)}` : ''}
        ${m.expectedOutput ? `<div class="expected"><strong>Expected:</strong> <code>${esc(m.expectedOutput)}</code></div>` : ''}`;

    case 'changelog':
      return `
        ${doc.content ? `<div class="prose">${doc.content}</div>` : ''}
        ${(m.entries||[]).map(e => `
          <div class="cl-entry">
            <div class="cl-version">${esc(e.version||'')}</div>
            ${e.date ? `<span class="cl-date">${esc(e.date)}</span>` : ''}
            <ul>${(e.changes||[]).map(c => `<li class="change-${c.type}">${esc(c.text)}</li>`).join('')}</ul>
          </div>`).join('')}`;

    case 'algorithm': {
      const steps = m.steps || [];
      return `
        ${doc.content ? `<div class="prose">${doc.content}</div>` : ''}
        <div class="steps">${steps.map((s,i) => `
          <div class="step">
            <div class="step-num">${String(i+1).padStart(2,'0')}</div>
            <div class="step-body">
              ${s.title ? `<div class="step-title">${esc(s.title)}</div>` : ''}
              ${s.description ? `<div class="step-desc">${s.description}</div>` : ''}
              ${s.code ? codeBlock(s.code, m.language) : ''}
            </div>
          </div>`).join('')}</div>
        ${(m.timeComplexity||m.spaceComplexity) ? `<div class="complexity">
          ${m.timeComplexity  ? `<span class="badge">Time: <code>${esc(m.timeComplexity)}</code></span>`  : ''}
          ${m.spaceComplexity ? `<span class="badge">Space: <code>${esc(m.spaceComplexity)}</code></span>` : ''}
        </div>` : ''}`;
    }

    case 'guide': {
      const steps = m.steps || [];
      return `
        ${doc.content ? `<div class="prose">${doc.content}</div>` : ''}
        ${m.prerequisites ? `<div class="prereq-box"><strong>Prerequisites</strong>${m.prerequisites}</div>` : ''}
        <div class="steps guide-steps">${steps.map((s,i) => `
          <div class="step">
            <div class="step-num guide-num">${i+1}</div>
            <div class="step-body">
              ${s.title ? `<div class="step-title">${esc(s.title)}</div>` : ''}
              ${s.description ? `<div class="step-desc">${s.description}</div>` : ''}
              ${s.code ? codeBlock(s.code, m.language) : ''}
            </div>
          </div>`).join('')}</div>`;
    }

    case 'page':
      return (m.cells||[]).map(cell => {
        if (cell.type === 'text') return `<div class="page-text-cell">${cell.content||''}</div>`;
        return codeBlock(cell.content||'', cell.language);
      }).join('\n');

    default:
      return doc.content || '';
  }
}

// ─── Static site CSS ───────────────────────────────────────────────────────────

const SITE_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f8f9fb;--bg2:#fff;--bg3:#f1f3f7;--bg4:#e8ecf2;
  --border:#e2e6ed;--border2:#d0d7e2;
  --text:#111827;--text2:#374151;--text3:#6b7280;--text4:#9ca3af;
  --accent:#4f46e5;--accent2:#6366f1;--accent-bg:#eef2ff;--accent-border:#c7d2fe;
  --green:#059669;--green-bg:#ecfdf5;--yellow:#d97706;--yellow-bg:#fffbeb;
  --red:#dc2626;--blue:#2563eb;--blue-bg:#eff6ff;
  --purple:#7c3aed;--teal:#0d9488;
  --sidebar:260px;--font:'Inter',system-ui,sans-serif;--mono:'JetBrains Mono','Fira Code',monospace;
  --radius:8px;--shadow:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);
  --shadow-md:0 4px 12px rgba(0,0,0,.08);
}
html{font-size:15px}
body{font-family:var(--font);background:var(--bg);color:var(--text);display:flex;min-height:100vh;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}

/* ── Layout ── */
.sidebar{
  width:var(--sidebar);min-width:var(--sidebar);height:100vh;
  position:sticky;top:0;overflow-y:auto;
  background:var(--bg2);border-right:1px solid var(--border);
  display:flex;flex-direction:column;flex-shrink:0;
}
.main{flex:1;min-width:0;overflow-y:auto;height:100vh}

/* ── Sidebar ── */
.sidebar-brand{
  display:flex;align-items:center;gap:10px;
  padding:18px 16px 14px;border-bottom:1px solid var(--border);
}
.brand-icon{
  width:32px;height:32px;background:var(--accent);border-radius:8px;
  display:flex;align-items:center;justify-content:center;
  color:#fff;font-weight:700;font-size:15px;flex-shrink:0;
}
.brand-name{font-weight:700;font-size:1rem;letter-spacing:-.02em;color:var(--text)}
.brand-sub{font-size:.72rem;color:var(--text4);margin-top:1px}

.sidebar-section{padding:14px 12px 6px}
.sidebar-section-label{
  font-size:.62rem;font-weight:700;letter-spacing:.1em;
  text-transform:uppercase;color:var(--text4);padding:0 4px;margin-bottom:6px;
}

.repo-group{margin-bottom:4px}
.repo-group-header{
  display:flex;align-items:center;gap:7px;
  padding:7px 8px;border-radius:6px;cursor:pointer;
  font-size:.78rem;font-weight:600;color:var(--text2);
  transition:background .12s;user-select:none;
}
.repo-group-header:hover{background:var(--bg3)}
.repo-group-header.active{background:var(--accent-bg);color:var(--accent)}
.repo-chevron{margin-left:auto;color:var(--text4);transition:transform .18s;font-size:.7rem}
.repo-group-header.open .repo-chevron{transform:rotate(90deg)}

.doc-links{display:none;padding:2px 0 4px 22px}
.doc-links.visible{display:block}
.doc-link{
  display:flex;align-items:center;gap:6px;
  padding:5px 8px;border-radius:5px;
  font-size:.73rem;color:var(--text3);
  transition:background .1s,color .1s;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;
}
.doc-link:hover{background:var(--bg3);color:var(--text)}
.doc-link.active{background:var(--accent-bg);color:var(--accent);font-weight:600}
.doc-link-icon{flex-shrink:0;font-size:.75rem}

/* ── Content ── */
.content{max-width:900px;margin:0 auto;padding:40px 40px 80px}
.content-header{margin-bottom:36px;padding-bottom:24px;border-bottom:1px solid var(--border)}
.project-badge{
  display:inline-flex;align-items:center;gap:6px;
  font-size:.72rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
  color:var(--text4);margin-bottom:12px;
}
.page-title{font-size:2rem;font-weight:800;letter-spacing:-.03em;color:var(--text);margin-bottom:8px}
.page-desc{font-size:.9rem;color:var(--text3);line-height:1.6}

/* ── Repo overview cards ── */
.repo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-top:28px}
.repo-card{
  background:var(--bg2);border:1px solid var(--border);border-radius:12px;
  padding:20px;transition:border-color .15s,box-shadow .15s,transform .12s;
  cursor:pointer;
}
.repo-card:hover{border-color:var(--accent-border);box-shadow:var(--shadow-md);transform:translateY(-1px)}
.repo-card-icon{font-size:1.4rem;margin-bottom:10px}
.repo-card-name{font-weight:700;font-size:.92rem;margin-bottom:5px}
.repo-card-desc{font-size:.78rem;color:var(--text3);line-height:1.5}
.repo-card-meta{margin-top:12px;font-size:.7rem;color:var(--text4)}

/* ── Doc section ── */
.doc-section{
  background:var(--bg2);border:1px solid var(--border);border-radius:12px;
  overflow:visible;margin-bottom:16px;
}
.doc-section-header{
  display:flex;align-items:center;gap:10px;padding:14px 18px;
  border-bottom:1px solid var(--border);background:var(--bg2);
  border-radius:12px 12px 0 0;
}
.type-badge{
  display:inline-flex;align-items:center;gap:4px;
  font-size:.62rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  padding:2px 7px;border-radius:4px;flex-shrink:0;
}
.type-overview  {background:var(--accent-bg);color:var(--accent);border:1px solid var(--accent-border)}
.type-code      {background:var(--green-bg);color:var(--green);border:1px solid #a7f3d0}
.type-example   {background:var(--yellow-bg);color:var(--yellow);border:1px solid #fde68a}
.type-changelog {background:var(--blue-bg);color:var(--blue);border:1px solid #bfdbfe}
.type-algorithm {background:#fdf4ff;color:var(--purple);border:1px solid #e9d5ff}
.type-guide     {background:#f0fdfa;color:var(--teal);border:1px solid #99f6e4}
.type-page      {background:#f5f3ff;color:#6d28d9;border:1px solid #ddd6fe}

.doc-title-text{font-weight:700;font-size:.95rem;color:var(--text)}
.doc-section-body{padding:20px 22px}

/* ── Prose ── */
.prose{font-size:.87rem;line-height:1.75;color:var(--text2)}
.prose h1{font-size:1.4rem;font-weight:700;margin:14px 0 7px;color:var(--text)}
.prose h2{font-size:1.15rem;font-weight:700;margin:12px 0 6px;color:var(--text)}
.prose h3{font-size:1rem;font-weight:600;margin:10px 0 5px;color:var(--text)}
.prose ul,.prose ol{padding-left:1.5em;margin:6px 0}
.prose p{margin-bottom:6px}
.prose code{background:var(--bg3);border-radius:3px;padding:1px 5px;font-family:var(--mono);font-size:.82em;color:var(--accent)}
.prose blockquote{border-left:3px solid var(--accent-border);background:var(--accent-bg);padding:6px 12px;border-radius:0 6px 6px 0;margin:8px 0;color:var(--text2)}

/* ── Code blocks ── */
.code-block{border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin:10px 0;background:#f6f8fa}
.code-block-header{display:flex;align-items:center;justify-content:space-between;background:var(--bg3);padding:6px 12px;border-bottom:1px solid var(--border)}
.lang-label{font-family:var(--mono);font-size:.62rem;color:var(--text4);text-transform:uppercase;letter-spacing:.08em;font-weight:600}
.code-block pre{margin:0;padding:0;overflow-x:auto;background:#f6f8fa}
.code-block pre code{display:block;padding:16px 18px;font-size:.79rem;line-height:1.75;font-family:var(--mono);white-space:pre;background:#f6f8fa;color:#24292f;tab-size:2}

/* hljs tokens */
.hljs-keyword,.hljs-type,.hljs-variable.language_{color:#cf222e}
.hljs-title,.hljs-title.function_{color:#8250df}
.hljs-attr,.hljs-number,.hljs-operator{color:#0550ae}
.hljs-string,.hljs-meta .hljs-string{color:#0a3069}
.hljs-built_in,.hljs-symbol{color:#953800}
.hljs-comment,.hljs-formula{color:#6e7781;font-style:italic}
.hljs-name,.hljs-selector-tag{color:#116329}
.hljs-addition{color:#116329;display:block;width:100%;margin:0 -18px;padding:0 18px;background:#dafbe1}
.hljs-deletion{color:#82071e;display:block;width:100%;margin:0 -18px;padding:0 18px;background:#ffebe9}

/* ── Why/How boxes ── */
.why-how{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
.why-box,.how-box{border-radius:var(--radius);padding:13px 15px;font-size:.83rem;line-height:1.6}
.why-box{background:var(--yellow-bg);border-left:3px solid var(--yellow)}
.how-box{background:var(--green-bg);border-left:3px solid var(--green)}
.why-box strong,.how-box strong{display:block;font-size:.62rem;letter-spacing:.09em;text-transform:uppercase;margin-bottom:5px}
.why-box strong{color:var(--yellow)}
.how-box strong{color:var(--green)}
.notes-box{background:var(--accent-bg);border:1px solid var(--accent-border);border-radius:var(--radius);padding:11px 14px;margin-top:10px;font-size:.83rem;line-height:1.6}
.notes-box strong{display:block;color:var(--accent);font-size:.62rem;letter-spacing:.09em;text-transform:uppercase;margin-bottom:3px}
.prereq-box{background:var(--yellow-bg);border-left:3px solid var(--yellow);border-radius:0 var(--radius) var(--radius) 0;padding:11px 14px;margin-bottom:14px;font-size:.83rem}
.prereq-box strong{display:block;color:var(--yellow);font-size:.62rem;letter-spacing:.09em;text-transform:uppercase;margin-bottom:3px}

/* ── Steps ── */
.steps{display:flex;flex-direction:column;gap:14px;margin:10px 0}
.step{display:flex;gap:14px;align-items:flex-start}
.step-num{
  width:26px;height:26px;border-radius:50%;flex-shrink:0;margin-top:1px;
  display:flex;align-items:center;justify-content:center;
  font-size:.65rem;font-weight:700;font-family:var(--mono);
  background:var(--accent-bg);border:1.5px solid var(--accent-border);color:var(--accent);
}
.guide-num{background:#f0fdfa;border-color:#99f6e4;color:var(--teal)}
.step-body{flex:1}
.step-title{font-weight:700;font-size:.88rem;margin-bottom:3px;color:var(--text)}
.step-desc{font-size:.82rem;color:var(--text3);line-height:1.6;margin-bottom:6px}
.complexity{display:flex;gap:9px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
.badge{background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:5px 11px;font-size:.77rem}
.badge code{font-family:var(--mono);font-weight:700;color:var(--purple)}

/* ── Changelog ── */
.cl-entry{margin-bottom:18px}
.cl-version{display:inline-block;font-family:var(--mono);font-size:.72rem;font-weight:700;color:var(--accent);background:var(--accent-bg);border:1px solid var(--accent-border);border-radius:4px;padding:2px 8px;margin-bottom:6px}
.cl-date{font-size:.7rem;color:var(--text4);margin-left:8px}
.cl-entry ul{list-style:none;padding:0}
.cl-entry li{font-size:.82rem;color:var(--text2);padding:3px 0 3px 16px;position:relative;line-height:1.5}
.cl-entry li::before{position:absolute;left:0;color:var(--text4);content:'→'}
.change-added::before{color:var(--green)!important;content:'+'!important}
.change-fixed::before{color:var(--yellow)!important;content:'~'!important}
.change-removed::before{color:var(--red)!important;content:'-'!important}

/* ── Example ── */
.section-label{font-size:.65rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--text4);margin:14px 0 6px}
.expected{background:var(--green-bg);border:1px solid #a7f3d0;border-radius:var(--radius);padding:10px 14px;font-size:.82rem;margin-top:8px}
.expected code{font-family:var(--mono);color:var(--green);font-weight:600}

/* ── Page cells ── */
.page-text-cell{font-size:.87rem;line-height:1.75;color:var(--text2);margin-bottom:10px}
.page-text-cell h1{font-size:1.3rem;font-weight:700;margin:10px 0 6px;color:var(--text)}
.page-text-cell h2{font-size:1.1rem;font-weight:700;margin:8px 0 5px;color:var(--text)}
.page-text-cell h3{font-size:.97rem;font-weight:600;margin:6px 0 4px;color:var(--text)}
.page-text-cell ul,.page-text-cell ol{padding-left:1.5em;margin:4px 0}
.page-text-cell blockquote{border-left:3px solid var(--accent-border);background:var(--accent-bg);padding:5px 10px;border-radius:0 6px 6px 0;margin:6px 0;color:var(--text2)}
.page-text-cell code{background:var(--bg3);border-radius:3px;padding:1px 4px;font-family:var(--mono);font-size:.82em;color:var(--accent)}

/* ── Project home ── */
.home-hero{padding:48px 40px 32px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,#f8f9fb,#eef2ff)}
.hero-icon{font-size:2.5rem;margin-bottom:14px}
.hero-title{font-size:2.2rem;font-weight:800;letter-spacing:-.04em;margin-bottom:8px}
.hero-desc{font-size:.92rem;color:var(--text3);line-height:1.65}
.home-body{padding:32px 40px 60px}
.section-heading{font-size:1.1rem;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px}
.section-heading::after{content:'';flex:1;height:1px;background:var(--border)}

/* ── Repo page heading ── */
.repo-header{
  padding:32px 40px 24px;border-bottom:1px solid var(--border);
  background:var(--bg2);
}
.repo-back{display:inline-flex;align-items:center;gap:5px;font-size:.75rem;font-weight:600;color:var(--text4);margin-bottom:12px;cursor:pointer;transition:color .12s}
.repo-back:hover{color:var(--accent)}
.repo-title{font-size:1.6rem;font-weight:800;letter-spacing:-.03em;margin-bottom:5px;display:flex;align-items:center;gap:10px}
.repo-title svg{color:var(--accent)}
.repo-desc{font-size:.83rem;color:var(--text3)}
.repo-tags{display:flex;gap:5px;margin-top:10px;flex-wrap:wrap}
.repo-tag{font-size:.65rem;padding:2px 8px;border-radius:10px;background:var(--bg3);color:var(--text3);border:1px solid var(--border);font-weight:500}
.repo-stats{display:flex;gap:20px;margin-top:16px}
.repo-stat{font-size:.75rem;color:var(--text4)}
.repo-stat strong{color:var(--text);font-weight:700}
.doc-sections{padding:28px 40px 60px}

/* ── Nav toggle script targets ── */
.repo-group-header.active+.doc-links{display:block}

/* ── Print/PDF ── */
@media print{
  .sidebar{display:none}
  .main{height:auto;overflow:visible}
  .content,.doc-sections,.home-body,.home-hero,.repo-header{padding:0}
  .doc-section{border:1px solid #ddd;page-break-inside:avoid;margin-bottom:20px}
  .code-block pre code{font-size:11px}
}

/* ── Mobile ── */
@media(max-width:768px){
  body{flex-direction:column}
  .sidebar{width:100%;height:auto;position:relative;min-width:unset}
  .main{height:auto;overflow:visible}
  .why-how{grid-template-columns:1fr}
  .content,.doc-sections,.home-body{padding:20px}
  .home-hero{padding:28px 20px 20px}
  .repo-header{padding:20px}
}
`;

// ─── Static site JS (sidebar toggle) ─────────────────────────────────────────

const SITE_JS = `
document.querySelectorAll('.repo-group-header').forEach(hdr => {
  hdr.addEventListener('click', () => {
    const links = hdr.nextElementSibling;
    const isOpen = links.classList.contains('visible');
    // close all
    document.querySelectorAll('.doc-links.visible').forEach(el => el.classList.remove('visible'));
    document.querySelectorAll('.repo-group-header.open').forEach(el => {el.classList.remove('open');el.classList.remove('active');});
    if (!isOpen) {
      links.classList.add('visible');
      hdr.classList.add('open','active');
    }
  });
});
// Highlight active doc link on scroll
const sections = document.querySelectorAll('[data-doc-id]');
const links    = document.querySelectorAll('.doc-link[data-target]');
if (sections.length) {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l => l.classList.toggle('active', l.dataset.target === e.target.dataset.docId));
      }
    });
  }, { threshold: 0.2 });
  sections.forEach(s => obs.observe(s));
}
`;

// ─── Build full project data ──────────────────────────────────────────────────

async function loadProjectData(projectId) {
  const project = await db.projects.findOneAsync({ _id: projectId });
  if (!project) return null;
  const repos = await db.repositories.findAsync({ projectId });
  repos.sort((a, b) => a.name.localeCompare(b.name));
  for (const repo of repos) {
    const docs = await db.documents.findAsync({ repositoryId: repo._id });
    docs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    repo.docs = docs;
  }
  project.repos = repos;
  return project;
}

// ─── Generate index.html for static site ─────────────────────────────────────

function buildProjectIndex(project) {
  const repoCards = project.repos.map(r => `
    <a href="${slug(r.name)}.html" class="repo-card">
      <div class="repo-card-icon">🗂️</div>
      <div class="repo-card-name">${esc(r.name)}</div>
      <div class="repo-card-desc">${esc(r.description || 'No description')}</div>
      <div class="repo-card-meta">${r.docs.length} document${r.docs.length !== 1 ? 's' : ''}</div>
    </a>`).join('');

  const sidebarRepos = project.repos.map(r => `
    <div class="repo-group">
      <div class="repo-group-header">
        <span>🗂️</span><span>${esc(r.name)}</span><span class="repo-chevron">▶</span>
      </div>
      <div class="doc-links">
        ${r.docs.map(d => `<a class="doc-link" href="${slug(r.name)}.html#doc-${d._id}"><span class="doc-link-icon">${docTypeIcon(d.type)}</span>${esc(d.title)}</a>`).join('')}
      </div>
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(project.name)} — DevDocs</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="assets/site.css"/>
</head>
<body>
<aside class="sidebar">
  <div class="sidebar-brand">
    <div class="brand-icon">D</div>
    <div><div class="brand-name">DevDocs</div><div class="brand-sub">${esc(project.name)}</div></div>
  </div>
  <div class="sidebar-section">
    <div class="sidebar-section-label">Repositories</div>
    ${sidebarRepos}
  </div>
</aside>
<main class="main">
  <div class="home-hero">
    <div class="hero-icon">${project.icon}</div>
    <div class="hero-title">${esc(project.name)}</div>
    ${project.description ? `<div class="hero-desc">${esc(project.description)}</div>` : ''}
  </div>
  <div class="home-body">
    <div class="section-heading">Repositories</div>
    <div class="repo-grid">${repoCards}</div>
  </div>
</main>
<script src="assets/site.js"></script>
</body>
</html>`;
}

// ─── Generate repo page ───────────────────────────────────────────────────────

function buildRepoPage(project, repo, allRepos) {
  const sidebarRepos = allRepos.map(r => `
    <div class="repo-group">
      <div class="repo-group-header ${r._id === repo._id ? 'open active' : ''}">
        <span>🗂️</span><span>${esc(r.name)}</span><span class="repo-chevron">▶</span>
      </div>
      <div class="doc-links ${r._id === repo._id ? 'visible' : ''}">
        ${r.docs.map(d => `<a class="doc-link" href="${slug(r.name)}.html#doc-${d._id}" data-target="${d._id}"><span class="doc-link-icon">${docTypeIcon(d.type)}</span>${esc(d.title)}</a>`).join('')}
      </div>
    </div>`).join('');

  const docSections = repo.docs.map(doc => `
    <div class="doc-section" id="doc-${doc._id}" data-doc-id="${doc._id}">
      <div class="doc-section-header">
        <span class="type-badge type-${doc.type}">${docTypeIcon(doc.type)} ${docTypeLabel(doc.type)}</span>
        <span class="doc-title-text">${esc(doc.title)}</span>
      </div>
      <div class="doc-section-body">${docToHtml(doc)}</div>
    </div>`).join('');

  const tags = (repo.tags || []).map(t => `<span class="repo-tag">${esc(t)}</span>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(repo.name)} — ${esc(project.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="assets/site.css"/>
</head>
<body>
<aside class="sidebar">
  <div class="sidebar-brand">
    <a href="index.html" class="sidebar-brand">
      <div class="brand-icon">D</div>
      <div><div class="brand-name">DevDocs</div><div class="brand-sub">${esc(project.name)}</div></div>
    </a>
  </div>
  <div class="sidebar-section">
    <div class="sidebar-section-label">Repositories</div>
    ${sidebarRepos}
  </div>
</aside>
<main class="main">
  <div class="repo-header">
    <a class="repo-back" href="index.html">← ${esc(project.name)}</a>
    <div class="repo-title">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M8 9h8M8 13h6"/></svg>
      ${esc(repo.name)}
    </div>
    ${repo.description ? `<div class="repo-desc">${esc(repo.description)}</div>` : ''}
    ${tags ? `<div class="repo-tags">${tags}</div>` : ''}
    <div class="repo-stats">
      <span class="repo-stat"><strong>${repo.docs.length}</strong> documents</span>
    </div>
  </div>
  <div class="doc-sections">${docSections || '<p style="color:var(--text4);font-size:.85rem">No documents in this repository.</p>'}</div>
</main>
<script src="assets/site.js"></script>
</body>
</html>`;
}

// ─── EXPORT: Static site ZIP ──────────────────────────────────────────────────

router.get('/project/:projectId/site', async (req, res) => {
  try {
    const project = await loadProjectData(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${slug(project.name)}-docs.zip"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on('error', err => { throw err; });
    archive.pipe(res);

    // assets
    archive.append(SITE_CSS, { name: `${slug(project.name)}/assets/site.css` });
    archive.append(SITE_JS,  { name: `${slug(project.name)}/assets/site.js`  });

    // index
    archive.append(buildProjectIndex(project), { name: `${slug(project.name)}/index.html` });

    // one page per repo
    for (const repo of project.repos) {
      archive.append(buildRepoPage(project, repo, project.repos), { name: `${slug(project.name)}/${slug(repo.name)}.html` });
    }

    await archive.finalize();
  } catch (err) {
    console.error('Site export error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
});

// ─── EXPORT: Repository Markdown ─────────────────────────────────────────────

router.get('/repository/:repoId/markdown', async (req, res) => {
  try {
    const repo = await db.repositories.findOneAsync({ _id: req.params.repoId });
    if (!repo) return res.status(404).json({ success: false, error: 'Repository not found' });
    const docs = await db.documents.findAsync({ repositoryId: repo._id });
    docs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const lines = [];
    lines.push(`# ${repo.name}`);
    if (repo.description) lines.push('', repo.description);
    if (repo.tags?.length) lines.push('', `**Tags:** ${repo.tags.join(', ')}`);
    lines.push('', `*Generated by DevDocs on ${new Date().toLocaleDateString()}*`, '', '---', '');

    // Table of contents
    lines.push('## Table of Contents', '');
    docs.forEach((doc, i) => { lines.push(`${i + 1}. [${doc.title}](#${slug(doc.title)})`); });
    lines.push('', '---', '');

    // Documents
    docs.forEach(doc => { lines.push(docToMarkdown(doc)); });

    const md = lines.join('\n');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug(repo.name)}.md"`);
    res.send(md);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── EXPORT: Repository PDF (via HTML print page) ────────────────────────────

router.get('/repository/:repoId/pdf', async (req, res) => {
  try {
    const repo = await db.repositories.findOneAsync({ _id: req.params.repoId });
    if (!repo) return res.status(404).json({ success: false, error: 'Repository not found' });
    const project = await db.projects.findOneAsync({ _id: repo.projectId });
    const docs = await db.documents.findAsync({ repositoryId: repo._id });
    docs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const tags = (repo.tags || []).map(t => `<span class="repo-tag">${esc(t)}</span>`).join('');

    const docSections = docs.map(doc => `
      <div class="doc-section" style="page-break-inside:avoid">
        <div class="doc-section-header">
          <span class="type-badge type-${doc.type}">${docTypeIcon(doc.type)} ${docTypeLabel(doc.type)}</span>
          <span class="doc-title-text">${esc(doc.title)}</span>
        </div>
        <div class="doc-section-body">${docToHtml(doc)}</div>
      </div>`).join('');

    // Serve a print-ready HTML page; browser/user prints it to PDF
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${esc(repo.name)} — ${esc(project?.name || '')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
${SITE_CSS}
/* Print-page specifics */
body{display:block;background:#fff}
.print-header{padding:32px 40px 24px;border-bottom:2px solid var(--border);margin-bottom:28px}
.print-project{font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text4);margin-bottom:8px}
.print-title{font-size:2rem;font-weight:800;letter-spacing:-.03em;margin-bottom:6px}
.print-desc{font-size:.87rem;color:var(--text3);margin-bottom:10px}
.print-meta{font-size:.72rem;color:var(--text4)}
.doc-sections{padding:0 40px 60px}
.doc-section{margin-bottom:20px;border:1px solid var(--border);border-radius:10px;overflow:hidden;page-break-inside:avoid}
@media print{
  @page{margin:15mm 12mm;size:A4}
  body{font-size:12px}
  .no-print{display:none}
  .doc-section{page-break-inside:avoid;border:1px solid #ddd}
  .code-block pre code{font-size:10px;line-height:1.5}
  .why-how{grid-template-columns:1fr}
}
</style>
</head>
<body>
<div class="print-header">
  ${project ? `<div class="print-project">${esc(project.name)}</div>` : ''}
  <div class="print-title">${esc(repo.name)}</div>
  ${repo.description ? `<div class="print-desc">${esc(repo.description)}</div>` : ''}
  ${tags ? `<div class="repo-tags" style="margin-bottom:10px">${tags}</div>` : ''}
  <div class="print-meta">Generated ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})} · ${docs.length} document${docs.length !== 1 ? 's' : ''}</div>
</div>
<div class="no-print" style="background:var(--accent-bg);border:1px solid var(--accent-border);border-radius:8px;padding:12px 20px;margin:0 40px 24px;display:flex;align-items:center;justify-content:space-between">
  <span style="font-size:.82rem;color:var(--accent);font-weight:600">Press <kbd style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-family:var(--mono);font-size:.8em">Ctrl+P</kbd> (or <kbd style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-family:var(--mono);font-size:.8em">⌘P</kbd>) to save as PDF</span>
  <button onclick="window.print()" style="background:var(--accent);color:#fff;border:none;border-radius:6px;padding:7px 16px;font-family:var(--font-sans);font-size:.78rem;font-weight:600;cursor:pointer">Print / Save PDF</button>
</div>
<div class="doc-sections">${docSections || '<p style="color:var(--text4);padding:0 40px">No documents.</p>'}</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
