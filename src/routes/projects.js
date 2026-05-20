const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { v4: uuidv4 } = require('uuid');

// GET all projects
router.get('/', async (req, res) => {
  try {
    const projects = await db.projects.findAsync({});
    projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    for (const p of projects) {
      p.repoCount = await db.repositories.countAsync({ projectId: p._id });
    }

    res.json({ success: true, data: projects });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET single project
router.get('/:id', async (req, res) => {
  try {
    const project = await db.projects.findOneAsync({ _id: req.params.id });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    res.json({ success: true, data: project });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create project
router.post('/', async (req, res) => {
  try {
    const { name, description, color, icon } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Name required' });

    const project = await db.projects.insertAsync({
      _id: uuidv4(),
      name: name.trim(),
      description: description?.trim() || '',
      color: color || '#6366f1',
      icon: icon || '📁',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, data: project });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update project
router.put('/:id', async (req, res) => {
  try {
    const { name, description, color, icon } = req.body;
    await db.projects.updateAsync(
      { _id: req.params.id },
      { $set: { name, description, color, icon, updatedAt: new Date().toISOString() } }
    );
    const updated = await db.projects.findOneAsync({ _id: req.params.id });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE project + its repos + docs
router.delete('/:id', async (req, res) => {
  try {
    const repos = await db.repositories.findAsync({ projectId: req.params.id });
    for (const repo of repos) {
      await db.documents.removeAsync({ repositoryId: repo._id }, { multi: true });
    }
    await db.repositories.removeAsync({ projectId: req.params.id }, { multi: true });
    await db.projects.removeAsync({ _id: req.params.id }, {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
