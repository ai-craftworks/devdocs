const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { v4: uuidv4 } = require('uuid');

// GET repos for a project
router.get('/project/:projectId', async (req, res) => {
  try {
    const repos = await db.repositories.findAsync({ projectId: req.params.projectId });
    repos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    for (const r of repos) {
      r.docCount = await db.documents.countAsync({ repositoryId: r._id });
    }

    res.json({ success: true, data: repos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single repo
router.get('/:id', async (req, res) => {
  try {
    const repo = await db.repositories.findOneAsync({ _id: req.params.id });
    if (!repo) return res.status(404).json({ success: false, error: 'Repository not found' });
    res.json({ success: true, data: repo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create repo
router.post('/', async (req, res) => {
  try {
    const { projectId, name, description, tags } = req.body;
    if (!projectId || !name?.trim()) return res.status(400).json({ success: false, error: 'projectId and name required' });

    const project = await db.projects.findOneAsync({ _id: projectId });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const repo = await db.repositories.insertAsync({
      _id: uuidv4(),
      projectId,
      name: name.trim(),
      description: description?.trim() || '',
      tags: tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, data: repo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update repo
router.put('/:id', async (req, res) => {
  try {
    const { name, description, tags } = req.body;
    await db.repositories.updateAsync(
      { _id: req.params.id },
      { $set: { name, description, tags, updatedAt: new Date().toISOString() } }
    );
    const updated = await db.repositories.findOneAsync({ _id: req.params.id });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE repo + its docs
router.delete('/:id', async (req, res) => {
  try {
    await db.documents.removeAsync({ repositoryId: req.params.id }, { multi: true });
    await db.repositories.removeAsync({ _id: req.params.id }, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
